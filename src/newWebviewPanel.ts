import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { parse, HTMLElement } from 'node-html-parser'
import { convert } from 'html-to-text'
import { getNewWebviewContent } from './newWebviewContent'
import { fetchHtml } from './http'
import { ensureBrowserPath } from './browserHelper'
import type { WebviewMessage, ExtensionMessage, TreeNode, DirectoryItem, IBookTreeItem } from './types'

// ─── DOM 解析工具（参考 DEMO domParser.ts） ───

function getAbsoluteUrl(href: string, baseUrl: string): string {
  if (!href) return ''
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}

function buildSelector(element: HTMLElement, root: HTMLElement): string {
  const pathSegments: string[] = []
  let current: HTMLElement | null = element

  while (current && current !== root) {
    const tagName = current.tagName.toLowerCase()
    const parent = current.parentNode as HTMLElement | null

    if (parent) {
      const directChildren = parent.childNodes.filter(
        (n): n is HTMLElement => n instanceof HTMLElement && n.tagName.toLowerCase() === tagName
      )
      if (directChildren.length > 1) {
        const index = directChildren.indexOf(current) + 1
        pathSegments.unshift(`${tagName}:nth-of-type(${index})`)
      } else {
        pathSegments.unshift(tagName)
      }
    } else {
      pathSegments.unshift(tagName)
    }
    current = parent
  }

  return pathSegments.join(' > ')
}

function elementToTreeNode(
  element: HTMLElement,
  root: HTMLElement,
  depth: number,
  maxDepth: number
): TreeNode | null {
  if (depth > maxDepth) return null
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') return null

  const attributes: Record<string, string> = {}
  const rawAttrs = element.rawAttrs || ''
  const attrRegex = /([\w-]+)(?:\s*=\s*"([^"]*)")?/g
  let match
  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    attributes[match[1]] = match[2] || ''
  }

  const textContent = (element.textContent || '').trim().substring(0, 100)

  const children: TreeNode[] = []
  if (depth < maxDepth) {
    for (const child of element.childNodes) {
      if (child instanceof HTMLElement) {
        const childNode = elementToTreeNode(child, root, depth + 1, maxDepth)
        if (childNode) children.push(childNode)
      }
    }
  }

  return {
    tagName,
    selector: buildSelector(element, root),
    attributes,
    textContent,
    children,
    expanded: false,
    phaseActions: [],
  }
}

function parseHtmlToTree(html: string, maxDepth: number = 6): TreeNode[] {
  const root = parse(html)
  const body = root.querySelector('body')
  const container = body || root

  const trees: TreeNode[] = []
  for (const child of container.childNodes) {
    if (child instanceof HTMLElement) {
      const node = elementToTreeNode(child, container, 0, maxDepth)
      if (node) trees.push(node)
    }
  }
  return trees
}

function extractDirectoryItems(html: string, selector: string, pageUrl: string): DirectoryItem[] {
  const root = parse(html)
  const selectedElement = root.querySelector(selector)
  if (!selectedElement) return []

  const parent = selectedElement.parentNode as HTMLElement
  const links = parent.querySelectorAll('a')

  const items: DirectoryItem[] = []
  const seen = new Set<string>()

  for (const link of links) {
    const href = link.getAttribute('href') || ''
    if (!href) continue

    const title = link.getAttribute('title') || link.textContent?.trim() || ''
    if (!title) continue

    const absoluteLink = getAbsoluteUrl(href, pageUrl)
    if (!absoluteLink || seen.has(absoluteLink)) continue
    seen.add(absoluteLink)

    items.push({ title, link: absoluteLink })
  }

  return items
}

function extractContent(html: string, selector: string): string {
  const root = parse(html)
  const element = root.querySelector(selector)
  if (!element) return ''

  const rawHtml = element.innerHTML?.trim() || ''
  return convert(rawHtml, {
    wordwrap: 80,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  })
}

function extractPaginationLinks(html: string, selector: string, pageUrl: string): string[] {
  const root = parse(html)
  const element = root.querySelector(selector)
  if (!element) return []

  const links: string[] = []
  const seen = new Set<string>()

  if (element.tagName.toLowerCase() === 'a') {
    const href = element.getAttribute('href') || ''
    const absoluteLink = getAbsoluteUrl(href, pageUrl)
    if (absoluteLink && !seen.has(absoluteLink)) {
      seen.add(absoluteLink)
      links.push(absoluteLink)
    }
  } else {
    const aTags = element.querySelectorAll('a')
    for (const a of aTags) {
      const href = a.getAttribute('href') || ''
      if (!href) continue
      const absoluteLink = getAbsoluteUrl(href, pageUrl)
      if (absoluteLink && !seen.has(absoluteLink)) {
        seen.add(absoluteLink)
        links.push(absoluteLink)
      }
    }
  }

  return links
}

