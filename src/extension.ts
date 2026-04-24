import * as vscode from 'vscode'
import { init } from './main'

export function activate(context: vscode.ExtensionContext) {
	console.log('Extension "lbook" is now active!')
	init(context)
}

export function deactivate() {}
