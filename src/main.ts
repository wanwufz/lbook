import * as vscode from 'vscode';
import fs from 'fs';
import path from 'path';
import { BookTreeItem } from './book.class';
import { ReadOnlyContentProvider } from './text.class';
import { BookTreeProvider } from './book.tree.class';

// 初始化
export function init(ctx: vscode.ExtensionContext) {
  try {
    // 注册内容提供程序
    ctx.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        ReadOnlyContentProvider.SCHEME,
        new ReadOnlyContentProvider()
      )
    );
    const BookTree = new BookTreeProvider(ctx);
    vscode.window.registerTreeDataProvider('lbook', BookTree);
    const packageJSON = fs.readFileSync(path.join(ctx.extensionPath, 'package.json'), { encoding: 'utf-8' });
    const packageObj = JSON.parse(packageJSON);
    packageObj.contributes.commands.forEach((command: { command: string; title: string; }) => {
      ctx.subscriptions.push(
        vscode.commands.registerCommand(command.command, (element: BookTreeItem) => {
          switch (command.command) {
            case 'lbook.config': BookTree.config(element);return; 
            case 'lbook.add': BookTree.add(); return; 
            case 'lbook.previous': BookTree.previous(element); return;
            case 'lbook.next': BookTree.next(element); return;
            case 'lbook.copy': BookTree.copy(element); return;
            case 'lbook.delete': BookTree.delete(element); return;
            case 'lbook.size': BookTree.size(element); return;
            case 'lbook.jump': BookTree.jump(element); return;
            case 'lbook.view': BookTree.view(element); return;
            case 'lbook.load': BookTree.load(element); return;
            default:
              vscode.window.showInformationMessage(command.title);
              break;
          }
        })
      );

    });
    ctx.subscriptions.push(
      vscode.commands.registerCommand('lbook.textPrevious', () => {
        BookTree.textPrevious(BookTree.currentChapter);
      })
    );
    ctx.subscriptions.push(
      vscode.commands.registerCommand('lbook.TextNext', () => {
        BookTree.textNext(BookTree.currentChapter);
      })
    );
  } catch (error) {
    vscode.window.showErrorMessage(JSON.stringify(error));
  }
}