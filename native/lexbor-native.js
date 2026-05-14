/**
 * lexbor native wrapper - provides cheerio-compatible API via FFI.
 * Uses lexbor's built-in C CSS selector engine.
 *
 * Performance strategy:
 * - CSS selectors parsed and resolved entirely in C (fast)
 * - Selector lists cached per selector string (avoid re-parsing)
 * - `type` reads struct directly (fast, no serialization)
 * - `name` uses per-local_name tag name cache (serialize ONE element per tag type)
 * - `attribs` uses lxb_dom_element_get_attribute on demand (no serialization)
 * - `text` uses lxb_dom_node_text_content (no serialization)
 * - `html()` uses lxb_html_serialize_tree_cb (only when explicitly requested)
 */

const koffi = require('koffi');
const path = require('path');

// ── FFI bindings ──
const dllPath = path.join(__dirname, 'x64', 'lexbor.dll');
const lib = koffi.load(dllPath);

// HTML Document
const htmlDocumentCreate = lib.func('lxb_html_document_create', 'void*', []);
const htmlDocumentDestroy = lib.func('lxb_html_document_destroy', 'void', ['void*']);
const htmlDocumentParse = lib.func('lxb_html_document_parse', 'uint', ['void*', 'void*', 'uint64']);

// DOM Node
const domNodeTextContent = lib.func('lxb_dom_node_text_content', 'void*', ['void*', 'void*']);
const domElementGetAttribute = lib.func('lxb_dom_element_get_attribute', 'void*', ['void*', 'void*', 'uint64', 'void*']);

// Serialization
const WriteCb = koffi.proto('uint LxWC(const uint8_t *data, uint64 len, void *ctx)');
const serializeTreeCb = lib.func('lxb_html_serialize_tree_cb', 'uint', ['void*', koffi.pointer(WriteCb), 'void*']);

// CSS Parser (for parsing selector strings)
const cssParserCreate = lib.func('lxb_css_parser_create', 'void*', []);
const cssParserInit = lib.func('lxb_css_parser_init', 'uint', ['void*', 'void*']);
const cssParserDestroy = lib.func('lxb_css_parser_destroy', 'void', ['void*']);
const cssSelectorsParse = lib.func('lxb_css_selectors_parse', 'void*', ['void*', 'void*', 'uint64']);
const cssSelectorListDestroyMemory = lib.func('lxb_css_selector_list_destroy_memory', 'void', ['void*']);

// Selectors engine
const selectorsCreate = lib.func('lxb_selectors_create', 'void*', []);
const selectorsInit = lib.func('lxb_selectors_init', 'uint', ['void*']);
const selectorsDestroy = lib.func('lxb_selectors_destroy', 'void', ['void*']);

// lxb_selectors_find(selectors, root_node, selector_list, callback, ctx)
const SelectorCb = koffi.proto('uint LxSelCb(void *node, void *spec, void *ctx)');
const selectorsFind = lib.func('lxb_selectors_find', 'uint', [
  'void*', 'void*', 'void*',
  koffi.pointer(SelectorCb), 'void*',
]);

// ── Node struct layout ──
const NodeLayout = koffi.struct('LxNodeLayout6', {
  _ev0: 'void*', _local_name: 'uint32', _pad1: 'uint32',
  _f16: 'void*', _ns: 'uint32', _pad2: 'uint32',
  _owner_doc: 'void*', next: 'void*', prev: 'void*',
  parent: 'void*', first_child: 'void*', last_child: 'void*',
  _f80: 'void*', type: 'uint32', _pad3: 'uint32',
});

const PP = [];
for (let i = 0; i <= 14; i++) {
  const fields = {};
  for (let j = 0; j < i; j++) fields['_' + j] = 'void*';
  fields['p'] = 'void*';
  PP.push(koffi.struct('LxPP6_' + i, fields));
}

// ── Helpers ──
function ptrAt(ptr, off) { return koffi.decode(ptr, PP[off / 8]).p; }
function readNode(ptr) { return koffi.decode(ptr, NodeLayout); }

// ── Global state: CSS parser, selectors engine, selector cache ──
let gCssParser = null;
let gSelectors = null;
const selectorCache = new Map(); // selector string -> lxb_css_selector_list_t*

function ensureGlobals() {
  if (gCssParser) return;
  gCssParser = cssParserCreate();
  cssParserInit(gCssParser, null);
  gSelectors = selectorsCreate();
  selectorsInit(gSelectors);
}