// ─── Webview 面板 ───

export function showNewConfigPanel(context: vscode.ExtensionContext, existingConfig?: IBookTreeItem) {
  const panel = vscode.window.createWebviewPanel(
    'lbook.newConfig',
    existingConfig ? `编辑：${existingConfig.title}` : '新版配置',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  )

  panel.webview.html = getNewWebviewContent()

  const htmlCache = new Map<string, string>()

  // 如果有已有配置，加载到 webview
  if (existingConfig) {
    const simpleConfig = {
      title: existingConfig.title,
      link: existingConfig.link,
      catalogSelector: existingConfig.catalogSelector,
      contentSelector: existingConfig.contentSelector,
      paginationSelector: existingConfig.paginationSelector,
      items: existingConfig.catalog.map(c => ({ title: c.title, link: c.link })),
    }
    panel.webview.postMessage({ type: 'config-loaded', config: simpleConfig } as ExtensionMessage)
  }

  panel.webview.onDidReceiveMessage(
    async (message: WebviewMessage) => {
      try {
        await handleMessage(context, panel, message, htmlCache, existingConfig)
      } catch (err: any) {
        panel.webview.postMessage({ type: 'error', message: err.message } as ExtensionMessage)
        vscode.window.showErrorMessage(`操作失败：${err.message}`)
      }
    },
    undefined,
    context.subscriptions
  )

  panel.onDidDispose(() => {
    htmlCache.clear()
  }, null, context.subscriptions)
}

