import * as vscode from 'vscode'
import { fetchSPAHtml } from './spaFetcher'

export function webRequest(url: string): Promise<string> {
  return new Promise((resolve) => {
    fetchSPAHtml(url).then((html) => {
      resolve(html)
    }).catch((err: any) => {
      resolve('')
      vscode.window.showErrorMessage(err.message)
    })
  })
}