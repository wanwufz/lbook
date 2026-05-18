import { convert } from 'html-to-text'

/**
 * html-to-text 全局统一配置。
 * 所有模块通过此函数转换 HTML → 纯文本，确保配置一致。
 */
const HTML_TO_TEXT_OPTIONS = {
  wordwrap: 80,
  selectors: [
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'img', format: 'skip' },
  ],
}

export function htmlToText(html: string): string {
  return convert(html, HTML_TO_TEXT_OPTIONS)
}