async function handleMessage(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  message: WebviewMessage,
  htmlCache: Map<string, string>,
  existingConfig?: IBookTreeItem
) {
  const post = (msg: ExtensionMessage) => panel.webview.postMessage(msg)

  switch (message.type) {
    case 'fetch-dom-tree': {
      post({ type: 'progress', message: '正在抓取页面 HTML...' })

      // SPA 检测（参考 DEMO fetchPageWithSpaCheck）
      const rawHtml = await fetchHtml(message.url, false)
      const spaPatterns = [
        /<div\s+id=["'](root|app|__nuxt|__next|mount)["']/i,
        /id=["'](root|app|__nuxt|__next|mount)["']\s*>/i,
        /data-reactroot/i,
        /ng-version=/i,
        /__NUXT__/i,
        /__NEXT_DATA__/i,
      ]
      const isSpa = spaPatterns.some((p) => p.test(rawHtml))
      const html = isSpa
        ? await (async () => {
            const browserPath = await ensureBrowserPath()
            if (browserPath) {
              post({ type: 'progress', message: '检测到 SPA 页面，正在启动浏览器渲染...' })
              return fetchHtml(message.url, true)
            }
            post({ type: 'progress', message: '未配置浏览器，使用原始 HTML' })
            return rawHtml
          })()
        : rawHtml

      htmlCache.set(message.url, html)
      const tree = parseHtmlToTree(html)
      post({ type: 'dom-tree', nodes: tree, phase: 'directory' })
      break
    }

    case 'fetch-directory-content': {
      post({ type: 'progress', message: '正在抓取目录页面...' })
      const rawHtml = await fetchHtml(message.link, false)
      const spaPatterns = [
        /<div\s+id=["'](root|app|__nuxt|__next|mount)["']/i,
        /data-reactroot/i,
        /ng-version=/i,
      ]
      const isSpa = spaPatterns.some((p) => p.test(rawHtml))
      const html = isSpa
        ? await (async () => {
            const browserPath = await ensureBrowserPath()
            if (browserPath) {
              post({ type: 'progress', message: '检测到 SPA 页面，正在启动浏览器渲染...' })
              return fetchHtml(message.link, true)
            }
            return rawHtml
          })()
        : rawHtml

      htmlCache.set(message.link, html)
      const tree = parseHtmlToTree(html)
      post({ type: 'dom-tree', nodes: tree, phase: 'content' })
      break
    }

    case 'mark-as-directory': {
      post({ type: 'progress', message: '正在解析目录项...' })
      const html = htmlCache.get(message.pageUrl)
      if (!html) {
        post({ type: 'error', message: '未找到页面 HTML 缓存，请重新抓取页面' })
        break
      }

      const items = extractDirectoryItems(html, message.selector, message.pageUrl)
      post({ type: 'directory-items', items })
      break
    }

    case 'mark-as-content': {
      const html = htmlCache.get(message.pageUrl)
      if (!html) {
        post({ type: 'error', message: '未找到页面 HTML 缓存，请重新抓取页面' })
        break
      }

      const content = extractContent(html, message.selector)
      post({ type: 'content', html: content || `[在 ${message.selector} 未提取到内容]` })
      break
    }

    case 'mark-as-pagination': {
      const html = htmlCache.get(message.pageUrl)
      if (!html) {
        post({ type: 'error', message: '未找到页面 HTML 缓存，请重新抓取页面' })
        break
      }

      const links = extractPaginationLinks(html, message.selector, message.pageUrl)
      post({ type: 'pagination-links', links })
      break
    }

    case 'save-config': {
      if (!message.config) {
        panel.dispose()
        break
      }

      post({ type: 'progress', message: '正在保存配置...' })

      // 构建兼容旧版 IBookTreeItem 的配置
      const config: IBookTreeItem = {
        title: message.config.title,
        link: message.config.link,
        regex: {
          regex: '',
          start: '',
          end: '',
          detailRegex: '',
        },
        catalog: (message.config.items || []).map((item, i) => ({
          title: item.title,
          link: item.link,
          index: i + 1,
          regex: { regex: '', start: '', end: '', detailRegex: '' },
          catalog: [],
          page: 1,
          pageSize: 100,
        })),
        page: 1,
        pageSize: 100,
        mode: 'selector',
        catalogSelector: message.config.catalogSelector,
        contentSelector: message.config.contentSelector,
        paginationSelector: message.config.paginationSelector || undefined,
      }

      // 保存到旧版书籍目录
      const bookDir = path.join(context.globalStorageUri.fsPath, 'books')

      // 如果编辑时改了书名，删除旧目录
      if (existingConfig && existingConfig.title !== message.config.title) {
        const oldFolder = path.join(bookDir, existingConfig.title)
        if (fs.existsSync(oldFolder)) {
          fs.rmSync(oldFolder, { recursive: true, force: true })
        }
      }
      const configFolder = path.join(bookDir, message.config.title)
      const configPath = path.join(configFolder, 'config.json')

      // 编辑同名配置时自动覆盖，不同名或新建时弹出确认
      const isEditingSame = existingConfig && existingConfig.title === message.config.title
      if (fs.existsSync(configFolder) && !isEditingSame) {
        const confirm = await vscode.window.showWarningMessage(
          `已存在同名书籍"${message.config.title}"，是否覆盖？`,
          { modal: true },
          '覆盖',
          '取消'
        )
        if (confirm !== '覆盖') {
          post({ type: 'error', message: '保存取消' })
          break
        }
      }

      fs.mkdirSync(configFolder, { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

      post({ type: 'save-success', title: message.config.title })
      vscode.commands.executeCommand('lbook.refresh')
      break
    }

    case 'resolve-attributes': {
      const result = await vscode.window.showQuickPick(
        [
          { label: '使用 href 作为链接，title 属性作为标题', description: '标准 <a> 标签' },
          { label: '使用 href 作为链接，文本内容作为标题', description: '常见模式' },
          { label: '自定义选择...', description: '手动选择属性' },
        ],
        {
          placeHolder: '如何从此元素提取标题和链接？',
          title: '解析元素属性',
        }
      )

      if (result) {
        if (result.label.startsWith('使用 href 作为链接，title 属性作为标题')) {
          post({ type: 'attribute-resolved', titleAttr: 'title', linkAttr: 'href' })
        } else if (result.label.startsWith('使用 href 作为链接，文本内容作为标题')) {
          post({ type: 'attribute-resolved', titleAttr: 'textContent', linkAttr: 'href' })
        } else {
          const titleAttr = await vscode.window.showInputBox({
            prompt: '请输入标题的属性名（输入 "textContent" 表示使用文本）',
            placeHolder: 'title',
          })
          const linkAttr = await vscode.window.showInputBox({
            prompt: '请输入链接的属性名',
            placeHolder: 'href',
          })
          post({
            type: 'attribute-resolved',
            titleAttr: titleAttr || 'textContent',
            linkAttr: linkAttr || 'href',
          })
        }
      }
      break
    }

    case 'progress': {
      if (message.message === 'cancel') {
        panel.dispose()
      }
      break
    }
  }
}
