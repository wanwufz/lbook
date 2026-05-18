import * as vscode from "vscode"
import fs from 'fs'

// ─── 自定义内容提供程序 ───

const _onDidChangeContent = new vscode.EventEmitter<vscode.Uri>()

/** 通知 VS Code 指定 readonly 文档的内容已变更 */
export function fireContentChange(uri: vscode.Uri) {
  _onDidChangeContent.fire(uri)
}

export class ReadOnlyContentProvider implements vscode.TextDocumentContentProvider {
  // 注册协议前缀
  static readonly SCHEME = 'readonly'

  // VS Code 通过此事件得知文档内容需要重新读取
  readonly onDidChange = _onDidChangeContent.event

  // 实现内容提供逻辑
  provideTextDocumentContent(uri: vscode.Uri): string {
    const rawPath = uri.fsPath
    if (!fs.existsSync(rawPath)) {
      vscode.window.showErrorMessage(`文件不存在: ${rawPath}`)
      throw vscode.FileSystemError.FileNotFound(rawPath)
    }
    return fs.readFileSync(rawPath, { encoding: 'utf-8' })
  }
}
