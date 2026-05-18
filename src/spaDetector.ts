/**
 * SPA 页面特征检测。
 */

const SPA_PATTERNS = [
  /<div\s+id=["'](root|app|__nuxt|__next|mount)["']/i,
  /id=["'](root|app|__nuxt|__next|mount)["']\s*>/i,
  /data-reactroot/i,
  /ng-version=/i,
  /__NUXT__/i,
  /__NEXT_DATA__/i,
]

/** 判断 HTML 是否为 SPA 页面 */
export function isSPA(html: string): boolean {
  return SPA_PATTERNS.some((p) => p.test(html))
}
