/**
 * Dedicated test for lexbor Android arm64 .so in GitHub Actions.
 *
 * Loads liblexbor.so via koffi FFI and runs:
 *   1. Smoke tests: basic parsing, selectors, attributes, text, serialization
 *   2. SelectorsMap snapshot comparison: cheerio vs lexbor (reuses fixtures)
 *
 * Requires LEXBOR_LIB_PATH env var pointing to the .so file.
 * Run: LEXBOR_LIB_PATH=./native/lexbor-android-arm64-v8a/bin/lib/liblexbor.so npx jest lexbor-android-arm64
 */

import fs from 'fs'
import path from 'path'
import temme from '../src/temme'
import selectors, { selectorsMap } from './fixtures/selectors'

// ── Load .so via koffi ──

const libPath = process.env.LEXBOR_LIB_PATH
if (!libPath || !fs.existsSync(libPath)) {
  throw new Error(`LEXBOR_LIB_PATH not set or file not found: ${libPath}`)
}

const koffi = require('koffi')
const lib = koffi.load(path.resolve(libPath))

// FFI bindings
const htmlDocumentCreate = lib.func('lxb_html_document_create', 'void*', [])
const htmlDocumentDestroy = lib.func('lxb_html_document_destroy', 'void', ['void*'])
const htmlDocumentParse = lib.func('lxb_html_document_parse', 'uint', ['void*', 'void*', 'uint64'])
const domNodeTextContent = lib.func('lxb_dom_node_text_content', 'void*', ['void*', 'void*'])
const domElementGetAttribute = lib.func('lxb_dom_element_get_attribute', 'void*', ['void*', 'void*', 'uint64', 'void*'])
const WriteCb = koffi.proto('uint LxWC(const uint8_t *data, uint64 len, void *ctx)')
const serializeTreeCb = lib.func('lxb_html_serialize_tree_cb', 'uint', ['void*', koffi.pointer(WriteCb), 'void*'])
const cssParserCreate = lib.func('lxb_css_parser_create', 'void*', [])
const cssParserInit = lib.func('lxb_css_parser_init', 'uint', ['void*', 'void*'])
const cssSelectorsParse = lib.func('lxb_css_selectors_parse', 'void*', ['void*', 'void*', 'uint64'])
const selectorsCreate = lib.func('lxb_selectors_create', 'void*', [])
const selectorsInit = lib.func('lxb_selectors_init', 'uint', ['void*'])
const SelectorCb = koffi.proto('uint LxSelCb(void *node, void *spec, void *ctx)')
const selectorsFind = lib.func('lxb_selectors_find', 'uint', ['void*', 'void*', 'void*', koffi.pointer(SelectorCb), 'void*'])

// Node struct (arm64 layout)
const NodeLayout = koffi.struct('LxNodeLayout', {
  _ev0: 'void*', _local_name: 'uint32', _pad1: 'uint32',
  _f16: 'void*', _ns: 'uint32', _pad2: 'uint32',
  _owner_doc: 'void*', next: 'void*', prev: 'void*',
  parent: 'void*', first_child: 'void*', last_child: 'void*',
  _f80: 'void*', type: 'uint32', _pad3: 'uint32',
})

const PP = []
for (let i = 0; i <= 14; i++) {
  const fields: Record<string, string> = {}
  for (let j = 0; j < i; j++) fields['_' + j] = 'void*'
  fields['p'] = 'void*'
  PP.push(koffi.struct('LxPP_' + i, fields))
}

function ptrAt(ptr: any, off: number) { return koffi.decode(ptr, PP[off / 8]).p }
function readNode(ptr: any) { return koffi.decode(ptr, NodeLayout) }

