import * as vscode from "vscode"
import path from "path"
import * as os from "os"
import { BookTreeItem, getBookLabel } from "./book.class"
import { BookWebview } from "./book.web.class"
import fs from 'fs'
import type { IBookTreeItem } from "./types"
import { ReadOnlyContentProvider, fireContentChange } from "./text.class"
import { webRequest } from "./http"
import { htmlToText } from './htmlTransform'
import { parse } from 'node-html-parser'
import { getBookCatalog } from "./utils"
import { showNewConfigPanel } from "./newWebviewPanel"
import { fetchChapterTextBySelector, fetchRecursiveByRegex } from './contentFetcher'
import { extractDirectoryItems } from './domParser'

export class BookTreeProvider implements vscode.TreeDataProvider<BookTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BookTreeItem | undefined> = new vscode.EventEmitter<BookTreeItem | undefined>()
  readonly onDidChangeTreeData: vscode.Event<BookTreeItem | undefined> = this._onDidChangeTreeData.event
  public bookDir: string
  public currentChapter: BookTreeItem | undefined
  public document: vscode.TextDocument | undefined
  private ctx: vscode.ExtensionContext
  private output: vscode.OutputChannel
  constructor(ctx: vscode.ExtensionContext) {
    this.ctx = ctx
    this.bookDir = path.join(ctx.globalStorageUri.fsPath, 'books')
    this.output = vscode.window.createOutputChannel('lBook')
  }
  getTreeItem(element: BookTreeItem): vscode.TreeItem {
    // 设置树项的上下文值
    if (element.book.index) {
      element.contextValue = 'ltextItem'
    } else {
      element.contextValue = 'lbookItem'
    }
    return element
  }
  getChildren(element?: BookTreeItem): Thenable<BookTreeItem[]> {
    if (!element) { return Promise.resolve(this.getBookChildren()) }
    return Promise.resolve(this.getTextChildren(element.book.catalog, element))
  }
  refresh(item?: BookTreeItem | undefined): void {
    this._onDidChangeTreeData.fire(item)
  }
  getBookChildren(): BookTreeItem[] {
    try {
      if (!fs.existsSync(this.bookDir)) { fs.mkdirSync(this.bookDir, { recursive: true }) }
      const dirs = fs.readdirSync(this.bookDir)
      const list: IBookTreeItem[] = []
      for (const a of dirs) {
        const fliePath = path.join(this.bookDir, a, 'config.json')
        if (!fs.existsSync(fliePath)) { continue }
        const json = fs.readFileSync(fliePath, { encoding: 'utf-8' })
        const data = JSON.parse(json) as IBookTreeItem
        if (data) {
          list.push(data)
        }
      }
      const trees = list.map(a => {
        const item = new BookTreeItem(a, path.join(this.bookDir, a.title), vscode.TreeItemCollapsibleState.Collapsed)
        item.id = item.book.index + '.' + item.book.title
        return item
      })
      return trees
    } catch (error) {
      this.output.append(JSON.stringify(error))
      this.output.show()
      return []
    }
  }
  getTextChildren(catalog: IBookTreeItem[], parent: BookTreeItem) {
    return catalog.filter(x => {
      return x.index! > (parent.book.page! - 1) * parent.book.pageSize! && x.index! <= parent.book.page! * parent.book.pageSize!
    }).map(a => {
      const chapterPath = path.join(this.bookDir, parent.book.title, `${a.index}. ${a.title}.txt`)
      const item = new BookTreeItem(a, chapterPath, vscode.TreeItemCollapsibleState.None, parent)
      item.id = new Date().getTime().toString() + item.book.title
      if (fs.existsSync(chapterPath)) {
        item.iconPath = path.join(this.ctx.extensionPath, 'assets', 'svg', 'local.svg')
      }
      item.command = { command: 'lbook.view', title: '查看', arguments: [item] }
      return item
    })
  }
  resetLabel(item: BookTreeItem) {
    item.label = getBookLabel(path.join(this.bookDir, item.book.title), item.book, true)
    this.refresh(item)
  }
  config(item: BookTreeItem) {
    if (item.book.mode === 'selector') {
      showNewConfigPanel(this.ctx, item.book)
    } else {
      const webview = new BookWebview(this.ctx, this, item.book)
      webview.config()
    }
  }
  add() {
    const webview = new BookWebview(this.ctx, this)
    webview.config()
  }
  previous(item: BookTreeItem) {
    if (!item) { return }
    if (!item.book.page) { return }
    if (item.book.page === 1) { return }
    item.book.page = item.book.page! - 1
    this.resetLabel(item)
  }
  textPrevious(item: BookTreeItem | undefined) {
    if (!item) { return }
    if (!item.parent) { return }
    if (!item.book.index) { return }
    if (item.book.index === 1) { return }
    const previous = item.parent.book.catalog.find(x => x.index === item.book.index! - 1)
    if (previous) {
      const previousItem = new BookTreeItem(
        previous, 
        path.join(this.bookDir, item.parent.book.title, `${previous.index}. ${previous.title}.txt`),
        vscode.TreeItemCollapsibleState.None, item.parent
      )
      previousItem.id = previousItem.book.index + '.' + previousItem.book.title
      this.view(previousItem)
    }
  }
  next(item: BookTreeItem) {
    if (!item) { return }
    if (!item.book.page) { return }
    if (!item.book.pageSize) { return }
    const total = Math.ceil(item.book.catalog.length / item.book.pageSize)
    if (item.book.page === total) { return }
    item.book.page = item.book.page! + 1
    this.resetLabel(item)
  }
  textNext(item: BookTreeItem | undefined) {
    if (!item) { return }
    if (!item.parent) { return }
    if (!item.book.index) { return }
    if (item.book.index === item.parent.book.catalog.length) { return }
    const next = item.parent.book.catalog.find(x => x.index === item.book.index! + 1)
    if (next) {
      const nextItem = new BookTreeItem(
        next,
        path.join(this.bookDir, item.parent.book.title, `${next.index}. ${next.title}.txt`),
        vscode.TreeItemCollapsibleState.None, item.parent 
      )
      nextItem.id = nextItem.book.index + '.' + nextItem.book.title
      this.view(nextItem)
    }
  }
  copy(item: BookTreeItem) {
    if (!item) { return }
    const copyBook = {
      ...item.book,
      title: `${item.book.title}-复制`,
    }
    const configPath = path.join(this.bookDir, copyBook.title)
    fs.mkdirSync(configPath, { recursive: true })
    const fliePath = path.join(configPath, 'config.json')
    fs.writeFileSync(fliePath, JSON.stringify(copyBook, undefined, 2), { encoding: 'utf-8' })
    this.refresh()
  }
  delete(item: BookTreeItem) {
    if (!item) { return }
    const { title } = item.book
    const dirPath = path.join(this.bookDir, `${title}`)
    vscode.window.showWarningMessage(`${title} 删除后无法恢复，是否确认操作？`, {
      modal: true,
    }, '确认').then((selection) => {
      if (selection === '确认') {
        fs.rmSync(dirPath, { recursive: true, force: true })
        this.refresh()
      }
    })
  }
  async size(item: BookTreeItem) {
    if (!item) { return }
    if (!item.book.pageSize) { return vscode.window.showErrorMessage("没有分页数据") }
    const size = await vscode.window.showInputBox({
      placeHolder: '请输入分页大小',
      prompt: '请输入分页大小',
      validateInput: (value: string) => {
        if (isNaN(Number(value))) {
          return '请输入数字'
        }
        if (Number(value) < 0) {
          return '分页大小不正确'
        }
        return null
      }
    })
    item.book.page = 1
    item.book.pageSize = Number(size)
    this.resetLabel(item)
  }
  async jump(item: BookTreeItem) {
    if (!item) { return }
    if (!item.book.pageSize) { return vscode.window.showErrorMessage("没有分页数据") }
    const page = await vscode.window.showInputBox({
      placeHolder: '请输入页码',
      prompt: '请输入页码',
      validateInput: (value: string) => {
        if (isNaN(Number(value))) {
          return '请输入数字'
        }
        if (item.book.pageSize) {
          if (Number(value) > item.book.pageSize && Number(value) < 1) {
            return '页码不正确'
          }
        }
        return null
      }
    })
    item.book.page = Number(page)
    this.resetLabel(item)
  }
  async view(item: BookTreeItem) {
    if (!item) { return }
    if (!item.parent) { return }
    const bookPath = path.join(this.bookDir, item.parent.book.title)
    const txtPath = path.join(bookPath, `${item.book.index}. ${item.book.title}.txt`)
    let content = true
    if (!fs.existsSync(txtPath)) {
      content = await this.load(item, false)
    }
    if (content) {
      const vsconfig = vscode.workspace.getConfiguration('lbook')
      const viewType = vsconfig.get<string>('view', 'text')
      if (viewType === 'text') {
        // 以只读模式打开文件
        this.document = await vscode.workspace.openTextDocument(
          vscode.Uri.file(txtPath).with({ scheme: ReadOnlyContentProvider.SCHEME })
        )
        await vscode.window.showTextDocument(this.document, { preview: true })
      } else {
        const text = fs.readFileSync(txtPath, { encoding: 'utf-8' })
        this.output.clear()
        this.output.append(text)
        this.output.show()
        setTimeout(() => vscode.commands.executeCommand('cursorTop'), 200)
      }
      await vscode.commands.executeCommand('setContext', 'lbook.openChapter', true)
      this.currentChapter = item
    } else {
      vscode.window.showErrorMessage("正文链接请求失败!")
    }
  }
  // 加载正文链接内容
  async load(item: BookTreeItem, showMessage: boolean = true) {
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '正在获取正文链接内容...',
      cancellable: false,
    }, () => {
      return new Promise<boolean>(async (resolve) => {
        let selectorResult: { text: string; paginationCount: number } | null = null

        const getText = async (link: string, book: IBookTreeItem): Promise<string> => {
          const res = await webRequest(link, book.fetchMode)
          if (!res) { vscode.window.showErrorMessage("正文链接请求失败!"); return '' }

          if (book.mode === 'selector' && book.contentSelector) {
            // ─── selector 模式：CSS 选择器提取正文（含分页） ───
            selectorResult = await fetchChapterTextBySelector(res, book.contentSelector, book.paginationSelector, link, book.paginationText, book.fetchMode)
            if (!selectorResult) { vscode.window.showErrorMessage("正文链接请求失败!"); return '' }
            return selectorResult.text
          } else {
            // ─── regex 模式：正则提取正文 ───
            const regexDo = new RegExp(book.regex.detailRegex, 'g')
            const regexResult = regexDo.exec(res)
            const content = regexResult?.groups!["content"]
            if (!content) { vscode.window.showErrorMessage("正文链接请求失败!"); return '' }
            if (book.nextKey && book.nextRegex && res.includes(book.nextKey)) {
              let nextLink = res.match(new RegExp(book.nextRegex, 'i'))?.[1]
              nextLink = nextLink?.toLocaleLowerCase().startsWith("http") ? nextLink : new URL(nextLink || '', book.link).href
              return htmlToText(content) + '\n' + await getText(nextLink, book)
            }
            return htmlToText(content)
          }
        }
        // 检查分页配置是否缺少关键词
        const book = item?.parent?.book
        if (book?.mode === 'selector' && book?.paginationSelector && !book?.paginationText) {
          vscode.window.showWarningMessage(
            `"${book.title}" 的分页规则缺少匹配关键词（如"下一页"），请重新配置分页规则以获得完整内容`
          )
        }
        const doHttp = async () => {
          if (!item) { return false }
          if (!item.parent) { return false }
          const text = await getText(item.book.link, item.parent.book)
          if (!text) { vscode.window.showErrorMessage("正文链接请求失败!"); return false }
          const bookPath = path.join(this.bookDir, item.parent.book.title)
          const txtPath = path.join(bookPath, `${item.book.index}. ${item.book.title}.txt`)
          fs.writeFileSync(txtPath, text, { encoding: 'utf-8' })
          // 通知 VS Code 重新读取 readonly 文档内容
          fireContentChange(vscode.Uri.file(txtPath).with({ scheme: ReadOnlyContentProvider.SCHEME }))
          item.iconPath = path.join(this.ctx.extensionPath, 'assets', 'svg', 'local.svg')
          this.resetLabel(item.parent)
          return true
        }
        resolve(await doHttp())
        if (showMessage) {
          let msg = "获取正文成功!"
          const pagCount = ((selectorResult as { text: string; paginationCount: number } | null)?.paginationCount ?? 0)
          if (pagCount > 0) {
            msg += `（已获取 ${pagCount} 分页内容）`
          }
          vscode.window.showInformationMessage(msg)
        }
      })
    })
  }
  async loadDirectory(item: BookTreeItem) {
    if (!item) { return }
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '正在刷新目录信息...',
      cancellable: false,
    }, () => {
      return new Promise<boolean>(async (resolve) => {
        try {
          const html = await webRequest(item.book.link, item.book.fetchMode)
          if (!html) { throw new Error('请求失败') }

          if (item.book.mode === 'selector' && item.book.catalogSelector) {
            // ─── DOM selector 模式：CSS 选择器提取目录 ───
            const dirItems = extractDirectoryItems(html, item.book.catalogSelector, item.book.link)
            item.book.catalog = dirItems.map((d, i) => ({
              title: d.title,
              link: d.link,
              index: i + 1,
              regex: { regex: '', start: '', end: '', detailRegex: '' },
              catalog: [],
              page: 1,
              pageSize: 100,
            }))
          } else {
            // ─── regex 模式：正则提取目录 ───
            const catalog = getBookCatalog(JSON.stringify({ book: item.book, html }))
            item.book.catalog = catalog
          }

          this.resetLabel(item)
          resolve(true)
          vscode.window.showInformationMessage("刷新目录成功!")
        } catch {
          resolve(false)
          vscode.window.showErrorMessage("刷新目录失败!")
        }
      })
    })
  }
  /**
   * 抓取当前分页内所有未缓存的章节。
   * 并行抓取，失败重试最多 3 次，最终跳过失败项。
   */
  async fetchPage(item: BookTreeItem) {
    if (!item) {return}
    const book = item.book
    const bookPath = path.join(this.bookDir, book.title)

    // 检查分页配置是否缺少关键词
    if (book.mode === 'selector' && book.paginationSelector && !book.paginationText) {
      vscode.window.showWarningMessage(
        `"${book.title}" 的分页规则缺少匹配关键词（如"下一页"），请重新配置分页规则后再批量抓取`
      )
    }

    // 计算当前分页的章节列表
    const start = (book.page! - 1) * book.pageSize!
    const end = Math.min(start + book.pageSize!, book.catalog.length)
    const pageChapters = book.catalog.slice(start, end)

    // 过滤已缓存章节
    const uncached = pageChapters.filter(ch => {
      const txtPath = path.join(bookPath, `${ch.index}. ${ch.title}.txt`)
      return !fs.existsSync(txtPath)
    })

    if (uncached.length === 0) {
      vscode.window.showInformationMessage('当前页所有章节已缓存')
      return
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在批量抓取 (${uncached.length} 章)`,
        cancellable: true,
      },
      async (progress, token) => {
        let successCount = 0
        let failCount = 0

        // 每个章节的抓取函数（含内部重试）
        const fetchOne = async (ch: IBookTreeItem): Promise<boolean> => {
          for (let attempt = 1; attempt <= 3; attempt++) {
            if (token.isCancellationRequested) {return false}

            progress.report({ message: `[${attempt}/3] ${ch.title}` })
            const html = await webRequest(ch.link)
            if (!html) {
              if (attempt < 3) {await new Promise(r => setTimeout(r, 1000))}
              continue
            }

            try {
              let text: string | null = null

              if (book.mode === 'selector' && book.contentSelector) {
                // selector 模式（使用共享提取函数，含分页合并）
                const result = await fetchChapterTextBySelector(html, book.contentSelector, book.paginationSelector, ch.link, book.paginationText, book.fetchMode)
                text = result?.text ?? null
                if (!text && attempt < 3) {
                  await new Promise(r => setTimeout(r, 1000))
                  continue
                }
              } else if (book.regex.detailRegex) {
                // regex 模式（递归翻页，与 load 方法行为一致）
                text = await fetchRecursiveByRegex(ch.link, book.regex.detailRegex, book.nextKey, book.nextRegex, book.link, book.fetchMode)
              }

              if (text) {
                const txtPath = path.join(bookPath, `${ch.index}. ${ch.title}.txt`)
                fs.mkdirSync(path.dirname(txtPath), { recursive: true })
                fs.writeFileSync(txtPath, text, 'utf-8')
                fireContentChange(vscode.Uri.file(txtPath).with({ scheme: ReadOnlyContentProvider.SCHEME }))
                return true
              }
            } catch {
              // 继续重试
            }

            if (attempt < 3) {await new Promise(r => setTimeout(r, 1000))}
          }
          return false
        }

        // 并行执行所有章节抓取
        const results = await Promise.all(uncached.map(fetchOne))
        successCount = results.filter(r => r).length
        failCount = uncached.length - successCount

        this.refresh(item)

        if (failCount > 0) {
          vscode.window.showWarningMessage(`批量抓取完成：成功 ${successCount} 章，失败 ${failCount} 章`)
        } else {
          vscode.window.showInformationMessage(`批量抓取完成：成功 ${successCount} 章`)
        }
      }
    )
  }

  /**
   * 下载已缓存章节，合并为一个整书 txt 文件。
   */
  async downloadCached(item: BookTreeItem) {
    if (!item) {return}
    const book = item.book
    const bookPath = path.join(this.bookDir, book.title)

    // 遍历目录，收集已缓存的文件内容
    const parts: string[] = []
    let cachedCount = 0

    for (const ch of book.catalog) {
      const txtPath = path.join(bookPath, `${ch.index}. ${ch.title}.txt`)
      if (fs.existsSync(txtPath)) {
        const content = fs.readFileSync(txtPath, 'utf-8')
        parts.push(`第 ${ch.index} 章 ${ch.title}\n${'─'.repeat(40)}\n${content}`)
        cachedCount++
      }
    }

    if (cachedCount === 0) {
      vscode.window.showWarningMessage('没有已缓存章节，请先抓取内容')
      return
    }

    // 选择保存位置，默认到用户文档目录
    const docsDir = path.join(os.homedir(), 'Documents')
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(docsDir, `${book.title}.txt`)),
      filters: { '文本文件': ['txt'] },
      title: `保存整书 - ${book.title}`,
    })
    if (!uri) {return}

    const merged = parts.join('\n\n')
    fs.writeFileSync(uri.fsPath, merged, 'utf-8')

    vscode.window.showInformationMessage(
      `已保存整书 (${cachedCount} 章)：${path.basename(uri.fsPath)}`
    )
  }
}