function destroyGlobals() {
  for (const list of selectorCache.values()) {
    try { cssSelectorListDestroyMemory(list); } catch (e) {}
  }
  selectorCache.clear();
  if (gSelectors) { selectorsDestroy(gSelectors); gSelectors = null; }
  if (gCssParser) { cssParserDestroy(gCssParser); gCssParser = null; }
}

function getSelectorList(selector) {
  let list = selectorCache.get(selector);
  if (list) return list;
  const selBuf = Buffer.from(selector + '\0', 'utf8');
  list = cssSelectorsParse(gCssParser, selBuf, BigInt(selector.length));
  if (!list) return null;
  selectorCache.set(selector, list);
  return list;
}

// ── Direct attribute access via FFI ──
const attrLenBuf = Buffer.alloc(8);

function getAttributeDirect(ptr, name) {
  const nameBuf = Buffer.from(name + '\0', 'utf8');
  attrLenBuf.writeUInt32LE(0, 0);
  try {
    const valPtr = domElementGetAttribute(ptr, nameBuf, BigInt(name.length), attrLenBuf);
    if (!valPtr) return undefined;
    const len = attrLenBuf.readUInt32LE(0);
    if (len === 0) return '';
    return koffi.decode(valPtr, 'char', Math.min(len, 4096));
  } catch (e) {
    return undefined;
  }
}

// ── Text content via FFI ──
function getTextContent(ptr) {
  if (!ptr) return '';
  const lenBuf = Buffer.alloc(8);
  try {
    const tp = domNodeTextContent(ptr, lenBuf);
    const len = lenBuf.readUInt32LE(0);
    if (tp && len > 0 && len < 1000000) return koffi.decode(tp, 'char', len);
  } catch (e) {}
  return '';
}

// ── Tag name cache by local_name ID ──
const tagNameCache = new Map();

function getTagNameFromId(ptr, localNameId) {
  const cached = tagNameCache.get(localNameId);
  if (cached !== undefined) return cached;
  const html = serializeTreeFn(ptr);
  const m = html ? html.match(/^<([a-zA-Z][a-zA-Z0-9]*)/) : null;
  const name = m ? m[1] : 'unknown';
  tagNameCache.set(localNameId, name);
  return name;
}

function serializeTreeFn(ptr) {
  const chunks = [];
  const cb = koffi.register((data, len) => {
    if (data && len > 0) chunks.push(koffi.decode(data, 'char', Number(len)));
    return 0;
  }, koffi.pointer(WriteCb));
  try {
    const s = serializeTreeCb(ptr, cb, null);
    koffi.unregister(cb);
    return s === 0 ? chunks.join('') : null;
  } catch (e) {
    try { koffi.unregister(cb); } catch (_) {}
    return null;
  }
}

// Inner HTML: strip the outermost tag from serialized tree (cheerio-compatible)
function serializeInnerHtml(ptr) {
  const full = serializeTreeFn(ptr);
  if (!full) return '';
  // Remove first opening tag and last closing tag
  let stripped = full.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>\s*$/, '');
  // Normalize to match cheerio's html() serialization:
  // - Single quotes → &apos;
  // - &nbsp; → &#xA0;
  // - Void attributes: alt="" → alt
  stripped = stripped
    .replace(/&nbsp;/g, '&#xA0;')
    .replace(/'/g, '&apos;')
    .replace(/ (alt|checked|disabled|selected|readonly|multiple|nowrap|noshade|noresize|declare|defer|ismap)=""/g, ' $1');
  return stripped;
}

// ── Pointer-to-node cache ──
const nodeCache = new Map();

function getOrCreateNode(ptr) {
  const addr = koffi.address(ptr);
  let node = nodeCache.get(addr);
  if (!node) {
    node = new LexborNode(ptr, addr);
    nodeCache.set(addr, node);
  }
  return node;
}

function clearNodeCache() { nodeCache.clear(); }

