import * as vscode from "vscode"
import path from "path"
import { BookTreeItem, getBookLabel } from "./book.class"
import { BookWebview } from "./book.web.class"
import fs from 'fs'
import type { IBookTreeItem } from "./types"
import { ReadOnlyContentProvider } from "./text.class"
import { webRequest } from "./http"
import * as htmlToText from "html-to-text"
import { getBookCatalog } from "./utils"
import * as url from "url"
// import { CheerioCrawler } from 'crawlee'

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
    this.migrateAllOldBooksData(ctx)
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
        item.iconPath = path.join(this.ctx.globalStorageUri.fsPath, 'assets', 'svg', 'local.svg')
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
    const webview = new BookWebview(this.ctx, this, item.book)
    webview.config()
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
        setTimeout(() => vscode.commands.executeCommand('cursorTop'), 100)
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
        const getText = async (link: string, book: IBookTreeItem): Promise<string> => {
          const res = await webRequest(link)
          if (!res) { vscode.window.showErrorMessage("正文链接请求失败!"); return '' }
          const regexDo = new RegExp(book.regex.detailRegex, 'g')
          const regexResult = regexDo.exec(res)
          let content = regexResult?.groups!["content"]
          if (!content) { vscode.window.showErrorMessage("正文链接请求失败!");return '' }
          if (book.nextKey && book.nextRegex && res.includes(book.nextKey)) {
            let nextLink = res.match(new RegExp(book.nextRegex, 'i'))?.[1]
            nextLink = nextLink?.toLocaleLowerCase().startsWith("http") ? nextLink : url.resolve(book.link, nextLink || '')
            return htmlToText.convert(content + '<br />' + await getText(nextLink, book))
          } else {
            return htmlToText.convert(content)
          }
        }
        const doHttp = async () => {
          if (!item) { return false }
          if (!item.parent) { return false }
          const text = await getText(item.book.link, item.parent.book)
          if (!text) { vscode.window.showErrorMessage("正文链接请求失败!");return false}
          const bookPath = path.join(this.bookDir, item.parent.book.title)
          const txtPath = path.join(bookPath, `${item.book.index}. ${item.book.title}.txt`)
          fs.writeFileSync(txtPath, text, { encoding: 'utf-8' })
          item.iconPath = path.join(this.ctx.globalStorageUri.fsPath, 'assets', 'svg', 'local.svg')
          this.resetLabel(item.parent)
          return true
        }
        resolve(await doHttp())
        if (showMessage) { vscode.window.showInformationMessage("获取正文成功!") }
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
        webRequest(item.book.link).then(html => {
          const catalog = getBookCatalog(JSON.stringify({book: item.book, html}))
          item.book.catalog = catalog
          this.resetLabel(item)
          resolve(true)
          vscode.window.showInformationMessage("刷新目录成功!")
        }).catch(() => {
          resolve(false)
          vscode.window.showErrorMessage("刷新目录失败!")
        })
      })
    })
  }
  // async down(element: BookTreeItem) {
  //   if (!element) { return }
  //   this.output.clear()
  //   const crawler = new CheerioCrawler({
  //     requestHandler: async ({ $ }) => {
  //       this.output.append($('body .listmain').text())
  //     }
  //   })
  //   await crawler.run([element.book.link])
  //   this.output.show()
  // }
  // 优化后的数据迁移方法，支持搜索所有旧版本扩展目录
  private async migrateAllOldBooksData(ctx: vscode.ExtensionContext) {
    try {
      // 确保新的目录存在
      if (!fs.existsSync(this.bookDir)) {
        fs.mkdirSync(this.bookDir, { recursive: true })
      }
      // 获取VSCode扩展目录路径
      const extensionsDir = path.dirname(ctx.extensionPath)
      // 查找所有旧版本的lbook扩展目录 (格式: wawufz2025.lbook-*)
      const oldExtensionDirs = this.findOldExtensionDirectories(extensionsDir)
      // 统计成功迁移的书籍总数
      let totalMigratedCount = 0
      // 遍历所有找到的旧版本扩展目录
      for (const oldExtensionDir of oldExtensionDirs) {
        // 构建旧版本中的books目录路径
        const oldBooksDir = path.join(oldExtensionDir, 'books')
        // 检查旧books目录是否存在
        if (fs.existsSync(oldBooksDir)) {
          // 读取旧目录中的所有书籍文件夹
          const oldBooks = fs.readdirSync(oldBooksDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
          // 统计当前版本迁移的书籍数量
          let versionMigratedCount = 0
          // 记录成功迁移的书籍，用于后续删除
          const successfullyMigratedBooks: string[] = []
          // 遍历所有旧书籍进行迁移
          for (const bookName of oldBooks) {
            const oldBookPath = path.join(oldBooksDir, bookName)
            const newBookPath = path.join(this.bookDir, bookName)
            
            // 只迁移新目录中不存在的书籍，避免覆盖已有数据
            if (!fs.existsSync(newBookPath)) {
              try {
                // 复制整个书籍文件夹及其内容
                fs.cpSync(oldBookPath, newBookPath, {
                  recursive: true,
                  force: false  // 不强制覆盖
                })
                // 验证迁移是否成功
                if (fs.existsSync(newBookPath) && fs.readdirSync(newBookPath).length > 0) {
                  successfullyMigratedBooks.push(bookName)
                  versionMigratedCount++
                  totalMigratedCount++
                }
              } catch (err) {
                this.output.appendLine(`从目录 "${oldExtensionDir}" 迁移书籍 "${bookName}" 时出错: ${err instanceof Error ? err.message : String(err)}`)
              }
            }
          }
          
          if (versionMigratedCount > 0) {
            this.output.appendLine(`从目录 "${path.basename(oldExtensionDir)}" 成功迁移了 ${versionMigratedCount} 本书籍`)
            // 删除成功迁移的书籍数据
            try {
              for (const bookName of successfullyMigratedBooks) {
                const oldBookPath = path.join(oldBooksDir, bookName)
                fs.rmSync(oldBookPath, { recursive: true, force: true })
                this.output.appendLine(`已删除旧数据: "${oldBookPath}"`)
              }
              
              // 如果旧books目录已空，尝试删除整个目录
              const remainingFiles = fs.readdirSync(oldBooksDir)
              if (remainingFiles.length === 0) {
                fs.rmdirSync(oldBooksDir)
                this.output.appendLine(`已删除空目录: "${oldBooksDir}"`)
              }
            } catch (err) {
              this.output.appendLine(`删除旧数据时出错: ${err instanceof Error ? err.message : String(err)}`)
              // 注意：删除失败不应影响整体功能，继续执行其他操作
            }
          }
        }
      }
      // 如果有成功迁移的书籍，显示通知
      if (totalMigratedCount > 0) {
        vscode.window.showInformationMessage(`已从 ${oldExtensionDirs.length} 个旧版本成功迁移 ${totalMigratedCount} 本书籍数据到新版本存储位置`)
      }
    } catch (err) {
      // 记录错误信息
      this.output.appendLine(`数据迁移过程中发生错误: ${err instanceof Error ? err.message : String(err)}`)
      // 显示错误通知，但不中断扩展的正常运行
      vscode.window.showErrorMessage('数据迁移时发生错误，请查看输出面板获取详细信息')
    }
  }
  // 查找所有旧版本的lbook扩展目录
  private findOldExtensionDirectories(extensionsDir: string): string[] {
    const oldExtensionDirs: string[] = []
    try {
      // 读取扩展目录中的所有文件夹
      const allExtensions = fs.readdirSync(extensionsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => path.join(extensionsDir, dirent.name))
      for (const extDir of allExtensions) {
        // 匹配格式: wawufz2025.lbook-*
        if (path.basename(extDir).startsWith('wawufz2025.lbook-')) {
          oldExtensionDirs.push(extDir)
        }
      }
    } catch (err) {
      this.output.appendLine(`查找旧版本扩展目录时出错: ${err instanceof Error ? err.message : String(err)}`)
    }
    return oldExtensionDirs
  }
}
