/**
 * Lexbor adapter for Android (React Native).
 *
 * Provides the same cheerio-compatible API as lexbor-native.js, but delegates
 * DOM operations to the native Android module backed by liblexbor.so (arm64-v8a).
 *
 * Architecture:
 *   JS adapter  -->  NativeModules.LexborModule  -->  liblexbor.so (C)
 *
 * The native module must expose these synchronous methods:
 *   createDocument(html: string): number    // returns doc handle
 *   destroyDocument(handle: number): void
 *   querySelectorAll(handle: number, selector: string): number[]
 *     // returns array of node handles matching the selector
 *   getNodeText(handle: number, nodeHandle: number): string
 *   getNodeAttr(handle: number, nodeHandle: number, attrName: string): string | null
 *   getNodeHtml(handle: number, nodeHandle: number): string
 *   getNodeOuterHtml(handle: number, nodeHandle: number): string
 *   isNodeMatch(handle: number, nodeHandle: number, selector: string): boolean
 *   getParentHandle(handle: number, nodeHandle: number): number | -1
 *   getChildHandles(handle: number, nodeHandle: number): number[]
 *   getNodeType(handle: number, nodeHandle: number): number
 *     // 1=element, 3=text, 8=comment
 *   getTagName(handle: number, nodeHandle: number): string | null
 *   getRootHandle(handle: number): number
 */

const { NativeModules, Platform } = require('react-native');

const LexborModule = NativeModules.LexborModule;

if (!LexborModule) {
  throw new Error(
    'LexborModule native module is not available. ' +
    'Make sure liblexbor.so is linked and the native module is registered. ' +
    'See native/lexbor-android-arm64-v8a/README.md for setup instructions.'
  );
}

// ── Node wrapper ──

class LexborNode {
  constructor(docHandle, nodeHandle) {
    this._doc = docHandle;
    this._handle = nodeHandle;
    this._name = undefined;
    this._type = undefined;
    this._data = undefined;
    this._attribsProxy = null;
  }

  get type() {
    if (this._type === undefined) {
      const t = LexborModule.getNodeType(this._doc, this._handle);
      if (t === 1) this._type = 'tag';
      else if (t === 3) this._type = 'text';
      else if (t === 8) this._type = 'comment';
      else this._type = 'tag';
    }
    return this._type;
  }

  get name() {
    if (this.type !== 'tag') return undefined;
    if (this._name === undefined) {
      this._name = LexborModule.getTagName(this._doc, this._handle) || null;
    }
    return this._name;
  }

  get data() {
    if (this._data !== undefined) return this._data;
    if (this.type === 'text') {
      this._data = LexborModule.getNodeText(this._doc, this._handle);
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
    const doc = this._doc;
    const handle = this._handle;
    this._attribsProxy = new Proxy({}, {
      get(_, name) {
        if (typeof name !== 'string') return undefined;
        return LexborModule.getNodeAttr(doc, handle, name);
      },
      has(_, name) {
        if (typeof name !== 'string') return false;
        return LexborModule.getNodeAttr(doc, handle, name) !== null;
      },
    });
    return this._attribsProxy;
  }

  get parent() {
    const parentHandle = LexborModule.getParentHandle(this._doc, this._handle);
    if (parentHandle < 0) return null;
    return getOrCreateNode(this._doc, parentHandle);
  }

  get next() {
    // Siblings accessed via parent's children list; not directly exposed.
    // For simplicity, return null (most use cases don't need this).
    return null;
  }

  get prev() {
    return null;
  }

  get children() {
    const handles = LexborModule.getChildHandles(this._doc, this._handle);
    return handles.map(h => getOrCreateNode(this._doc, h));
  }

  _getSerializedHtml() {
    return LexborModule.getNodeHtml(this._doc, this._handle) || '';
  }
}

// ── Node cache (per-document) ──

let _currentDoc = -1;
let _nodeCache = new Map();

function getOrCreateNode(docHandle, nodeHandle) {
  const key = nodeHandle;
  let node = _nodeCache.get(key);
  if (!node) {
    node = new LexborNode(docHandle, nodeHandle);
    _nodeCache.set(key, node);
  }
  return node;
}

function clearNodeCache() {
  _nodeCache.clear();
}

// ── Native selector query ──

function nativeSelectAll(selector, rootNode) {
  const handles = LexborModule.querySelectorAll(rootNode._doc, selector);
  return handles.map(h => getOrCreateNode(rootNode._doc, h));
}

// ── Cheerio-compatible wrappers ──

function wrapNode(node, doc) {
  const w = {
    _handle: node._handle,
    _node: node,
    get length() { return 1; },
    first() { return w; },
    each(fn) { fn(0, w); return w; },
    find(sel) { return wrapList(nativeSelectAll(sel, node), doc); },
    is(sel) {
      return LexborModule.isNodeMatch(node._doc, node._handle, sel);
    },
    attr(name) { return node.attribs[name]; },
    text() {
      if (node.type === 'text') return node.data || '';
      return LexborModule.getNodeText(node._doc, node._handle) || '';
    },
    html() { return node._getSerializedHtml() || ''; },
    parent() {
      const p = node.parent;
      return p ? wrapNode(p, doc) : null;
    },
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
      return LexborModule.isNodeMatch(nodes[0]._doc, nodes[0]._handle, sel);
    },
    attr(name) { return nodes.length > 0 ? nodes[0].attribs[name] : undefined; },
    text() {
      return nodes.map(n =>
        LexborModule.getNodeText(n._doc, n._handle) || ''
      ).join('');
    },
    html() {
      return nodes.length > 0 ? (nodes[0]._getSerializedHtml() || '') : '';
    },
    parent() {
      if (nodes.length === 0) return wrapList([], doc);
      const p = nodes[0].parent;
      return p ? wrapNode(p, doc) : wrapList([], doc);
    },
  };
  return w;
}

// ── load() ──

function load(html) {
  clearNodeCache();

  const docHandle = LexborModule.createDocument(html || '');
  if (docHandle < 0) {
    throw new Error('lexbor-android: failed to create document');
  }

  const rootHandle = LexborModule.getRootHandle(docHandle);
  const root = getOrCreateNode(docHandle, rootHandle);

  function $(selectorOrNode) {
    if (typeof selectorOrNode === 'string') {
      return wrapList(nativeSelectAll(selectorOrNode, root), docHandle);
    }
    if (selectorOrNode && selectorOrNode._node) {
      return wrapNode(selectorOrNode._node, docHandle);
    }
    return wrapList([], docHandle);
  }

  $.root = () => ({
    find(sel) { return wrapList(nativeSelectAll(sel, root), docHandle); },
    is() { return false; },
    text() { return ''; },
    html() { return ''; },
    attr() { return undefined; },
    get length() { return 1; },
    first() { return this; },
    each(fn) { fn(0, this); return this; },
  });

  $.find = (sel) => wrapList(nativeSelectAll(sel, root), docHandle);

  $.node = (node) => {
    if (node instanceof LexborNode) return wrapNode(node, docHandle);
    if (node && node._node) return wrapNode(node._node, docHandle);
    return wrapList([], docHandle);
  };

  $.destroy = () => {
    LexborModule.destroyDocument(docHandle);
    clearNodeCache();
  };

  return $;
}

// ── Exports ──
module.exports = { load, LexborNode, wrapNode, wrapList };
module.exports.default = module.exports;
