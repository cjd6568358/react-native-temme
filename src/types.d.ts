interface CheerioStatic {
  (selector: string): Cheerio
  (element: CheerioElement | CheerioElement[]): Cheerio
  root(): Cheerio
  load(html: string | CheerioElement, options?: any): CheerioStatic
  html(): string
  text(): string
}

interface Cheerio {
  [index: number]: CheerioElement
  length: number
  find(selector: string): Cheerio
  first(): Cheerio
  last(): Cheerio
  eq(index: number): Cheerio
  parent(selector?: string): Cheerio
  parents(selector?: string): Cheerio
  children(selector?: string): Cheerio
  each(func: (index: number, element: CheerioElement) => void): Cheerio
  map(func: (index: number, element: CheerioElement) => any): Cheerio
  toArray(): CheerioElement[]
  text(): string
  html(): string
  attr(name: string): string | undefined
  attr(name: string, value: string): Cheerio
  removeAttr(name: string): Cheerio
  hasClass(className: string): boolean
  addClass(className: string): Cheerio
  removeClass(className: string): Cheerio
  is(selector: string): boolean
  val(): string
  css(name: string): string
  data(name: string): any
  prepend(content: string): Cheerio
  append(content: string): Cheerio
  remove(): Cheerio
  clone(): Cheerio
  replaceWith(content: string): Cheerio
  empty(): Cheerio
  wrap(content: string): Cheerio
}

interface CheerioElement {
  type: string
  name: string
  attribs: { [attr: string]: string }
  children: CheerioElement[]
  next: CheerioElement | null
  prev: CheerioElement | null
  parent: CheerioElement | null
  data?: string
}

interface CheerioOptions {
  withDomLvl1?: boolean
  normalizeWhitespace?: boolean
  xmlMode?: boolean
  decodeEntities?: boolean
  _useHtmlParser2?: boolean
}

declare module 'react-native-cheerio' {
  const cheerio: CheerioStatic & {
    load(html: string | CheerioElement, options?: CheerioOptions): CheerioStatic
  }

  export default cheerio
}