const KNOWN_TAGS: Record<number, string> = {
  1: 'html', 2: 'head', 3: 'title', 4: 'body', 5: 'div', 6: 'span',
  7: 'p', 8: 'a', 9: 'img', 10: 'br', 11: 'hr', 12: 'table',
  13: 'tr', 14: 'td', 15: 'th', 16: 'tbody', 17: 'thead', 18: 'tfoot',
  19: 'ul', 20: 'ol', 21: 'li', 22: 'dl', 23: 'dt', 24: 'dd',
  25: 'form', 26: 'input', 27: 'button', 28: 'select', 29: 'option',
  30: 'textarea', 31: 'label', 32: 'h1', 33: 'h2', 34: 'h3',
  35: 'h4', 36: 'h5', 37: 'h6', 38: 'em', 39: 'strong', 40: 'b',
  41: 'i', 42: 'u', 43: 's', 44: 'small', 45: 'sub', 46: 'sup',
  47: 'pre', 48: 'code', 49: 'blockquote', 50: 'cite', 51: 'script',
  52: 'style', 53: 'link', 54: 'meta', 55: 'base', 56: 'area',
  57: 'map', 58: 'object', 59: 'embed', 60: 'param', 61: 'video',
  62: 'audio', 63: 'source', 64: 'canvas', 65: 'iframe', 66: 'nav',
  67: 'header', 68: 'footer', 69: 'main', 70: 'section', 71: 'article',
  72: 'aside', 73: 'figure', 74: 'figcaption', 75: 'details', 76: 'summary',
  77: 'fieldset', 78: 'legend', 79: 'colgroup', 80: 'col',
  81: 'caption', 82: 'address', 83: 'abbr', 84: 'bdo', 85: 'ins',
  86: 'del', 87: 'q', 88: 'kbd', 89: 'var', 90: 'samp',
}

const tagNameCache = new Map<number, string>()

function getTagNameFromId(ptr: any, localNameId: number): string {
  let cached = tagNameCache.get(localNameId)
  if (cached !== undefined) return cached
  cached = KNOWN_TAGS[localNameId]
  if (cached) { tagNameCache.set(localNameId, cached); return cached }
  const html = serializeTreeFn(ptr)
  const m = html ? html.match(/^<([a-zA-Z][a-zA-Z0-9]*)/) : null
  cached = m ? m[1] : 'unknown'
  tagNameCache.set(localNameId, cached)
  return cached
}

function serializeTreeFn(ptr: any): string | null {
  const chunks: string[] = []
  const cb = koffi.register((data: any, len: number) => {
    if (data && len > 0) chunks.push(koffi.decode(data, 'char', Number(len)))
    return 0
  }, koffi.pointer(WriteCb))
  try {
    const s = serializeTreeCb(ptr, cb, null)
    koffi.unregister(cb)
    return s === 0 ? chunks.join('') : null
  } catch (e) {
    try { koffi.unregister(cb) } catch (_) {}
    return null
  }
}

function serializeInnerHtml(ptr: any): string {
  const full = serializeTreeFn(ptr)
  if (!full) return ''
  return full.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>\s*$/, '')
}

const attrLenBuf = Buffer.alloc(8)
const textLenBuf = Buffer.alloc(8)
const nameBufCache = new Map<string, Buffer>()

function getNameBuf(name: string): Buffer {
  let buf = nameBufCache.get(name)
  if (!buf) { buf = Buffer.from(name + '\0', 'utf8'); nameBufCache.set(name, buf) }
  return buf
}

function getAttributeDirect(ptr: any, name: string): string | undefined {
  const nameBuf = getNameBuf(name)
  attrLenBuf.writeUInt32LE(0, 0)
  try {
    const valPtr = domElementGetAttribute(ptr, nameBuf, BigInt(name.length), attrLenBuf)
    if (!valPtr) return undefined
    const len = attrLenBuf.readUInt32LE(0)
    if (len === 0) return ''
    return koffi.decode(valPtr, 'char', Math.min(len, 4096))
  } catch (e) { return undefined }
}

