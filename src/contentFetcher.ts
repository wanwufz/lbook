import { parse } from 'node-html-parser'
import { htmlToText } from './htmlTransform'
import { webRequest } from './http'
import type { IBookTreeItem } from './types'

/**
 * 收集分页元素的链接列表。
 * 从已解析的 root 中按 paginationSelector 查找 a 标签，返回绝对 URL 列表。
 */
export function collectPaginationLinksFromRoot(
  root: ReturnType<typeof parse>,
  paginationSelector: string,
  baseUrl: string,
): string[] {
  const pagEl = root.querySelector(paginationSelector)
  if (!pagEl) { return [] }

  const links: string[] = []
  const seen = new Set<string>()

  const collect = (el: any) => {
    if (el.tagName?.toLowerCase() === 'a') {
      const href = el.getAttribute('href') || ''
      const abs = href.startsWith('http') ? href : new URL(href, baseUrl).href
      if (abs && !seen.has(abs)) { seen.add(abs); links.push(abs) }
    } else {
      for (const a of (el.querySelectorAll?.('a') || [])) {
        const href = a.getAttribute('href') || ''
        if (!href) { continue }
        const abs = href.startsWith('http') ? href : new URL(href, baseUrl).href
        if (abs && !seen.has(abs)) { seen.add(abs); links.push(abs) }
      }
    }
  }

  collect(pagEl)
  return links
}

/**
 * 按 CSS selector 模式提取章节正文，包含分页合并。
 * 返回纯文本，失败返回 null。
 */
export async function fetchChapterTextBySelector(
  html: string,
  contentSelector: string,
  paginationSelector: string | undefined,
  chapterLink: string,
): Promise<string | null> {
  const root = parse(html)
  const el = root.querySelector(contentSelector)
  if (!el) { return null }

  let text = htmlToText(el.innerHTML?.trim() || '')
  if (!text) { return null }

  // 分页处理
  if (paginationSelector) {
    const pagLinks = collectPaginationLinksFromRoot(root, paginationSelector, chapterLink)
    for (const pl of pagLinks) {
      const pagHtml = await webRequest(pl)
      if (pagHtml) {
        const pr = parse(pagHtml).querySelector(contentSelector)
        if (pr) {
          text += '\n\n---\n\n' + htmlToText(pr.innerHTML?.trim() || '')
        }
      }
    }
  }

  return text
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
