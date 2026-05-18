import { HTMLElement, parse } from 'node-html-parser'
import { htmlToText } from './htmlTransform'
import type { TreeNode, DirectoryItem } from './types'

// ─── URL 工具 ───

/** 将 href 解析为绝对 URL */
export function getAbsoluteUrl(href: string, baseUrl: string): string {
  if (!href) { return '' }
  if (href.startsWith('http://') || href.startsWith('https://')) { return href }
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}

// ─── CSS 选择器构建 ───

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

// ─── HTML → TreeNode 树 ───

function elementToTreeNode(
  element: HTMLElement,
  root: HTMLElement,
  depth: number,
  maxDepth: number,
): TreeNode | null {
  if (depth > maxDepth) { return null }
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') { return null }

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
        if (childNode) { children.push(childNode) }
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

/** 将 HTML 解析为可视化的 TreeNode 数组（供 webview 渲染 DOM 树） */
export function parseHtmlToTree(html: string, maxDepth: number = 6): TreeNode[] {
  const root = parse(html)
  const body = root.querySelector('body')
  const container = body || root

  const trees: TreeNode[] = []
  for (const child of container.childNodes) {
    if (child instanceof HTMLElement) {
      const node = elementToTreeNode(child, container, 0, maxDepth)
      if (node) { trees.push(node) }
    }
  }
  return trees
}

// ─── 目录项提取 ───

/** 从 HTML 中按 CSS 选择器提取目录项（<a> 链接列表） */
export function extractDirectoryItems(html: string, selector: string, pageUrl: string): DirectoryItem[] {
  const root = parse(html)
  const selectedElement = root.querySelector(selector)
  if (!selectedElement) { return [] }

  const parent = selectedElement.parentNode as HTMLElement
  const links = parent.querySelectorAll('a')

  const items: DirectoryItem[] = []
  const seen = new Set<string>()

  for (const link of links) {
    const href = link.getAttribute('href') || ''
    if (!href) { continue }

    const title = link.getAttribute('title') || link.textContent?.trim() || ''
    if (!title) { continue }

    const absoluteLink = getAbsoluteUrl(href, pageUrl)
    if (!absoluteLink || seen.has(absoluteLink)) { continue }
    seen.add(absoluteLink)

    items.push({ title, link: absoluteLink })
  }

  return items
}

// ─── 正文提取 ───

/** 从 HTML 中按 CSS 选择器提取正文（纯文本，使用统一 html-to-text 配置） */
export function extractContentAsText(html: string, selector: string): string {
  const root = parse(html)
  const element = root.querySelector(selector)
  if (!element) { return '' }

  const rawHtml = element.innerHTML?.trim() || ''
  return htmlToText(rawHtml)
}

// ─── 分页链接提取 ───

/** 从 HTML 中按 CSS 选择器提取分页链接 */
export function extractPaginationLinks(html: string, selector: string, pageUrl: string): string[] {
  const root = parse(html)
  const element = root.querySelector(selector)
  if (!element) { return [] }

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
      if (!href) { continue }
      const absoluteLink = getAbsoluteUrl(href, pageUrl)
      if (absoluteLink && !seen.has(absoluteLink)) {
        seen.add(absoluteLink)
        links.push(absoluteLink)
      }
    }
  }

  return links
}