function getTextContent(ptr: any): string {
  if (!ptr) return ''
  textLenBuf.writeUInt32LE(0, 0)
  try {
    const tp = domNodeTextContent(ptr, textLenBuf)
    const len = textLenBuf.readUInt32LE(0)
    if (tp && len > 0 && len < 1000000) return koffi.decode(tp, 'char', len)
  } catch (e) {}
  return ''
}

// Global CSS parser + selectors
let gCssParser: any = null
let gSelectors: any = null
const selectorCache = new Map<string, any>()

function ensureGlobals() {
  if (gCssParser) return
  gCssParser = cssParserCreate()
  cssParserInit(gCssParser, null)
  gSelectors = selectorsCreate()
  selectorsInit(gSelectors)
}

function getSelectorList(selector: string): any {
  let list = selectorCache.get(selector)
  if (list) return list
  const selBuf = Buffer.from(selector + '\0', 'utf8')
  list = cssSelectorsParse(gCssParser, selBuf, BigInt(selector.length))
  if (!list) return null
  selectorCache.set(selector, list)
  return list
}

// Node cache
const nodeCache = new Map<number, any>()

function getOrCreateNode(ptr: any) {
  const addr = koffi.address(ptr)
  let node = nodeCache.get(addr)
  if (!node) {
    node = { _ptr: ptr, _addr: addr, _raw: null, _name: null as string | null, _data: undefined as string | undefined, _attribsProxy: null as any, _children: null as any[] | null, _parent: null as any, _next: null as any, _prev: null as any }
    nodeCache.set(addr, node)
  }
  return node
}

function ensureRaw(node: any) {
  if (!node._raw) node._raw = readNode(node._ptr)
  return node._raw
}

function getNodeType(node: any): string {
  const raw = ensureRaw(node)
  const t = raw.type
  if (t === 1) return 'tag'
  if (t === 3) return 'text'
  if (t === 8) return 'comment'
  return 'tag'
}

const _selResults: any[] = []
const _selCb = koffi.register((nodePtr: any, _spec: any, _ctx: any) => {
  if (nodePtr) _selResults.push(nodePtr)
  return 0
}, koffi.pointer(SelectorCb))

function nativeSelectAll(selector: string, rootNode: any): any[] {
  const list = getSelectorList(selector)
  if (!list) return []
  _selResults.length = 0
  try { selectorsFind(gSelectors, rootNode._ptr, list, _selCb, null) } catch (e) { return [] }
  return _selResults.map(ptr => getOrCreateNode(ptr))
}

function wrapNode(node: any) {
  const w: any = {
    _ptr: node._ptr, _node: node,
    get length() { return 1 },
    first() { return w },
    each(fn: any) { fn(0, w); return w },
    find(sel: string) { return wrapList(nativeSelectAll(sel, node)) },
    is(sel: string) {
      const list = getSelectorList(sel)
      if (!list) return false
      let matched = false
      const cb = koffi.register((nodePtr: any, _spec: any, _ctx: any) => {
        if (nodePtr && koffi.address(nodePtr) === node._addr) matched = true
        return 0
      }, koffi.pointer(SelectorCb))
      try {
        const parentNode = node._parent || (ensureRaw(node).parent ? getOrCreateNode(ensureRaw(node).parent) : null)
        const searchRoot = parentNode ? parentNode._ptr : node._ptr
        selectorsFind(gSelectors, searchRoot, list, cb, null)
        koffi.unregister(cb)
      } catch (e) { try { koffi.unregister(cb) } catch (_) {} }
      return matched
    },
    attr(name: string) {
      if (getNodeType(node) !== 'tag') return undefined
      return getAttributeDirect(node._ptr, name)
    },
    text() {
      if (getNodeType(node) === 'text') return node._data || ''
      return getTextContent(node._ptr)
    },
    html() { return serializeInnerHtml(node._ptr) || '' },
    parent() {
      const raw = ensureRaw(node)
      if (!raw.parent) return null
      return wrapNode(getOrCreateNode(raw.parent))
    },
  }
  return w
}

