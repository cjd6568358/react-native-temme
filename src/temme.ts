import cheerio from 'react-native-cheerio'
import invariant from 'invariant'
import { defaultFilterDict, FilterFn } from './filters'
import { defaultProcedureDict, ProcedureFn } from './procedures'
import { defaultModifierDict, ModifierFn } from './modifiers'
import { checkRootSelector, msg } from './check'
import { CaptureResult } from './CaptureResult'
import {
  isAttributeQualifier,
  isCapture,
  isCheerioStatic,
  last,
  makeNormalCssSelector,
} from './utils'
import {
  Dict,
  ExpandedTemmeSelector,
  NormalSelector,
  ParentRefSelector,
  SnippetDefine,
  TemmeSelector,
} from './interfaces'

export interface TemmeParser {
  parse(temmeSelectorString: string): TemmeSelector[]
}

// Note that we are importing .pegjs file directly which requires using rollup as the bundler.
// @ts-ignore
import parser from './grammar.js'

const temmeParser: TemmeParser = parser as unknown as TemmeParser

export { cheerio, temmeParser }

/** 预处理 HTML：移除 script/style/comment 块，减少 HtmlParser 工作量。
 *  这些内容不影响 temme 选择器的匹配结果。 */
export function htmlShaking(html: string): string {
  return (
    html
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/ (alt|checked|disabled|selected|readonly|multiple|nowrap|noshade|noresize|declare|defer|ismap)=""/g, ' $1')
  );
}

// 缓存已解析的选择器字符串，避免重复解析
const selectorCache = new Map<string, TemmeSelector[]>()
// 缓存展开的片段选择器，避免重复计算
const snippetExpandCache = new Map<string, ExpandedTemmeSelector[]>();

