/** 配置编辑模式 */
export type ConfigMode = 'regex' | 'selector'

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
  /** 下一页关键词 */
  nextKey?: string;
  /** 下一页链接规则 */
  nextRegex?: string;
  /** 配置模式（selector 模式新增字段，兼容旧版 regex 模式） */
  mode?: ConfigMode;
  /** 目录容器 CSS 选择器 */
  catalogSelector?: string;
  /** 正文容器 CSS 选择器 */
  contentSelector?: string;
  /** 分页 CSS 选择器 */
  paginationSelector?: string;
  /** 分页匹配文本（用于精准定位，如 "下一页"） */
  paginationText?: string;
  /** 获取方式：''=自动，1=常规（仅 HTTP），2=强制浏览器 */
  fetchMode?: string;
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

// ─── 新版配置页类型（参考 DEMO） ───

/** 目录项 */
export interface DirectoryItem {
  title: string;
  link: string;
}

/** DOM 树节点（新版配置页可视化用） */
export interface TreeNode {
  tagName: string;
  selector: string;
  attributes: Record<string, string>;
  textContent: string;
  children: TreeNode[];
  expanded: boolean;
  phaseActions: ('directory' | 'content' | 'pagination')[];
}

/** Webview → 扩展 消息 */
export type WebviewMessage =
  | { type: 'fetch-dom-tree'; url: string; fetchMode?: string }
  | { type: 'fetch-directory-content'; link: string; fetchMode?: string }
  | { type: 'mark-as-directory'; selector: string; pageUrl: string }
  | { type: 'mark-as-content'; selector: string; pageUrl: string }
  | { type: 'mark-as-pagination'; selector: string; pageUrl: string; text?: string }
  | { type: 'save-config'; config: SimpleConfig | null }
  | { type: 'resolve-attributes'; html: string; tagIndex: number }
  | { type: 'progress'; message: string }

/** 简化配置（用于回传 webview 编辑） */
export interface SimpleConfig {
  title: string;
  link: string;
  catalogSelector?: string;
  contentSelector?: string;
  paginationSelector?: string;
  paginationText?: string;
  /** 获取方式：''=自动，1=常规（仅 HTTP），2=强制浏览器 */
  fetchMode?: string;
  items: DirectoryItem[];
}

/** 扩展 → Webview 消息 */
export type ExtensionMessage =
  | { type: 'dom-tree'; nodes: TreeNode[]; phase: 'directory' | 'content' }
  | { type: 'directory-items'; items: DirectoryItem[] }
  | { type: 'content'; html: string }
  | { type: 'pagination-links'; links: string[] }
  | { type: 'config-loaded'; config: SimpleConfig }
  | { type: 'save-success'; title: string }
  | { type: 'delete-success'; title: string }
  | { type: 'attribute-resolved'; titleAttr: string; linkAttr: string }
  | { type: 'error'; message: string }
  | { type: 'progress'; message: string }
