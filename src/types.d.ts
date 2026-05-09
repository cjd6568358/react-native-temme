/**
 * 全局类型声明文件
 * 为 react-native-cheerio 库提供 TypeScript 类型定义
 * cheerio 是一个类似 jQuery 的库，用于在服务端/Node.js 环境中操作 DOM
 * react-native-cheerio 是其 React Native 兼容版本
 */

/**
 * Cheerio 静态对象接口
 * 类似于 jQuery 的 `$` 对象，提供 DOM 查询和操作能力
 */
interface CheerioStatic {
  /** 使用 CSS 选择器查询元素，返回匹配的 Cheerio 集合 */
  (selector: string): Cheerio
  /** 将原生 DOM 元素包装为 Cheerio 对象 */
  (element: CheerioElement | CheerioElement[]): Cheerio
  /** 获取根节点，通常用于从文档根开始查询 */
  root(): Cheerio
  /**
   * 加载 HTML 字符串或 DOM 元素，创建 Cheerio 实例
   * @param html - HTML 字符串或 DOM 元素
   * @param options - 配置选项（如 decodeEntities、_useHtmlParser2 等）
   * @returns Cheerio 实例，可用于后续的 DOM 查询和操作
   */
  load(html: string | CheerioElement, options?: any): CheerioStatic
  /** 获取整个文档的 HTML 字符串 */
  html(): string
  /** 获取整个文档的纯文本内容 */
  text(): string
}

/**
 * Cheerio 元素集合接口
 * 类似于 jQuery 对象，封装了一组 DOM 元素，提供链式调用的查询和操作方法
 */
interface Cheerio {
  /** 通过索引访问集合中的单个原生 DOM 元素 */
  [index: number]: CheerioElement
  /** 集合中元素的数量 */
  length: number
  /** 在当前集合的后代元素中查找匹配 CSS 选择器的元素 */
  find(selector: string): Cheerio
  /** 获取集合中的第一个元素 */
  first(): Cheerio
  /** 获取集合中的最后一个元素 */
  last(): Cheerio
  /** 获取集合中指定索引位置的元素 */
  eq(index: number): Cheerio
  /** 获取父元素，可选传入 CSS 选择器进行过滤 */
  parent(selector?: string): Cheerio
  /** 获取所有祖先元素，可选传入 CSS 选择器进行过滤 */
  parents(selector?: string): Cheerio
  /** 获取子元素，可选传入 CSS 选择器进行过滤 */
  children(selector?: string): Cheerio
  /** 遍历集合中的每个元素 */
  each(func: (index: number, element: CheerioElement) => void): Cheerio
  /** 对集合中的每个元素执行函数，返回新集合 */
  map(func: (index: number, element: CheerioElement) => any): Cheerio
  /** 将 Cheerio 集合转换为原生 DOM 元素数组 */
  toArray(): CheerioElement[]
  /** 获取集合中所有元素的合并文本内容 */
  text(): string
  /** 获取第一个元素的内部 HTML 内容 */
  html(): string
  /** 获取指定属性的值 */
  attr(name: string): string | undefined
  /** 设置指定属性的值 */
  attr(name: string, value: string): Cheerio
  /** 移除指定属性 */
  removeAttr(name: string): Cheerio
  /** 检查是否包含指定的 CSS 类名 */
  hasClass(className: string): boolean
  /** 添加 CSS 类名 */
  addClass(className: string): Cheerio
  /** 移除 CSS 类名 */
  removeClass(className: string): Cheerio
  /** 检查当前元素是否匹配指定的 CSS 选择器 */
  is(selector: string): boolean
  /** 获取表单元素的值 */
  val(): string
  /** 获取指定 CSS 属性的计算值 */
  css(name: string): string
  /** 获取 data-* 属性的值 */
  data(name: string): any
  /** 在元素内部开头插入内容 */
  prepend(content: string): Cheerio
  /** 在元素内部末尾追加内容 */
  append(content: string): Cheerio
  /** 从 DOM 中移除元素 */
  remove(): Cheerio
  /** 克隆元素及其子树 */
  clone(): Cheerio
  /** 替换元素 */
  replaceWith(content: string): Cheerio
  /** 清空元素的所有子节点 */
  empty(): Cheerio
  /** 用指定内容包裹元素 */
  wrap(content: string): Cheerio
}

/**
 * 原生 DOM 元素接口
 * 表示解析后的 HTML DOM 树中的单个节点
 */
interface CheerioElement {
  /** 节点类型（如 'tag'、'text'、'comment' 等） */
  type: string
  /** 标签名（如 'div'、'span' 等），仅对元素节点有效 */
  name: string
  /** 元素的属性键值对（如 { class: 'foo', id: 'bar' }） */
  attribs: { [attr: string]: string }
  /** 子节点数组 */
  children: CheerioElement[]
  /** 下一个兄弟节点，如果没有则为 null */
  next: CheerioElement | null
  /** 上一个兄弟节点，如果没有则为 null */
  prev: CheerioElement | null
  /** 父节点，如果没有则为 null（如根节点） */
  parent: CheerioElement | null
  /** 文本内容（仅对文本节点和注释节点有效） */
  data?: string
}

/**
 * Cheerio 配置选项接口
 * 控制 HTML 解析和 DOM 操作的行为
 */
interface CheerioOptions {
  /** 是否启用 DOM Level 1 兼容模式 */
  withDomLvl1?: boolean
  /** 是否规范化空白字符 */
  normalizeWhitespace?: boolean
  /** 是否以 XML 模式解析（区分大小写、自闭合标签等） */
  xmlMode?: boolean
  /** 是否自动解码 HTML 实体（如 &amp; → &） */
  decodeEntities?: boolean
  /** 是否使用 htmlparser2 解析器（性能更高，但功能略少） */
  _useHtmlParser2?: boolean
}

/**
 * react-native-cheerio 模块声明
 * 为 React Native 环境下的 cheerio 提供类型支持
 */
declare module 'react-native-cheerio' {
  const cheerio: CheerioStatic & {
    load(html: string | CheerioElement, options?: CheerioOptions): CheerioStatic
  }

  export default cheerio
}