// ── Native CSS selector query ──
// lxb_selectors_find treats root as boundary — `>` doesn't match root's children.
// Fix: for selectors starting with `>`, prepend root's tag name and search from parent,
// then filter results to only descendants of the original root node.
function nativeSelectAll(selector, rootNode) {
  let sel = selector;
  let searchRoot = rootNode._ptr;
  let scoped = false;

  if (sel.charAt(0) === '>') {
    const parentNode = rootNode.parent;
    if (!parentNode) return [];
    const rootTag = getTagForNode(rootNode);
    if (!rootTag) return [];
    // e.g., `> tbody > tr` from a table → `table > tbody > tr` searching from parent
    sel = rootTag + ' ' + sel;
    searchRoot = parentNode._ptr;
    scoped = true;
  }

  const list = getSelectorList(sel);
  if (!list) return [];

  const results = [];
  const cb = koffi.register((nodePtr, _spec, _ctx) => {
    if (nodePtr) results.push(nodePtr);
    return 0;
  }, koffi.pointer(SelectorCb));

  try {
    selectorsFind(gSelectors, searchRoot, list, cb, null);
    koffi.unregister(cb);
  } catch (e) {
    try { koffi.unregister(cb); } catch (_) {}
    return [];
  }

  const nodes = results.map(ptr => getOrCreateNode(ptr));

  // For scoped queries (tag-name prefix), filter to descendants of rootNode
  if (scoped) {
    const rootAddr = rootNode._addr;
    return nodes.filter(n => isDescendantOf(n, rootAddr));
  }

  return nodes;
}

// Check if a node is a descendant of the node at rootAddr
function isDescendantOf(node, rootAddr) {
  let cur = node.parent;
  while (cur) {
    if (cur._addr === rootAddr) return true;
    cur = cur.parent;
  }
  return false;
}

// Get tag name for a node (used for constructing scoped selectors)
function getTagForNode(node) {
  if (node.type !== 'tag') return null;
  return node.name || null;
}

// ── LexborNode ──
class LexborNode {
  constructor(ptr, addr) {
    this._ptr = ptr;
    this._addr = addr !== undefined ? addr : koffi.address(ptr);
    this._raw = null;
    this._name = null;
    this._attribsProxy = null;
    this._data = undefined;
    this._children = null;
    this._parent = null;
    this._next = null;
    this._prev = null;
  }

  _ensureRaw() {
    if (!this._raw) this._raw = readNode(this._ptr);
    return this._raw;
  }

  get type() {
    const raw = this._ensureRaw();
    const t = raw.type;
    if (t === 1) return 'tag';
    if (t === 3) return 'text';
    if (t === 8) return 'comment';
    return 'tag';
  }

  get name() {
    if (this.type !== 'tag') return undefined;
    if (this._name !== null) return this._name;
    const raw = this._ensureRaw();
    this._name = getTagNameFromId(this._ptr, raw._local_name);
    return this._name;
  }

  get data() {
    if (this._data !== undefined) return this._data;
    if (this.type === 'text') {
      this._data = getTextContent(this._ptr);
    } else if (this.type === 'comment') {
      this._data = '';
    } else {
      this._data = undefined;
    }
    return this._data;
  }

  get attribs() {
    if (this.type !== 'tag') return {};
    if (this._attribsProxy) return this._attribsProxy;
    const ptr = this._ptr;
    this._attribsProxy = new Proxy({}, {
      get(_, name) {
        if (typeof name !== 'string') return undefined;
        return getAttributeDirect(ptr, name);
      },
      has(_, name) {
        if (typeof name !== 'string') return false;
        return getAttributeDirect(ptr, name) !== undefined;
      },
    });
    return this._attribsProxy;
  }

  get parent() {
    if (this._parent !== null) return this._parent;
    const raw = this._ensureRaw();
    if (!raw.parent) return null;
    this._parent = getOrCreateNode(raw.parent);
    return this._parent;
  }

  get next() {
    if (this._next !== null) return this._next;
    const raw = this._ensureRaw();
    if (!raw.next) return null;
    this._next = getOrCreateNode(raw.next);
    return this._next;
  }

  get prev() {
    if (this._prev !== null) return this._prev;
    const raw = this._ensureRaw();
    if (!raw.prev) return null;
    this._prev = getOrCreateNode(raw.prev);
    return this._prev;
  }

  get children() {
    if (this._children) return this._children;
    const raw = this._ensureRaw();
    this._children = [];
    let childPtr = raw.first_child;
    while (childPtr) {
      let childRaw;
      try { childRaw = readNode(childPtr); } catch (e) { break; }
      const child = getOrCreateNode(childPtr);
      child._raw = childRaw;
      this._children.push(child);
      childPtr = childRaw.next;
    }
    for (let i = 1; i < this._children.length; i++) {
      this._children[i]._prev = this._children[i - 1];
      this._children[i - 1]._next = this._children[i];
    }
    return this._children;
  }

  _getSerializedHtml() {
    return serializeInnerHtml(this._ptr);
  }
}