export default function temme(
  html: string | CheerioStatic | CheerioElement,
  selector: string | TemmeSelector[],
  extraFilters: Dict<FilterFn> = {},
  extraModifiers: Dict<ModifierFn> = {},
  extraProcedures: Dict<ProcedureFn> = {},
  // 可选的自定义 loader（如 lexbor），替代 cheerio.load
  customLoader?: (html: string) => any,
) {
  // 优化cheerio加载，减少不必要的DOM操作
  let $: any
  if (typeof html === 'string') {
    html = htmlShaking(html)
    if (customLoader) {
      $ = customLoader(html)
    } else {
      $ = cheerio.load(html, { decodeEntities: false, _useHtmlParser2: true })
    }
  } else if (isCheerioStatic(html)) {
    $ = html
  } else {
    $ = cheerio.load(html, { decodeEntities: false, _useHtmlParser2: true })
  }

  // 使用缓存获取选择器数组
  let rootSelectorArray: TemmeSelector[]
  if (typeof selector === 'string') {
    if (selectorCache.has(selector)) {
      rootSelectorArray = selectorCache.get(selector)!
    } else {
      rootSelectorArray = temmeParser.parse(selector)
      selectorCache.set(selector, rootSelectorArray)
    }
  } else {
    rootSelectorArray = selector
  }
  
  if (!rootSelectorArray || rootSelectorArray.length === 0) {
    return null
  }

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    rootSelectorArray.forEach(checkRootSelector)
  }

  // 减少对象创建，使用Object.assign一次性合并
  const filterDict: Dict<FilterFn> = Object.keys(extraFilters).length > 0 ? Object.assign({}, defaultFilterDict, extraFilters) : defaultFilterDict
  const modifierDict: Dict<ModifierFn> = Object.keys(extraModifiers).length > 0 ? Object.assign({}, defaultModifierDict, extraModifiers) : defaultModifierDict
  const procedureDict: Dict<ProcedureFn> = Object.keys(extraProcedures).length > 0 ? Object.assign({}, defaultProcedureDict, extraProcedures) : defaultProcedureDict
  const snippetsMap = new Map<string, SnippetDefine>()
  
  // 缓存展开后的选择器
  const expandedSelectorCache = new Map<TemmeSelector[], ExpandedTemmeSelector[]>()
  
  return helper($.root(), rootSelectorArray).getResult()
  
  function helper(cntCheerio: Cheerio, selectorArray: TemmeSelector[]): CaptureResult {
    const result = new CaptureResult(filterDict, modifierDict)

    // First pass: process SnippetDefine / FilterDefine / ModifierDefine / ProcedureDefine
    for (const selector of selectorArray) {
      if (selector.type === 'snippet-define') {
        invariant(!snippetsMap.has(selector.name), msg.snippetAlreadyDefined(selector.name))
        snippetsMap.set(selector.name, selector)
      } else if (selector.type === 'filter-define') {
        const { name, argsPart, code } = selector
        invariant(!(name in filterDict), msg.filterAlreadyDefined(name))
        filterDict[name] = new Function(argsPart, code) as FilterFn
      } else if (selector.type === 'modifier-define') {
        const { name, argsPart, code } = selector
        invariant(!(name in modifierDict), msg.modifierAlreadyDefined(name))
        modifierDict[name] = new Function(argsPart, code) as ModifierFn
      } else if (selector.type === 'procedure-define') {
        const { name, argsPart, code } = selector
        invariant(!(name in procedureDict), msg.procedureAlreadyDefined(name))
        procedureDict[name] = new Function(argsPart, code) as ProcedureFn
      }
    }

    // 使用缓存获取展开后的选择器
    let expandedSelectors: ExpandedTemmeSelector[];
    if (expandedSelectorCache.has(selectorArray)) {
      expandedSelectors = expandedSelectorCache.get(selectorArray)!;
    } else {
      expandedSelectors = expandSnippets(selectorArray);
      expandedSelectorCache.set(selectorArray, expandedSelectors);
    }

    // Second pass: process match and capture
    for (const selector of expandedSelectors) {
      if (selector.type === 'normal-selector') {
        const cssSelector = makeNormalCssSelector(selector.sections)
        const subCheerio = cntCheerio.find(cssSelector)
        if (subCheerio.length > 0) {
          // Only the first element will be captured.
          capture(result, subCheerio.first(), selector)
        }
        if (selector.arrayCapture) {
          const capturedResults: any[] = []
          subCheerio.each((_, elem) => {
            capturedResults.push(helper($(elem), selector.children).getResult())
          })
          result.add(selector.arrayCapture, capturedResults)
        }
      } else if (selector.type === 'parent-ref-selector') {
        const cssSelector = makeNormalCssSelector([selector.section])
        if (cntCheerio.is(cssSelector)) {
          capture(result, cntCheerio, selector)
        }
      } else if (selector.type === 'assignment') {
        result.forceAdd(selector.capture, selector.value)
      } // else selector.type is 'xxx-define'. Do nothing.
    }
    return result
  }
  
  /** Expand snippets recursively.
   * The returned selector array will not contain any `SnippetExpand`.
   * `expanded` is used to detect circular expansion. */
  function expandSnippets(
    selectorArray: TemmeSelector[],
    expanded: Set<string> = new Set(),
  ): ExpandedTemmeSelector[] {
    const result: ExpandedTemmeSelector[] = []
    for (const selector of selectorArray) {
      if (selector.type === 'snippet-expand') {
        invariant(snippetsMap.has(selector.name), msg.snippetNotDefined(selector.name))
        const snippet = snippetsMap.get(selector.name)!

        // 检查循环展开
        invariant(!expanded.has(snippet.name), msg.circularSnippetExpansion([...expanded, snippet.name]))

        // 使用缓存获取已展开的片段
        const cacheKey = snippet.name + ':' + [...expanded].join(',')
        if (snippetExpandCache.has(cacheKey)) {
          result.push(...snippetExpandCache.get(cacheKey)!)
        } else {
          const nextExpanded = new Set(expanded).add(snippet.name)
          const slice = expandSnippets(snippet.selectors, nextExpanded)
          snippetExpandCache.set(cacheKey, slice)
          result.push(...slice)
        }
      } else {
        result.push(selector)
      }
    }
    return result
  }
  
  /** Capture the node according to the selector. */
  function capture(
    result: CaptureResult,
    node: Cheerio,
    selector: NormalSelector | ParentRefSelector,
  ) {
    const section = selector.type === 'normal-selector' ? last(selector.sections) : selector.section
    const attributeQualifiers = section.qualifiers.filter(isAttributeQualifier)
    for (let i = 0; i < attributeQualifiers.length; i++) {
      const qualifier = attributeQualifiers[i];
      if (isCapture(qualifier.value)) {
        const { attribute, value: capture } = qualifier
        const attributeValue = node.attr(attribute)
        if (attributeValue !== undefined) {
          // capture only when attribute exists
          result.add(capture, attributeValue)
        }
      }
    }

    // 优化过程调用
    if (selector.procedure != null) {
      const { name, args } = selector.procedure
      const fn = procedureDict[name]
      invariant(typeof fn === 'function', msg.invalidProcedure(name))
      fn(result, node, ...args)
    }
  }
}
