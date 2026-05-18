import * as vscode from 'vscode'
import * as http from 'http'
import * as https from 'https'
import { ensureBrowserPath, renderWithBrowser } from './browserHelper'

/** SPA 页面检测模式 */
const SPA_PATTERNS = [
  /<div\s+id=["'](root|app|__nuxt|__next|mount)["']/i,
  /data-reactroot/i,
  /ng-version=/i,
]

function isSPA(html: string): boolean {
  return SPA_PATTERNS.some((p) => p.test(html))
}

/**
 * 普通 HTTP/HTTPS GET 请求，不依赖浏览器。
 * 支持自动重定向 (301/302/307/308)。
 */
function httpFetch(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url)
    const client = parsedUrl.protocol === 'https:' ? https : http

    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 15000,
    }

    const req = client.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf-8')

        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          let html = content
          html = html.replace(/(<meta\s+[^>]*charset\s*=\s*["']?)[^"'\s>]+/i, '$1utf-8')
          if (!/<meta\s+[^>]*charset/i.test(html)) {
            html = html.replace(/<head>/i, '<head><meta charset="utf-8">')
          }
          resolve(html)
        } else if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
          const location = res.headers.location
          if (location) {
            const redirectUrl = location.startsWith('http') ? location : new URL(location, url).href
            resolve(httpFetch(redirectUrl))
          } else {
            reject(new Error(`Redirect (${res.statusCode}) with no location`))
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Request failed'}`))
        }
      })
    })

    req.on('error', (err) => reject(err))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })
    req.end()
  })
}

/**
 * 统一抓取入口。
 *
 * - `forceBrowser = true`：直接使用浏览器渲染。
 * - `forceBrowser = false`（默认）：先用普通 HTTP 请求，
 *   检测到 SPA 特征时自动尝试浏览器渲染。
 */
export async function fetchHtml(url: string, forceBrowser: boolean = false): Promise<string> {
  if (forceBrowser) {
    const browserPath = await ensureBrowserPath()
    if (!browserPath) {
      throw new Error('未配置浏览器路径，无法渲染 SPA 页面')
    }
    return renderWithBrowser(url, browserPath)
  }

  // 先尝试普通 HTTP 请求
  const rawHtml = await httpFetch(url)

  // 检测 SPA 特征
  if (isSPA(rawHtml)) {
    const browserPath = await ensureBrowserPath()
    if (browserPath) {
      return renderWithBrowser(url, browserPath)
    }
    // 没有配置浏览器，使用原始 HTML
    vscode.window.showWarningMessage(
      '检测到 SPA 页面，建议配置浏览器路径以获取完整渲染内容。可在设置中配置 "lbook.browserPath"。'
    )
  }

  return rawHtml
}

/**
 * 向后兼容：旧版 webRequest 调用入口。
 * 与原返回值一致：成功返回 HTML 字符串，失败返回空字符串并报错。
 */
export function webRequest(url: string): Promise<string> {
  return fetchHtml(url).catch((err: any) => {
    vscode.window.showErrorMessage(err.message)
    return ''
  })
}