// ── load() ──
function load(html) {
  clearNodeCache();
  ensureGlobals();

  const doc = htmlDocumentCreate();
  const buf = Buffer.from(html + '\0', 'utf8');
  const status = htmlDocumentParse(doc, buf, BigInt(html.length));
  if (status !== 0) { htmlDocumentDestroy(doc); throw new Error('lexbor: parse failed'); }

  const rootPtr = ptrAt(doc, 112);
  const root = getOrCreateNode(rootPtr);

  function $(selectorOrNode) {
    if (typeof selectorOrNode === 'string') {
      return wrapList(nativeSelectAll(selectorOrNode, root), doc);
    }
    if (selectorOrNode && selectorOrNode._ptr) {
      if (selectorOrNode instanceof LexborNode) return wrapNode(selectorOrNode, doc);
      return wrapNode(new LexborNode(selectorOrNode._ptr), doc);
    }
    return wrapList([], doc);
  }

  $.root = () => ({
    find(sel) { return wrapList(nativeSelectAll(sel, root), doc); },
    is() { return false; },
    text() { return ''; },
    html() { return ''; },
    attr() { return undefined; },
    get length() { return 1; },
    first() { return this; },
    each(fn) { fn(0, this); return this; },
  });

  $.find = (sel) => wrapList(nativeSelectAll(sel, root), doc);
  $.destroy = () => { htmlDocumentDestroy(doc); clearNodeCache(); };
  return $;
}

function wrapNode(node, doc) {
  const w = {
    _ptr: node._ptr,
    get length() { return 1; },
    first() { return w; },
    each(fn) { fn(0, w); return w; },
    find(sel) { return wrapList(nativeSelectAll(sel, node), doc); },
    is(sel) {
      const list = getSelectorList(sel);
      if (!list) return false;
      // Check if this specific node matches the selector
      let matched = false;
      const cb = koffi.register((nodePtr, _spec, _ctx) => {
        if (nodePtr && koffi.address(nodePtr) === node._addr) matched = true;
        return 0;
      }, koffi.pointer(SelectorCb));
      try {
        // Search from parent; if node matches, callback fires
        const parentNode = node.parent;
        const searchRoot = parentNode ? parentNode._ptr : node._ptr;
        selectorsFind(gSelectors, searchRoot, list, cb, null);
        koffi.unregister(cb);
      } catch (e) {
        try { koffi.unregister(cb); } catch (_) {}
      }
      return matched;
    },
    attr(name) { return node.attribs[name]; },
    text() {
      if (node.type === 'text') return node.data || '';
      return getTextContent(node._ptr);
    },
    html() { return node._getSerializedHtml() || ''; },
    parent() { return node.parent ? wrapNode(node.parent, doc) : null; },
  };
  return w;
}

function wrapList(nodes, doc) {
  const w = {
    get length() { return nodes.length; },
    first() { return nodes.length > 0 ? wrapNode(nodes[0], doc) : wrapList([], doc); },
    each(fn) { nodes.forEach((n, i) => fn(i, wrapNode(n, doc))); return w; },
    find(sel) {
      const all = [];
      for (const n of nodes) all.push(...nativeSelectAll(sel, n));
      return wrapList(all, doc);
    },
    is(sel) {
      if (nodes.length === 0) return false;
      const list = getSelectorList(sel);
      if (!list) return false;
      const target = nodes[0];
      let matched = false;
      const cb = koffi.register((nodePtr, _spec, _ctx) => {
        if (nodePtr && koffi.address(nodePtr) === target._addr) matched = true;
        return 0;
      }, koffi.pointer(SelectorCb));
      try {
        const parentNode = target.parent;
        const searchRoot = parentNode ? parentNode._ptr : target._ptr;
        selectorsFind(gSelectors, searchRoot, list, cb, null);
        koffi.unregister(cb);
      } catch (e) {
        try { koffi.unregister(cb); } catch (_) {}
      }
      return matched;
    },
    attr(name) { return nodes.length > 0 ? nodes[0].attribs[name] : undefined; },
    text() { return nodes.map(n => getTextContent(n._ptr)).join(''); },
    html() { return nodes.length > 0 ? (nodes[0]._getSerializedHtml() || '') : ''; },
    parent() {
      if (nodes.length === 0) return wrapList([], doc);
      const p = nodes[0].parent;
      return p ? wrapNode(p, doc) : wrapList([], doc);
    },
  };
  return w;
}

module.exports = { load };
module.exports.default = module.exports;
