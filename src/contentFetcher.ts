import { parse } from 'node-html-parser'
import { htmlToText } from './htmlTransform'
import { webRequest } from './http'
import type { IBookTreeItem } from './types'

/** 判断 a 元素的文本是否匹配文本筛选 */
function linkTextMatches(el: any, textFilter: string): boolean {
  const elText = (el.textContent || '').trim()
  const filter = textFilter.trim()
  return elText.includes(filter) || filter.includes(elText)
}

/**
 * 收集分页元素的链接列表。
 * 从已解析的 root 中按 paginationSelector 查找 a 标签，返回绝对 URL 列表。
 * @param textFilter 可选文本筛选：仅返回文本包含此内容的 <a> 标签链接。
 */
export function collectPaginationLinksFromRoot(
  root: ReturnType<typeof parse>,
  paginationSelector: string,
  baseUrl: string,
  textFilter?: string,
): string[] {
  const pagEl = root.querySelector(paginationSelector)
  if (!pagEl) { return [] }

  const links: string[] = []
  const seen = new Set<string>()

  const maybePush = (href: string) => {
    if (!href) { return }
    const abs = href.startsWith('http') ? href : new URL(href, baseUrl).href
    if (abs && !seen.has(abs)) { seen.add(abs); links.push(abs) }
  }

  const collect = (el: any) => {
    if (el.tagName?.toLowerCase() === 'a') {
      if (!textFilter || linkTextMatches(el, textFilter)) {
        maybePush(el.getAttribute('href') || '')
      }
    } else {
      for (const a of (el.querySelectorAll?.('a') || [])) {
        if (!textFilter || linkTextMatches(a, textFilter)) {
          maybePush(a.getAttribute('href') || '')
        }
      }
    }
  }

  collect(pagEl)
  return links
}

/**
 * 从已解析的 root 中查找下一页链接。
 * 在 paginationSelector 容器内，返回第一个文本匹配 textFilter 的 <a> 标签绝对 URL。
 * 未找到时返回 null。
 */
function findNextPageUrl(
  root: ReturnType<typeof parse>,
  paginationSelector: string,
  baseUrl: string,
  textFilter?: string,
): string | null {
  const pagEl = root.querySelector(paginationSelector)
  if (!pagEl) { return null }

  // 如果容器本身就是 <a> 且匹配文本
  if (pagEl.tagName?.toLowerCase() === 'a') {
    if (!textFilter || linkTextMatches(pagEl, textFilter)) {
      const href = pagEl.getAttribute('href') || ''
      if (href) { return href.startsWith('http') ? href : new URL(href, baseUrl).href }
    }
    return null
  }

  // 遍历容器内的 <a>，返回第一个文本匹配的链接
  for (const a of (pagEl.querySelectorAll('a') || [])) {
    if (!textFilter || linkTextMatches(a, textFilter)) {
      const href = a.getAttribute('href') || ''
      if (href) { return href.startsWith('http') ? href : new URL(href, baseUrl).href }
    }
  }

  return null
}

/**
 * 按 CSS selector 模式提取章节正文，递归翻页。
 *
 * 从当前页找到"下一页"链接后，反复抓取下一页内容，
 * 直到找不到下一页链接或遇到已访问过的 URL。
 * 最多递归 100 层防止死循环。
 *
 * 返回纯文本，失败返回 null。
 */
export async function fetchChapterTextBySelector(
  html: string,
  contentSelector: string,
  paginationSelector: string | undefined,
  chapterLink: string,
  paginationText?: string,
): Promise<{ text: string; paginationCount: number } | null> {
  const root = parse(html)
  const el = root.querySelector(contentSelector)
  if (!el) { return null }

  let text = htmlToText(el.innerHTML?.trim() || '')
  if (!text) { return null }

  let paginationCount = 0

  // 递归翻页处理（有分页规则但无分页文本时跳过翻页）
  if (paginationSelector && paginationText) {
    const seen = new Set<string>()
    let currentRoot = root
    let currentUrl = chapterLink

    for (let i = 0; i < 100; i++) {
      const nextUrl = findNextPageUrl(currentRoot, paginationSelector, currentUrl, paginationText)
      if (!nextUrl || seen.has(nextUrl)) { break }
      seen.add(nextUrl)

      const nextHtml = await webRequest(nextUrl)
      if (!nextHtml) { break }

      const nextRoot = parse(nextHtml)
      const contentEl = nextRoot.querySelector(contentSelector)
      if (contentEl) {
        text += '\n\n---\n\n' + htmlToText(contentEl.innerHTML?.trim() || '')
        paginationCount++
      }

      currentRoot = nextRoot
      currentUrl = nextUrl
    }
  }

  return { text, paginationCount }
}

/**
 * 按正则模式提取章节正文，支持递归翻页。
 * 返回纯文本，失败返回 null。
 */
export async function fetchChapterTextByRegex(
  html: string,
  detailRegex: string,
  nextKey: string | undefined,
  nextRegex: string | undefined,
  bookLink: string,
): Promise<string | null> {
  const regexDo = new RegExp(detailRegex, 'g')
  const regexResult = regexDo.exec(html)
  const content = regexResult?.groups!["content"]
  if (!content) { return null }

  if (nextKey && nextRegex && html.includes(nextKey)) {
    let nextLink = html.match(new RegExp(nextRegex, 'i'))?.[1]
    nextLink = nextLink?.toLocaleLowerCase().startsWith("http") ? nextLink : new URL(nextLink || '', bookLink).href
    const nextHtml = await webRequest(nextLink)
    if (nextHtml) {
      const rest = await fetchChapterTextByRegex(nextHtml, detailRegex, nextKey, nextRegex, bookLink)
      return htmlToText(content) + '\n' + (rest || '')
    }
  }

  return htmlToText(content)
}

/**
 * 递归抓取翻页链接（用于批量抓取时正则模式的递归）。
 */
export async function fetchRecursiveByRegex(
  chapterUrl: string,
  detailRegex: string,
  nextKey: string | undefined,
  nextRegex: string | undefined,
  bookLink: string,
): Promise<string> {
  const h = await webRequest(chapterUrl)
  if (!h) { return '' }

  const re = new RegExp(detailRegex, 'g')
  const m = re.exec(h)
  const raw = m?.groups!["content"]
  if (!raw) { return '' }

  let part = htmlToText(raw)
  if (nextKey && nextRegex && h.includes(nextKey)) {
    let nl = h.match(new RegExp(nextRegex, 'i'))?.[1]
    nl = nl?.toLocaleLowerCase().startsWith("http") ? nl : new URL(nl || '', bookLink).href
    if (nl) {
      const next = await fetchRecursiveByRegex(nl, detailRegex, nextKey, nextRegex, bookLink)
      if (next) { part += '\n' + next }
    }
  }
  return part
}
