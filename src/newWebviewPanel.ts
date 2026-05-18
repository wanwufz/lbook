import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { getNewWebviewContent } from './newWebviewContent'
import { fetchHtml } from './http'
import { ensureBrowserPath } from './browserHelper'
import { isSPA } from './spaDetector'
import { parseHtmlToTree, extractDirectoryItems, extractContentAsText, extractPaginationLinks } from './domParser'
import type { WebviewMessage, ExtensionMessage, IBookTreeItem } from './types'

// ─── Webview 面板 ───

export function showNewConfigPanel(context: vscode.ExtensionContext, existingConfig?: IBookTreeItem) {
  const panel = vscode.window.createWebviewPanel(
    'lbook.newConfig',
    existingConfig ? `编辑：${existingConfig.title}` : '新建配置',
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
      paginationText: existingConfig.paginationText,
      fetchMode: existingConfig.fetchMode,
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

      const rawHtml = await fetchHtml(message.url, false, message.fetchMode)
      // fetchMode='2' 已强制使用浏览器渲染，跳过 SPA 检测
      const html = message.fetchMode === '2'
        ? rawHtml
        : isSPA(rawHtml)
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
      const rawHtml = await fetchHtml(message.link, false, message.fetchMode)
      const html = message.fetchMode === '2'
        ? rawHtml
        : isSPA(rawHtml)
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

      const content = extractContentAsText(html, message.selector)
      post({ type: 'content', html: content || `[在 ${message.selector} 未提取到内容]` })
      break
    }

    case 'mark-as-pagination': {
      const html = htmlCache.get(message.pageUrl)
      if (!html) {
        post({ type: 'error', message: '未找到页面 HTML 缓存，请重新抓取页面' })
        break
      }

      const links = extractPaginationLinks(html, message.selector, message.pageUrl, message.text)
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
        paginationText: message.config.paginationText || undefined,
        fetchMode: message.config.fetchMode || undefined,
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
