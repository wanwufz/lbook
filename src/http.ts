import axios from 'axios'
import * as vscode from 'vscode'
import * as iconv from 'iconv-lite'

export function webRequest(url: string): Promise<string> {
  let header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.82 Safari/537.36"
  }
  return new Promise((resolve) => {
    // 配置响应类型为 arraybuffer，以便处理二进制数据
    axios.get(url, { headers: header, responseType: 'arraybuffer' }).then((res) => {
      let charset = 'utf-8'
      // 从响应头中提取 charset
      const contentType = res.headers['content-type']
      if (contentType) {
        const match = contentType.match(/charset=([^;]+)/i)
        if (match) {
          charset = match[1].trim().toLowerCase()
        }
      }
      // 如果响应头中没有 charset，尝试从响应内容中提取
      if (charset === 'utf-8') {
        const html = iconv.decode(Buffer.from(res.data), 'utf-8')
        const metaMatch = html.match(/<meta[^>]+charset=["']?([^"'>]+)/i)
        if (metaMatch) {
          charset = metaMatch[1].trim().toLowerCase()
        }
      }
      try {
        // 使用 iconv-lite 进行编码转换
        const decodedText = iconv.decode(Buffer.from(res.data), charset)
        resolve(decodedText)
      } catch (err) {
        // 转换失败时，默认使用 utf-8 解码
        const fallbackText = iconv.decode(Buffer.from(res.data), 'utf-8')
        resolve(fallbackText)
      }
    }).catch((err: any) => {
      resolve('')
      vscode.window.showErrorMessage(err.message)
    })
  })
}