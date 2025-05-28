import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IBookTreeItem } from './types';
import { webRequest } from './http';
import { resolve } from "url";
import * as htmlToText from 'html-to-text';
import { BookTreeProvider } from './book.tree.class';

const assetsPaths = {
  'vueSrc': '/assets/html/js/vue.global.min.js',
  'mdSrc': '/assets/html/js/vuetify.min.js',
  'mdCssSrc': '/assets/html/css/vuetify.min.css',
  'mdIconSrc': '/assets/html/css/materialdesignicons.min.css',
  'baseCssSrc': '/assets/html/css/base.css',
};

function createBook(): IBookTreeItem {
  return {
    title: '',
    link: '',
    regex: {
      regex: '',
      start: '',
      end: '',
      detailRegex: '',
    },
    catalog: [],
    page: 1,
    pageSize: 100,
  };
}


export class BookWebview {
  /** 上下文 */
  private ctx: vscode.ExtensionContext;
  /** 书籍配置 */
  private book: IBookTreeItem;
  /** 视图容器 */
  private treeProvider: BookTreeProvider;
  /** webview面板 */
  static webviewPanels: Map<string, vscode.WebviewPanel>;
  /** webview面板 */
  private webviewPanel: vscode.WebviewPanel;
  /**
   * 创建书籍详情webview
   * @param context 上下文
   * @param book 书籍配置
   */
  constructor(
    ctx: vscode.ExtensionContext,
    treeProvider: BookTreeProvider,
    book?: IBookTreeItem,
  ) {
    this.ctx = ctx;
    this.book = book ? book : createBook();
    this.treeProvider = treeProvider;
    this.webviewPanel = this.getWebviewPanel();
  }
  async config() {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '正在加载书籍配置页面...',
      cancellable: false,
    }, () => new Promise((resolve) => {
      const htmlPath = path.join(this.ctx.extensionPath, 'assets/html/index.html');
      let htmlContent = fs.readFileSync(htmlPath, 'utf8');
      Object.entries(assetsPaths).forEach(([key, assetPath]) => {
        const assetUri = vscode.Uri.joinPath(this.ctx.extensionUri, assetPath);
        const assetSrc = this.webviewPanel.webview.asWebviewUri(assetUri); 
        htmlContent = htmlContent.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), assetSrc.toString());
      });
      this.webviewPanel.webview.html = htmlContent;
      this.webviewPanel?.webview.postMessage({
        command: 'setBook', text: JSON.stringify(this.book)
      });
      this.webviewPanel.webview.onDidReceiveMessage(message => 
        this.switchCommand(message, resolve), undefined, this.ctx.subscriptions
      );
    }));
  }
  /**
   * 初始化webview
   */
  getWebviewPanel(): vscode.WebviewPanel {
    if (!BookWebview.webviewPanels) {
      BookWebview.webviewPanels = new Map();
    }
    const WebviewPanel = BookWebview.webviewPanels.get(this.book.title);
    if (WebviewPanel) {
      return WebviewPanel;
    } else {
      // 创建 Webview 面板
      return vscode.window.createWebviewPanel(
        'lbook',
        this.book.title,
        vscode.ViewColumn.One,
        {
          enableScripts: true, // 启用脚本
          retainContextWhenHidden: true, // 隐藏时保留上下文
          localResourceRoots: [
            vscode.Uri.file(path.join(this.ctx.extensionPath, 'assets')) // 允许加载本地资源
          ]
        }
      );
    }
  }
  /**
   * 切换命令
   * @param message 消息
   */
  switchCommand(message: { command: string; text: string;}, resolve: any) {
    switch (message.command) {
      case 'getBookHtml':
        webRequest(message.text).then(res => {
          this.webviewPanel.webview.postMessage({ command:'setBookHtml', text: res });
        });
        break;
      case 'getChapterHtml': 
        webRequest(message.text).then(res => {
          this.webviewPanel.webview.postMessage({ command:'setChapterHtml', text: res });
        });
        break;
      case 'getCatalog':
        const catalog = this.getBookCatalog(message.text);
        this.webviewPanel.webview.postMessage({
          command:'setCatalog',
          text: JSON.stringify({
            catalogHtml: catalog.map(v => ({ link: v.link, title: v.title })),
            catalog: catalog
          })
        });
        break;
      case 'getChapterTxt':
        this.webviewPanel.webview.postMessage({ command:'setChapterTxt', text: this.getChapter(message.text) }); 
        break;
      case 'save':
        this.saveBook(message.text);
        break;
      case 'opened':
        resolve();
        break;
    
      default:
        break;
    }
  }
  /**
   * 获取书籍目录
   * @param json 书籍及html
   * @returns 书籍目录
   */
  getBookCatalog(json: string) {
    const { book, html} = JSON.parse(json) as { book: IBookTreeItem; html: string;};
    const { regex, start, end } = book.regex;
    if (!html) {return [];}
    if (!regex) {return [];}
    const startIndex = start ? html.indexOf(start) : 0;
    const endIndex = end ? html.indexOf(end) : html.length;
    const matchContent = html.substring(startIndex, endIndex);
    const doRegex = new RegExp(regex, 'g');
    let regexResult;
    let catalog: IBookTreeItem[] = [];
    while ((regexResult = doRegex.exec(matchContent)) !== null) {
      const link = regexResult.groups!["link"];
      catalog.push({
        link: link.toLocaleLowerCase().startsWith("http") ? link : resolve(book.link || '', link),
        title: regexResult.groups!["title"],
        catalog: [],
        regex: {
          regex: '',
          start: '',
          end: '',
          detailRegex: '',
        },
        page: 0,
        pageSize: 0
      });
    }
    catalog = catalog.map((v,i) => ({...v, index: i+1}));
    return catalog;
  }
  /**
   * 获取章节内容
   * @param json 书籍及正文html
   */
  getChapter(json: string) {
    const { book, html} = JSON.parse(json) as { book: IBookTreeItem; html: string;};
    const regexDo = new RegExp(book.regex.detailRegex, 'g');
    const regexResult = regexDo.exec(html);
    if (!regexResult) { return ''; }
    let content = regexResult.groups!["content"];
    if (!content) { return ''; }
    content = htmlToText.convert(content);
    return content;
  }
  /**
   * 保存书籍
   * @param text 书籍配置
   */
  async saveBook(text: string) {
    const { bookNew, bookOld } = JSON.parse(text) as { bookNew: IBookTreeItem; bookOld: IBookTreeItem };
    const BookNowPath = path.join(this.treeProvider.bookDir, bookNew.title);
    const BookOldPath = path.join(this.treeProvider.bookDir, bookOld.title);
    let isWrite: boolean | string | undefined = true;
    if (fs.existsSync(BookNowPath) && bookNew.title !== bookOld.title){
      isWrite = await vscode.window.showWarningMessage('已有同名书籍，是否覆盖保存？', '确认', '取消');
    }
    if (isWrite || isWrite === '确认') {
      if (fs.existsSync(BookOldPath) && bookOld.title) {
        fs.renameSync(BookOldPath, BookNowPath);
      } else {
        fs.mkdirSync(BookNowPath, { recursive: true });
      }
      const configPath = path.join(BookNowPath, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(bookNew, undefined, 2), { encoding: 'utf-8' });
      vscode.window.showInformationMessage("保存成功");
      this.treeProvider.refresh();
      if (this.webviewPanel) {
        this.webviewPanel.title = bookNew.title;
        this.book = bookNew;
        this.webviewPanel.webview.postMessage({
          command: 'setBook', text: JSON.stringify(this.book)
        });
        BookWebview.webviewPanels.set(this.book.title, this.webviewPanel);
        BookWebview.webviewPanels.delete(bookOld.title);
      }
    }
  }
}