function wrapList(nodes: any[]) {
  const w: any = {
    get length() { return nodes.length },
    first() { return nodes.length > 0 ? wrapNode(nodes[0]) : wrapList([]) },
    each(fn: any) { nodes.forEach((n, i) => fn(i, wrapNode(n))); return w },
    find(sel: string) {
      const all: any[] = []
      for (const n of nodes) all.push(...nativeSelectAll(sel, n))
      return wrapList(all)
    },
    is(sel: string) {
      if (nodes.length === 0) return false
      const list = getSelectorList(sel)
      if (!list) return false
      const target = nodes[0]
      let matched = false
      const cb = koffi.register((nodePtr: any, _spec: any, _ctx: any) => {
        if (nodePtr && koffi.address(nodePtr) === target._addr) matched = true
        return 0
      }, koffi.pointer(SelectorCb))
      try {
        const raw = ensureRaw(target)
        const parentNode = raw.parent ? getOrCreateNode(raw.parent) : null
        const searchRoot = parentNode ? parentNode._ptr : target._ptr
        selectorsFind(gSelectors, searchRoot, list, cb, null)
        koffi.unregister(cb)
      } catch (e) { try { koffi.unregister(cb) } catch (_) {} }
      return matched
    },
    attr(name: string) { return nodes.length > 0 ? wrapNode(nodes[0]).attr(name) : undefined },
    text() { return nodes.map(n => getTextContent(n._ptr)).join('') },
    html() { return nodes.length > 0 ? (serializeInnerHtml(nodes[0]._ptr) || '') : '' },
    parent() {
      if (nodes.length === 0) return wrapList([])
      const raw = ensureRaw(nodes[0])
      if (!raw.parent) return wrapList([])
      return wrapNode(getOrCreateNode(raw.parent))
    },
  }
  return w
}

function load(html: string) {
  nodeCache.clear()
  ensureGlobals()

  const doc = htmlDocumentCreate()
  const buf = Buffer.from(html + '\0', 'utf8')
  const status = htmlDocumentParse(doc, buf, BigInt(html.length))
  if (status !== 0) { htmlDocumentDestroy(doc); throw new Error('lexbor: parse failed') }

  const rootPtr = ptrAt(doc, 112)
  const root = getOrCreateNode(rootPtr)

  function $(selectorOrNode: any) {
    if (typeof selectorOrNode === 'string') {
      return wrapList(nativeSelectAll(selectorOrNode, root))
    }
    if (selectorOrNode && selectorOrNode._ptr) {
      if (selectorOrNode._node) return wrapNode(selectorOrNode._node)
      return wrapNode(getOrCreateNode(selectorOrNode._ptr))
    }
    return wrapList([])
  }

  $.root = () => ({
    find(sel: string) { return wrapList(nativeSelectAll(sel, root)) },
    is() { return false },
    text() { return '' },
    html() { return '' },
    attr() { return undefined },
    get length() { return 1 },
    first() { return this },
    each(fn: any) { fn(0, this); return this },
  })

  $.find = (sel: string) => wrapList(nativeSelectAll(sel, root))
  $.node = (node: any) => {
    if (node && node._node) return wrapNode(node._node)
    if (node && node._ptr) return wrapNode(getOrCreateNode(node._ptr))
    return wrapList([])
  }
  $.destroy = () => { htmlDocumentDestroy(doc); nodeCache.clear() }

  return $
}

// ── Test helpers ──

const fixturesDir = path.resolve(__dirname, 'fixtures')

function loadHtml(file: string): string {
  const fileName = file.endsWith('.html') ? file : file + '.html'
  return fs.readFileSync(path.join(fixturesDir, fileName), 'utf-8')
}

// ── Part 1: Smoke tests ──

