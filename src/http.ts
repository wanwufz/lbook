import axios from 'axios';
import * as vscode from 'vscode';

export function webRequest(url: string): Promise<string> {
  let header = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.82 Safari/537.36"
  };
  return new Promise((resovle) => {
    axios.get(url, { headers: header }).then((res: any) => {
      if (typeof res.data === 'string') {
        resovle(res.data);
      } else {
        resovle(JSON.stringify(res.data, undefined, 2));
      }
    }).catch((err: any) => {
      resovle('');
      vscode.window.showErrorMessage(err.message);
    });
  });
}