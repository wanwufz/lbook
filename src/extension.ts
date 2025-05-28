import * as vscode from 'vscode'
import { init } from './main'

export function activate(context: vscode.ExtensionContext) {
	init(context)
}

export function deactivate() {}
