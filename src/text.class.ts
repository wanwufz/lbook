import * as vscode from "vscode";
import fs from 'fs';

// 自定义内容提供程序
export class ReadOnlyContentProvider implements vscode.TextDocumentContentProvider {
  // 注册协议前缀
  static readonly SCHEME = 'readonly';
  // 实现内容提供逻辑
  provideTextDocumentContent(uri: vscode.Uri): string {
    const rawPath = uri.fsPath; // 提取原始路径
    if (!fs.existsSync(rawPath)) {
      vscode.window.showErrorMessage(`文件不存在: ${rawPath}`);
      throw vscode.FileSystemError.FileNotFound(rawPath);
    }
    return fs.readFileSync(rawPath, { encoding: 'utf-8' });
  }
}