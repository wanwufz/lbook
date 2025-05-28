import * as vscode from "vscode";
import path from "path";
import { BookTreeItem, getBookLabel } from "./book.class";
import { BookWebview } from "./book.web.class";
import fs from 'fs';
import { IBookTreeItem } from "./types";
import { ReadOnlyContentProvider } from "./text.class";
import { webRequest } from "./http";
import * as htmlToText from "html-to-text";
import { CheerioCrawler } from 'crawlee';

export class BookTreeProvider implements vscode.TreeDataProvider<BookTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BookTreeItem | undefined> = new vscode.EventEmitter<BookTreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<BookTreeItem | undefined> = this._onDidChangeTreeData.event;
  public bookDir: string;
  public currentChapter: BookTreeItem | undefined;
  public document: vscode.TextDocument | undefined;
  private ctx: vscode.ExtensionContext;
  private output: vscode.OutputChannel;
  constructor(ctx: vscode.ExtensionContext) {
    this.ctx = ctx;
    this.bookDir = path.join(ctx.extensionPath, 'books');
    this.output = vscode.window.createOutputChannel('lBook');
  }
  getTreeItem(element: BookTreeItem): vscode.TreeItem {
    // 设置树项的上下文值
    if (element.book.index) {
      element.contextValue = 'ltextItem';
    } else {
      element.contextValue = 'lbookItem';
    }
    return element;
  }
  getChildren(element?: BookTreeItem): Thenable<BookTreeItem[]> {
    if (!element) { return Promise.resolve(this.getBookChildren()); }
    return Promise.resolve(this.getTextChildren(element.book.catalog, element));
  }
  refresh(item?: BookTreeItem | undefined): void {
    this._onDidChangeTreeData.fire(item);
  }
  getBookChildren(): BookTreeItem[] {
    try {
      if (!fs.existsSync(this.bookDir)) { fs.mkdirSync(this.bookDir, { recursive: true }); }
      const dirs = fs.readdirSync(this.bookDir);
      const list: IBookTreeItem[] = [];
      for (const a of dirs) {
        const fliePath = path.join(this.bookDir, a, 'config.json');
        if (!fs.existsSync(fliePath)) { continue; }
        const json = fs.readFileSync(fliePath, { encoding: 'utf-8' });
        const data = JSON.parse(json) as IBookTreeItem;
        if (data) {
          list.push(data);
        }
      }
      const trees = list.map(a => {
        const item = new BookTreeItem(a, path.join(this.bookDir, a.title), vscode.TreeItemCollapsibleState.Collapsed);
        item.id = item.book.index + '.' + item.book.title;
        return item;
      });
      return trees;
    } catch (error) {
      this.output.append(JSON.stringify(error));
      this.output.show();
      return [];
    }
  }
  getTextChildren(catalog: IBookTreeItem[], parent: BookTreeItem) {
    return catalog.filter(x => {
      return x.index! > (parent.book.page! - 1) * parent.book.pageSize! && x.index! <= parent.book.page! * parent.book.pageSize!;
    }).map(a => {
      const chapterPath = path.join(this.bookDir, parent.book.title, `${a.index}. ${a.title}.txt`);
      const item = new BookTreeItem(a, chapterPath, vscode.TreeItemCollapsibleState.None, parent);
      item.id = new Date().getTime().toString() + item.book.title;
      if (fs.existsSync(chapterPath)) {
        item.iconPath = path.join(this.ctx.extensionPath, 'assets', 'svg', 'local.svg');
      }
      item.command = { command: 'lbook.view', title: '查看', arguments: [item] };
      return item;
    });
  }
  resetLabel(item: BookTreeItem) {
    item.label = getBookLabel(path.join(this.bookDir, item.book.title), item.book, true);
    this.refresh(item);
  }
  config(item: BookTreeItem) {
    const webview = new BookWebview(this.ctx, this, item.book);
    webview.config();
  }
  add() {
    const webview = new BookWebview(this.ctx, this);
    webview.config();
  }
  previous(item: BookTreeItem) {
    if (!item) { return; }
    if (!item.book.page) { return; }
    if (item.book.page === 1) { return; }
    item.book.page = item.book.page! - 1;
    this.resetLabel(item);
  }
  textPrevious(item: BookTreeItem | undefined) {
    if (!item) { return; }
    if (!item.parent) { return; }
    if (!item.book.index) { return; }
    if (item.book.index === 1) { return; }
    const previous = item.parent.book.catalog.find(x => x.index === item.book.index! - 1);
    if (previous) {
      const previousItem = new BookTreeItem(
        previous, 
        path.join(this.bookDir, item.parent.book.title, `${previous.index}. ${previous.title}.txt`),
        vscode.TreeItemCollapsibleState.None, item.parent
      );
      previousItem.id = previousItem.book.index + '.' + previousItem.book.title;
      this.view(previousItem);
    }
  }
  next(item: BookTreeItem) {
    if (!item) { return; }
    if (!item.book.page) { return; }
    if (!item.book.pageSize) { return; }
    const total = Math.ceil(item.book.catalog.length / item.book.pageSize);
    if (item.book.page === total) { return; }
    item.book.page = item.book.page! + 1;
    this.resetLabel(item);
  }
  textNext(item: BookTreeItem | undefined) {
    if (!item) { return; }
    if (!item.parent) { return; }
    if (!item.book.index) { return; }
    if (item.book.index === item.parent.book.catalog.length) { return; }
    const next = item.parent.book.catalog.find(x => x.index === item.book.index! + 1);
    if (next) {
      const nextItem = new BookTreeItem(
        next,
        path.join(this.bookDir, item.parent.book.title, `${next.index}. ${next.title}.txt`),
        vscode.TreeItemCollapsibleState.None, item.parent 
      );
      nextItem.id = nextItem.book.index + '.' + nextItem.book.title;
      this.view(nextItem);
    }
  }
  copy(item: BookTreeItem) {
    if (!item) { return; }
    const copyBook = {
      ...item.book,
      title: `${item.book.title}-复制`,
    };
    const configPath = path.join(this.bookDir, copyBook.title);
    fs.mkdirSync(configPath, { recursive: true });
    const fliePath = path.join(configPath, 'config.json');
    fs.writeFileSync(fliePath, JSON.stringify(copyBook, undefined, 2), { encoding: 'utf-8' });
    this.refresh();
  }
  delete(item: BookTreeItem) {
    if (!item) { return; }
    const { title } = item.book;
    const dirPath = path.join(this.bookDir, `${title}`);
    vscode.window.showWarningMessage(`${title} 删除后无法恢复，是否确认操作？`, {
      modal: true,
    }, '确认').then((selection) => {
      if (selection === '确认') {
        fs.rmSync(dirPath, { recursive: true, force: true });
        this.refresh();
      }
    });
  }
  async size(item: BookTreeItem) {
    if (!item) { return; }
    if (!item.book.pageSize) { return vscode.window.showErrorMessage("没有分页数据"); }
    const size = await vscode.window.showInputBox({
      placeHolder: '请输入分页大小',
      prompt: '请输入分页大小',
      validateInput: (value: string) => {
        if (isNaN(Number(value))) {
          return '请输入数字';
        }
        if (Number(value) < 0) {
          return '分页大小不正确';
        }
        return null;
      }
    });
    item.book.page = 1;
    item.book.pageSize = Number(size);
    this.resetLabel(item);
  }
  async jump(item: BookTreeItem) {
    if (!item) { return; }
    if (!item.book.pageSize) { return vscode.window.showErrorMessage("没有分页数据"); }
    const page = await vscode.window.showInputBox({
      placeHolder: '请输入页码',
      prompt: '请输入页码',
      validateInput: (value: string) => {
        if (isNaN(Number(value))) {
          return '请输入数字';
        }
        if (item.book.pageSize) {
          if (Number(value) > item.book.pageSize && Number(value) < 1) {
            return '页码不正确';
          }
        }
        return null;
      }
    });
    item.book.page = Number(page);
    this.resetLabel(item);
  }
  async view(item: BookTreeItem) {
    if (!item) { return; }
    if (!item.parent) { return; }
    const bookPath = path.join(this.bookDir, item.parent.book.title);
    const txtPath = path.join(bookPath, `${item.book.index}. ${item.book.title}.txt`);
    let content = true;
    if (!fs.existsSync(txtPath)) {
      content = await this.load(item, false);
    }
    if (content) {
      const vsconfig = vscode.workspace.getConfiguration('lbook');
      const viewType = vsconfig.get<string>('view', 'text');
      if (viewType === 'text') {
        // 以只读模式打开文件
        this.document = await vscode.workspace.openTextDocument(
          vscode.Uri.file(txtPath).with({ scheme: ReadOnlyContentProvider.SCHEME })
        );
        await vscode.window.showTextDocument(this.document, { preview: true });
      } else {
        const text = fs.readFileSync(txtPath, { encoding: 'utf-8' });
        this.output.clear();
        this.output.append(text);
        this.output.show();
        setTimeout(() => vscode.commands.executeCommand('cursorTop'), 100);
      }
      await vscode.commands.executeCommand('setContext', 'lbook.openChapter', true);
      this.currentChapter = item;
    } else {
      vscode.window.showErrorMessage("正文链接请求失败!");
    }
  }
  async load(item: BookTreeItem, showMessage: boolean = true) {
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '正在获取正文链接内容...',
      cancellable: false,
    }, () => {
      return new Promise<boolean>(async (resolve) => {
        const doHttp = async () => {
          if (!item) { return false; }
          if (!item.parent) { return false; }
          const res = await webRequest(item.book.link);
          if (!res) { vscode.window.showErrorMessage("正文链接请求失败!"); return false; }
          const regexDo = new RegExp(item.parent.book.regex.detailRegex, 'g');
          const regexResult = regexDo.exec(res);
          let content = regexResult?.groups!["content"];
          if (!content) { vscode.window.showErrorMessage("正文链接请求失败!");return false; }
          content = htmlToText.convert(content);
          const bookPath = path.join(this.bookDir, item.parent.book.title);
          const txtPath = path.join(bookPath, `${item.book.index}. ${item.book.title}.txt`);
          fs.writeFileSync(txtPath, content, { encoding: 'utf-8' });
          item.iconPath = path.join(this.ctx.extensionPath, 'assets', 'svg', 'local.svg');
          this.resetLabel(item.parent);
          return true;
        };
        resolve(await doHttp());
        if (showMessage) { vscode.window.showInformationMessage("获取正文成功!"); }
      });
    });
  }
  async down(element: BookTreeItem) {
    if (!element) { return; }
    this.output.clear();
    const crawler = new CheerioCrawler({
      requestHandler: async ({ $ }) => {
        this.output.append($('body .listmain').text());
      }
    });
    await crawler.run([element.book.link]);
    this.output.show();
  }
}
