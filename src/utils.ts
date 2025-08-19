import { IBookTreeItem } from "./types"
import { resolve } from "url"

/**
 * 获取书籍目录
 * @param json 书籍及html {book: IBookTreeItem, html: string}
 * @returns 书籍目录
 */
export function getBookCatalog(json: string) {
  const { book, html} = JSON.parse(json) as { book: IBookTreeItem; html: string;}
  const { regex, start, end } = book.regex
  if (!html) {return []}
  if (!regex) {return []}
  const startIndex = start ? html.indexOf(start) : 0
  const endIndex = end ? html.indexOf(end) : html.length
  const matchContent = html.substring(startIndex, endIndex)
  const doRegex = new RegExp(regex, 'g')
  let regexResult
  let catalog: IBookTreeItem[] = []
  while ((regexResult = doRegex.exec(matchContent)) !== null) {
    const link = regexResult.groups!["link"]
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
    })
  }
  catalog = catalog.map((v,i) => ({...v, index: i+1}))
  return catalog
}