describe('lexbor android arm64 smoke test', () => {
  test('basic HTML parsing and text extraction', () => {
    const $ = load('<div class="foo">hello</div>')
    try {
      const result = $('.foo')
      expect(result.length).toBe(1)
      expect(result.text()).toBe('hello')
    } finally { $.destroy() }
  })

  test('attribute extraction', () => {
    const $ = load('<div class="bar" data-id="123">content</div>')
    try {
      const result = $('div')
      expect(result.length).toBe(1)
      expect(result.attr('class')).toBe('bar')
      expect(result.attr('data-id')).toBe('123')
    } finally { $.destroy() }
  })

  test('nested selectors', () => {
    const $ = load('<div><span class="inner">world</span></div>')
    try {
      const result = $('.inner')
      expect(result.length).toBe(1)
      expect(result.text()).toBe('world')
    } finally { $.destroy() }
  })

  test('multiple elements', () => {
    const $ = load('<ul><li>one</li><li>two</li><li>three</li></ul>')
    try {
      const result = $('li')
      expect(result.length).toBe(3)
      expect(result.first().text()).toBe('one')
    } finally { $.destroy() }
  })

  test('no match returns empty list', () => {
    const $ = load('<div>hello</div>')
    try {
      const result = $('.nonexistent')
      expect(result.length).toBe(0)
      expect(result.text()).toBe('')
    } finally { $.destroy() }
  })

  test('complex HTML structure', () => {
    const $ = load(`
      <html>
        <head><title>Test Page</title></head>
        <body>
          <div id="content">
            <h1 class="title">Hello World</h1>
            <p class="description">This is a test</p>
          </div>
        </body>
      </html>
    `)
    try {
      expect($('h1.title').text()).toBe('Hello World')
      expect($('p.description').text()).toBe('This is a test')
    } finally { $.destroy() }
  })

  test('is() selector matching', () => {
    const $ = load('<div class="test">content</div>')
    try {
      const div = $('div')
      expect(div.is('.test')).toBe(true)
      expect(div.is('p')).toBe(false)
    } finally { $.destroy() }
  })

  test('html() serialization', () => {
    const $ = load('<div><b>bold</b></div>')
    try {
      const html = $('div').html()
      expect(html).toContain('<b>')
      expect(html).toContain('bold')
    } finally { $.destroy() }
  })

  test('text content of nested elements', () => {
    const $ = load('<div><span>hello</span><span> world</span></div>')
    try {
      expect($('div').text()).toBe('hello world')
    } finally { $.destroy() }
  })

  test('parent traversal', () => {
    const $ = load('<div class="parent"><span>child</span></div>')
    try {
      const child = $('span')
      expect(child.length).toBe(1)
      const parent = child.parent()
      expect(parent.length).toBe(1)
    } finally { $.destroy() }
  })
})

// ── Part 2: SelectorsMap snapshot comparison (reuses fixtures) ──

describe('lexbor android arm64 selectorsMap snapshot', () => {
  for (const [name, htmlFiles] of Object.entries(selectorsMap)) {
    describe(name, () => {
      for (const htmlFile of htmlFiles) {
        test(`${htmlFile}`, () => {
          const html = loadHtml(htmlFile)
          const selector = selectors[name]

          const startCheerio = performance.now()
          const cheerioResult = temme(html, selector)
          const timeCheerio = performance.now() - startCheerio

          const lexborLoader = (h: string) => load(h)
          const startLexbor = performance.now()
          const lexborResult = temme(html, selector, {}, {}, {}, lexborLoader)
          const timeLexbor = performance.now() - startLexbor

          console.log(
            `[${name}/${htmlFile}] cheerio: ${timeCheerio.toFixed(2)}ms, lexbor: ${timeLexbor.toFixed(2)}ms, ` +
            `speedup: ${(timeCheerio / timeLexbor).toFixed(2)}x`
          )

          expect(JSON.stringify(lexborResult, null, 2)).toEqual(JSON.stringify(cheerioResult, null, 2))
        })
      }
    })
  }
})
