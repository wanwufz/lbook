import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { chromium } from 'playwright-core'

const CONFIG_KEY = 'lbook.browserPath'

function getPlatformBrowserPaths(): { label: string; path: string }[] {
  if (process.platform === 'win32') {
    return [
      { label: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
      { label: 'Microsoft Edge', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
      { label: 'Chrome (x86)', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
    ]
  }
  if (process.platform === 'darwin') {
    return [
      { label: 'Google Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { label: 'Microsoft Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      { label: 'Chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
    ]
  }
  // Linux
  return [
    { label: 'Google Chrome', path: '/usr/bin/google-chrome' },
    { label: 'Google Chrome (stable)', path: '/usr/bin/google-chrome-stable' },
    { label: 'Chromium', path: '/usr/bin/chromium' },
    { label: 'Microsoft Edge', path: '/usr/bin/microsoft-edge-stable' },
  ]
}

function detectInstalledBrowsers(): { label: string; path: string }[] {
  return getPlatformBrowserPaths().filter((b) => fs.existsSync(b.path))
}

function getConfiguredBrowserPath(): string {
  return vscode.workspace.getConfiguration().get<string>(CONFIG_KEY, '')
}

async function setBrowserPath(browserPath: string): Promise<void> {
  await vscode.workspace.getConfiguration().update(CONFIG_KEY, browserPath, vscode.ConfigurationTarget.Global)
}

/**
 * 确保浏览器路径已配置。
 * 若已存在有效的配置路径则直接返回；否则弹出引导对话框。
 */
export async function ensureBrowserPath(): Promise<string | null> {
  const existingPath = getConfiguredBrowserPath()
  if (existingPath && fs.existsSync(existingPath)) {
    return existingPath
  }

  const result = await vscode.window.showInformationMessage(
    '使用浏览器渲染 SPA 页面需要配置浏览器路径，是否立即配置？',
    { modal: true },
    '配置浏览器'
  )

  if (!result) {
    return null
  }

  return setupBrowserPath()
}

/**
 * 打开浏览器路径配置选择器。
 * 提供三种方式：自动检测已安装浏览器、浏览文件选择、手动输入路径。
 */
export async function setupBrowserPath(): Promise<string | null> {
  const installed = detectInstalledBrowsers()

  const items: vscode.QuickPickItem[] = installed.map((b) => ({
    label: b.label,
    description: b.path,
  }))

  if (installed.length > 0) {
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator })
  }
  items.push(
    { label: '$(file-directory) 浏览浏览器可执行文件...', description: '手动选择浏览器 exe 文件' },
    { label: '$(edit) 手动输入路径...', description: '输入浏览器可执行文件的完整路径' }
  )

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: '请选择已安装的 Chrome 或 Edge 浏览器',
    title: '配置浏览器路径',
    ignoreFocusOut: true,
  })

  if (!pick) {
    return null
  }

  let browserPath = ''

  if (pick.label.startsWith('$(file-directory)')) {
    const uri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      title: '选择浏览器可执行文件',
      filters: { '可执行文件': ['exe'] },
    })
    if (!uri || uri.length === 0) {
      return null
    }
    browserPath = uri[0].fsPath
  } else if (pick.label.startsWith('$(edit)')) {
    const input = await vscode.window.showInputBox({
      prompt: '请输入浏览器可执行文件的完整路径',
      placeHolder: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      validateInput: (v: string) => (v ? null : '路径不能为空'),
      ignoreFocusOut: true,
    })
    if (!input) {
      return null
    }
    browserPath = input
  } else {
    const matched = installed.find((b) => b.label === pick.label)
    if (matched) {
      browserPath = matched.path
    }
  }

  if (!browserPath || !fs.existsSync(browserPath)) {
    vscode.window.showErrorMessage(`浏览器可执行文件未找到：${browserPath}`)
    return null
  }

  await setBrowserPath(browserPath)
  vscode.window.showInformationMessage(`浏览器路径已保存：${browserPath}`)
  return browserPath
}

/**
 * 使用 Playwright 启动浏览器渲染目标 URL，返回完整 HTML。
 */
export async function renderWithBrowser(url: string, browserPath: string): Promise<string> {
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  })

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

    // 模拟滚动触发懒加载 / 动态渲染
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0
        const distance = 500
        const timer = setInterval(() => {
          window.scrollBy(0, distance)
          totalHeight += distance
          if (
            totalHeight >= document.body.scrollHeight ||
            document.documentElement.scrollHeight - window.innerHeight - totalHeight < 100
          ) {
            clearInterval(timer)
            resolve()
          }
        }, 200)
      })
    })

    // 等待渲染稳定
    await new Promise((resolve) => setTimeout(resolve, 1000))

    let html = await page.content()

    // 统一 charset 声明
    html = html.replace(/(<meta\s+[^>]*charset\s*=\s*["']?)[^"'\s>]+/i, '$1utf-8')
    if (!/<meta\s+[^>]*charset/i.test(html)) {
      html = html.replace(/<head>/i, '<head><meta charset="utf-8">')
    }

    return html
  } finally {
    await browser.close().catch(() => {})
  }
}
