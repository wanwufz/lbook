/** 树视图节点类型 */
export interface IBookTreeItem {
  /** 书籍名称/章节名称 */
  title: string;
  /** 书籍获取链接/章节获取链接 */
  link: string;
  /** 书籍获取html/章节获取html */
  html?: string;
  /** 章节索引 */
  index?: number;
  /** 书籍获取正则和章节获取正则 */
  regex: IRegex;
  /** 目录列表 */
  catalog: IBookTreeItem[];
  /** 当前分页 */
  page: number;
  /** 分页大小 */
  pageSize: number;
}
/** 树视图节点类型 */
export interface ITreeItem {
  /** 书籍名称/章节名称 */
  title: string;
  /** 书籍获取链接/章节获取链接 */
  link: string;
  /** 章节索引 */
  index?: number;
  /** 目录列表 */
  catalog?: ITreeItem[];
  /** 列表dom标识 */
  catalogDom?: string;
  /** 正文dom标识 */
  chapterDom?: string;
  /** 当前分页 */
  page?: number;
  /** 分页大小 */
  pageSize?: number;
}

/** 正则相关类型 */
export interface IRegex {
  /** 书籍获取正则 */
  regex: string;
  /** 书籍获取正则开始标识 */
  start: string;
  /** 书籍获取正则结束标识 */
  end: string;
  /** 正文获取正则 */
  detailRegex: string;
}