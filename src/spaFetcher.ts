import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { chromium } from 'playwright-core'

/**
 * 抓取 SPA 页面渲染后的完整 HTML
 * @param url 目标网址
 * @returns 统一为 UTF-8 编码的完整 HTML 字符串
 */
export async function fetchSPAHtml(url: string): Promise<string> {
  const config = vscode.workspace.getConfiguration('lbook')
  
  // 1️⃣ 浏览器路径检查与配置
  let browserPath = config.get<string>('browserPath')
  const isValidBrowser = (p: string) => {
    try {
      const stat = fs.statSync(p)
      return stat.isFile() && stat.size > 1 * 1024 * 1024 // >1MB 排除快捷方式/小工具
    } catch { return false }
  }

  if (!browserPath || !isValidBrowser(browserPath)) {
    const knownPaths = process.platform === 'win32' ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ] : process.platform === 'darwin' ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ] : ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge-stable', '/snap/bin/chromium']

    const existing = knownPaths.filter(fs.existsSync)
    const picks = [
      ...existing.map(p => ({ label: path.basename(p, path.extname(p)), description: p, path: p })),
      { label: '🔍 手动输入路径', description: '自定义 Chrome/Edge 可执行文件', path: '__MANUAL__' }
    ]

    const choice = await vscode.window.showQuickPick(picks, {
      placeHolder: '首次使用：请选择已安装的 Chrome 或 Edge 浏览器',
      ignoreFocusOut: true
    })

    if (!choice) {throw new Error('用户取消了浏览器选择')}

    let finalPath = choice.path
    if (finalPath === '__MANUAL__') {
      const input = await vscode.window.showInputBox({
        prompt: '请输入浏览器可执行文件的完整路径',
        validateInput: v => fs.existsSync(v) ? null : '❌ 文件不存在，请重新输入'
      })
      if (!input) {throw new Error('用户取消了路径输入')}
      finalPath = input
    }

    if (!isValidBrowser(finalPath)) {
      throw new Error('无效的浏览器路径（非文件或体积异常）')
    }

    browserPath = finalPath
    await config.update('browserPath', browserPath, vscode.ConfigurationTarget.Global)
    vscode.window.showInformationMessage('✅ 浏览器路径已保存至全局配置')
  }

  // 2️⃣ 启动 Playwright 并渲染页面
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--disable-extensions', '--disable-software-rasterizer'
    ]
  })

  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    })

    // 导航并等待网络空闲
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })

    // 模拟滚动触发懒加载/动态渲染
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0
        const distance = 500
        const timer = setInterval(() => {
          window.scrollBy(0, distance)
          totalHeight += distance
          if (totalHeight >= document.body.scrollHeight || 
              document.documentElement.scrollHeight - window.innerHeight - totalHeight < 100) {
            clearInterval(timer)
            resolve()
          }
        }, 200)
      })
    })
    // 等待渲染稳定（替代已废弃的 waitForTimeout）
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 3️⃣ 提取 HTML 并统一编码
    let html = await page.content()

    // 🔧 编码兼容：Chromium 内部已将 GBK/GB2312 转为 UTF-8，但 meta 标签可能仍写 gbk
    // 统一替换 charset 声明为 utf-8，避免 VS Code 打开时误判编码
    html = html.replace(/(<meta\s+[^>]*charset\s*=\s*["']?)[^"'\s>]+/i, '$1utf-8')
    
    // 若原页面完全缺失 charset 声明，强制插入 head
    if (!/<meta\s+[^>]*charset/i.test(html)) {
      html = html.replace(/<head>/i, '<head><meta charset="utf-8">')
    }

    return html
  } finally {
    // 无论成功/失败/取消，确保浏览器进程关闭，防止僵尸进程
    await browser.close().catch(() => {})
  }
}