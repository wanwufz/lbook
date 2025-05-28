import * as vscode from "vscode"
import type { IBookTreeItem } from "./types"
import path from "path"
import fs from "fs"

export class BookTreeItem extends vscode.TreeItem {
  constructor(
    public readonly book: IBookTreeItem,
    public readonly bookPath: string,
    public collapsibleState?: vscode.TreeItemCollapsibleState,
    public readonly parent?: BookTreeItem,
  ) {
    super(getBookLabel(bookPath, book), collapsibleState)
  }
}

/**
 * 获取书籍标签
 * @param bookPath 书籍路径
 * @param book 书籍配置
 * @param write 是否写回文件中
 * @returns 书籍标签
 */
export function getBookLabel(bookPath: string, book: IBookTreeItem, write: boolean = false) {
  if (book.index) { return `${book.index}. ${book.title}` }
  let label = `${book.title}`
  if (!book.page || !book.pageSize) {
    book.page = 1
    book.pageSize = 100
    fs.writeFileSync(path.join(bookPath, 'config.json'), JSON.stringify(book, undefined, 2), { encoding: 'utf-8' })
  }
  if (write) {
    fs.writeFileSync(path.join(bookPath, 'config.json'), JSON.stringify(book, undefined, 2), { encoding: 'utf-8' })
  }
  const files = fs.readdirSync(bookPath)
  const num = files.filter(file => path.extname(file) === '.txt').length
  label = label + ` - (${num}/${book.catalog.length})`
  const pages = Math.ceil(book.catalog.length / book.pageSize)
  label = label + ` ~ [${book.page}/${pages}]`
  return label
}