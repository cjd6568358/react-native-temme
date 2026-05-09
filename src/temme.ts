/**
 * temme 核心模块文件
 *
 * 这是 temme 库的核心实现，包含：
 * 1. HTML 解析和加载（使用 cheerio）
 * 2. 选择器解析和缓存
 * 3. 递归的 DOM 匹配和数据提取逻辑
 * 4. 片段（snippet）的定义和展开
 * 5. 捕获（capture）操作的执行
 *
 * 整体流程：
 * 1. 加载 HTML → cheerio DOM 树
 * 2. 解析 temme 选择器字符串 → AST（抽象语法树）
 * 3. 递归遍历 AST，对每个选择器节点：
 *    a. 生成对应的 CSS 选择器
 *    b. 在 DOM 中查找匹配元素
 *    c. 根据捕获定义提取数据
 *    d. 应用过滤器和修饰符
 * 4. 返回最终的结构化数据结果
 */

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
  Section,
  SnippetDefine,
  TemmeSelector,
} from './interfaces'

/**
 * temme 解析器接口
 * 定义了选择器字符串的解析方法
 */
export interface TemmeParser {
  /**
   * 将 temme 选择器字符串解析为 AST
   * @param temmeSelectorString - temme 选择器字符串
   * @returns 解析后的选择器 AST 数组
   */
  parse(temmeSelectorString: string): TemmeSelector[]
}

// Note that we are importing .pegjs file directly which requires using rollup as the bundler.
// grammar.js 是由 PEG.js 语法文件自动生成的解析器
// @ts-ignore
import parser from './grammar.js'

/**
 * temme 选择器解析器实例
 * 由 PEG.js 生成，负责将 temme 选择器字符串解析为 AST
 */
const temmeParser: TemmeParser = parser as unknown as TemmeParser

// 导出 cheerio 和解析器，供外部使用
export { cheerio, temmeParser }

// ==================== 缓存系统 ====================
// 以下缓存用于避免重复计算，提高多次调用 temme 时的性能
// 缓存使用模块级 Map 实现，在所有 temme 调用间共享

/**
 * 选择器字符串解析缓存
 * 缓存已解析的选择器 AST，避免重复调用 PEG.js 解析器
 * key: 选择器字符串，value: 解析后的 AST 数组
 */
const selectorCache = new Map<string, TemmeSelector[]>()

/**
 * CSS 选择器字符串缓存
 * 缓存从 Section[] 生成的 CSS 选择器字符串
 * key: Section 数组引用，value: CSS 选择器字符串
 */
const cssSelectorCache = new Map<Section[], string>();

/**
 * 单段 Section CSS 选择器缓存
 * 用于父引用选择器（ParentRefSelector）的 CSS 选择器生成
 * key: Section 引用，value: CSS 选择器字符串
 */
const sectionCssCache = new Map<Section, string>();

/**
 * 片段展开缓存
 * 缓存片段展开的结果，避免重复递归展开
 * key: 片段名 + 展开路径（用于检测循环展开），value: 展开后的选择器数组
 */
const snippetExpandCache = new Map<string, ExpandedTemmeSelector[]>();

/**
 * 属性限定符缓存
 * 缓存 Section 的属性限定符过滤结果
 * key: Section 引用，value: 属性限定符数组
 */
const qualifierCache = new Map();

// ==================== 核心函数 ====================

/**
 * temme 主函数 - 从 HTML 中提取结构化数据
 *
 * 这是 temme 库的入口函数，完成从 HTML 到结构化数据的完整转换流程。
 *
 * @param html - HTML 源，支持三种形式：
 *   - string: HTML 字符串（最常用）
 *   - CheerioStatic: 已加载的 cheerio 实例（避免重复解析）
 *   - CheerioElement: 单个 DOM 元素
 * @param selector - temme 选择器，支持两种形式：
 *   - string: temme 选择器字符串（会自动解析为 AST）
 *   - TemmeSelector[]: 已解析的选择器 AST（跳过解析步骤）
 * @param extraFilters - 额外的过滤器字典（临时添加，不影响全局默认过滤器）
 * @param extraModifiers - 额外的修饰符字典
 * @param extraProcedures - 额外的过程字典
 * @returns 提取的结构化数据，如果没有匹配返回 null
 *
 * @example
 * // 基本用法
 * const result = temme(html, 'div.title{ $text }')
 *
 * // 带过滤器
 * const result = temme(html, 'span.price{ $value|number }')
 *
 * // 带子选择器
 * const result = temme(html, 'ul{ li[]{ $item } }')
 *
 * // 使用自定义过滤器
 * const result = temme(html, 'div{ $text|upper }', {
 *   upper() { return String(this).toUpperCase() }
 * })
 */
export default function temme(
  html: string | CheerioStatic | CheerioElement,
  selector: string | TemmeSelector[],
  extraFilters: Dict<FilterFn> = {},
  extraModifiers: Dict<ModifierFn> = {},
  extraProcedures: Dict<ProcedureFn> = {},
) {
  // ==================== 第一步：加载 HTML ====================
  // 根据输入类型选择合适的加载方式
  let $: CheerioStatic
  if (typeof html === 'string') {
    // 最常见的情况：从 HTML 字符串加载
    // decodeEntities: true → 自动解码 HTML 实体（如 &amp; → &）
    // _useHtmlParser2: false → 使用默认解析器
    $ = cheerio.load(html, { decodeEntities: true, _useHtmlParser2: false })
  } else if (isCheerioStatic(html)) {
    // 已经是 CheerioStatic 实例，直接使用（避免重复解析）
    $ = html
  } else {
    // 单个 DOM 元素，包装后加载
    $ = cheerio.load(html, { _useHtmlParser2: false })
  }

  // ==================== 第二步：解析选择器 ====================
  // 如果传入的是字符串，解析为 AST；否则直接使用
  let rootSelectorArray: TemmeSelector[]
  if (typeof selector === 'string') {
    if (selectorCache?.has(selector)) {
      // 缓存命中，直接使用已解析的 AST
      rootSelectorArray = selectorCache.get(selector)!
    } else {
      // 缓存未命中，调用 PEG.js 解析器解析选择器字符串
      rootSelectorArray = temmeParser.parse(selector)
      // 将解析结果存入缓存
      selectorCache.set(selector, rootSelectorArray)
    }
  } else {
    // 传入的已经是 AST，直接使用
    rootSelectorArray = selector
  }

  // 空选择器检查
  if (!rootSelectorArray || rootSelectorArray.length === 0) {
    return null
  }

  // ==================== 第三步：选择器校验（仅开发模式） ====================
  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    // 在开发模式下校验每个顶层选择器的合法性
    // 检查：属性捕获位置、父引用位置、片段/过滤器定义位置等
    rootSelectorArray.forEach(checkRootSelector)
  }

  // ==================== 第四步：合并过滤器/修饰符/过程字典 ====================
  // 将默认字典和用户提供的额外字典合并
  // 使用 Object.assign 一次性合并，减少中间对象创建
  const filterDict: Dict<FilterFn> = Object.assign({}, defaultFilterDict, extraFilters)
  const modifierDict: Dict<ModifierFn> = Object.assign({}, defaultModifierDict, extraModifiers)
  const procedureDict: Dict<ProcedureFn> = Object.assign({}, defaultProcedureDict, extraProcedures)

  /**
   * 片段定义映射表
   * 存储当前选择器中定义的所有片段
   * key: 片段名称，value: 片段定义
   */
  const snippetsMap = new Map<string, SnippetDefine>()

  /**
   * 展开后的选择器缓存（函数级，每次调用 temme 时重新创建）
   * 缓存同一选择器数组的展开结果，避免在递归处理子选择器时重复展开
   * key: 选择器数组引用，value: 展开后的选择器数组
   */
  const expandedSelectorCache = new Map<TemmeSelector[], ExpandedTemmeSelector[]>()

  // ==================== 第五步：执行数据提取 ====================
  // 从根节点开始，递归处理所有选择器
  return helper($.root(), rootSelectorArray).getResult()

  /**
   * 递归处理选择器的核心函数
   *
   * 处理流程：
   * 1. 创建新的 CaptureResult 实例
   * 2. 第一遍遍历：处理定义（片段、过滤器、修饰符、过程）
   * 3. 展开片段引用
   * 4. 第二遍遍历：执行匹配和数据提取
   *
   * @param cntCheerio - 当前上下文的 Cheerio 对象（在此范围内查找子元素）
   * @param selectorArray - 要处理的选择器数组
   * @returns 包含所有捕获数据的 CaptureResult
   */
  function helper(cntCheerio: Cheerio, selectorArray: TemmeSelector[]): CaptureResult {
    const result = new CaptureResult(filterDict, modifierDict)

    // ==================== 第一遍：处理定义 ====================
    // 遍历选择器数组，处理所有类型为 'xxx-define' 的节点
    // 这些定义会影响后续的匹配和提取行为
    for (const selector of selectorArray) {
      if (selector.type === 'snippet-define') {
        // 片段定义：将片段存入映射表，供后续引用
        invariant(!snippetsMap?.has(selector.name), msg.snippetAlreadyDefined(selector.name))
        snippetsMap.set(selector.name, selector)
      } else if (selector.type === 'filter-define') {
        // 过滤器定义：动态创建函数并添加到过滤器字典
        const { name, argsPart, code } = selector
        invariant(!(name in filterDict), msg.filterAlreadyDefined(name))
        // 使用 eval 将字符串代码转换为函数
        // 这是 temme 支持内联过滤器定义的关键机制
        const funcString = `(function (${argsPart}) { ${code} })`
        filterDict[name] = eval(funcString)
      } else if (selector.type === 'modifier-define') {
        // 修饰符定义：动态创建函数并添加到修饰符字典
        const { name, argsPart, code } = selector
        invariant(!(name in modifierDict), msg.modifierAlreadyDefined(name))
        const funcString = `(function (${argsPart}) { ${code} })`
        modifierDict[name] = eval(funcString)
      } else if (selector.type === 'procedure-define') {
        // 过程定义：动态创建函数并添加到过程字典
        const { name, argsPart, code } = selector
        invariant(!(name in procedureDict), msg.procedureAlreadyDefined(name))
        const funcString = `(function (${argsPart}) { ${code} })`
        procedureDict[name] = eval(funcString)
      }
    }

    // ==================== 展开片段引用 ====================
    // 将所有 SnippetExpand 节点替换为其对应片段的内容
    let expandedSelectors: ExpandedTemmeSelector[];
    if (expandedSelectorCache?.has(selectorArray)) {
      // 缓存命中，直接使用已展开的结果
      expandedSelectors = expandedSelectorCache.get(selectorArray)!;
    } else {
      // 缓存未命中，递归展开所有片段引用
      expandedSelectors = expandSnippets(selectorArray);
      expandedSelectorCache.set(selectorArray, expandedSelectors);
    }

    // ==================== 第二遍：执行匹配和数据提取 ====================
    for (const selector of expandedSelectors) {
      if (selector.type === 'normal-selector') {
        // ---------- 普通选择器处理 ----------

        // 生成 CSS 选择器字符串（使用缓存）
        let cssSelector: string;
        if (cssSelectorCache.has(selector.sections)) {
          cssSelector = cssSelectorCache.get(selector.sections)!;
        } else {
          cssSelector = makeNormalCssSelector(selector.sections);
          cssSelectorCache.set(selector.sections, cssSelector);
        }

        // 在当前上下文中查找匹配的元素
        const subCheerio = cntCheerio.find(cssSelector)
        if (subCheerio.length > 0) {
          // 对第一个匹配元素执行捕获操作
          capture(result, subCheerio.first(), selector)
        }

        // 处理数组捕获（如 `div[]{ $item }`）
        if (selector.arrayCapture) {
          // 将所有匹配元素转换为数组
          const elements = subCheerio.toArray();
          const capturedResults = [];
          // 对每个元素递归处理子选择器
          for (let i = 0; i < elements.length; i++) {
            capturedResults.push(helper($(elements[i]), selector.children).getResult());
          }
          // 将所有结果添加到数组捕获中
          result.add(selector.arrayCapture, capturedResults);
        }
      } else if (selector.type === 'parent-ref-selector') {
        // ---------- 父引用选择器处理 ----------

        // 生成 CSS 选择器字符串（使用缓存）
        let cssSelector: string;
        if (sectionCssCache.has(selector.section)) {
          cssSelector = sectionCssCache.get(selector.section)!;
        } else {
          cssSelector = makeNormalCssSelector([selector.section]);
          sectionCssCache.set(selector.section, cssSelector);
        }

        // 检查当前元素是否匹配父引用选择器
        // 父引用选择器使用 `&` 引用当前上下文元素
        if (cntCheerio.is(cssSelector)) {
          capture(result, cntCheerio, selector)
        }
      } else if (selector.type === 'assignment') {
        // ---------- 赋值操作处理 ----------

        // 直接将字面量值写入结果，不从 DOM 提取
        result.forceAdd(selector.capture, selector.value)
      }
      // 其他类型（xxx-define）在第一遍已经处理，此处跳过
    }
    return result
  }

  /**
   * 递归展开片段引用
   *
   * 将选择器数组中的所有 SnippetExpand 节点替换为其对应片段的实际内容。
   * 支持嵌套展开（片段引用其他片段）和循环检测。
   *
   * @param selectorArray - 要展开的选择器数组
   * @param expanded - 已展开的片段名称列表（用于循环检测）
   * @returns 展开后的选择器数组（不包含任何 SnippetExpand 节点）
   *
   * @example
   * // 假设定义了片段 $list = li{ $item }
   * // 展开前：[ul, SnippetExpand('list')]
   * // 展开后：[ul, NormalSelector(li{ $item })]
   */
  function expandSnippets(
    selectorArray: TemmeSelector[],
    expanded: string[] = [],
  ): ExpandedTemmeSelector[] {
    const result: ExpandedTemmeSelector[] = []
    for (const selector of selectorArray) {
      if (selector.type === 'snippet-expand') {
        // 查找片段定义
        invariant(snippetsMap.has(selector.name), msg.snippetNotDefined(selector.name))
        const snippet = snippetsMap.get(selector.name)!

        // 循环展开检测
        // 如果当前片段已经在展开路径中，说明存在循环引用
        invariant(!expanded.includes(snippet.name), msg.circularSnippetExpansion(expanded.concat(snippet.name)))

        // 构建缓存键：片段名 + 展开路径
        // 不同的展开路径可能导致不同的结果（因为上下文不同）
        const cacheKey = snippet.name + ':' + expanded.join(',')
        if (snippetExpandCache?.has(cacheKey)) {
          // 缓存命中，使用已展开的结果
          result.push(...snippetExpandCache.get(cacheKey)!)
        } else {
          // 缓存未命中，递归展开片段内容
          const nextExpanded = expanded.concat(snippet.name)
          const slice = expandSnippets(snippet.selectors, nextExpanded)
          snippetExpandCache.set(cacheKey, slice)
          result.push(...slice)
        }
      } else {
        // 非片段引用节点，直接保留
        result.push(selector)
      }
    }
    return result
  }

  /**
   * 执行捕获操作
   *
   * 从匹配的 DOM 元素中提取数据，并根据选择器中的捕获定义写入结果。
   *
   * 处理内容：
   * 1. 属性捕获：从元素的属性中提取值（如 [href=$link]）
   * 2. 过程调用：通过过程函数提取数据（如 @text、@html）
   *
   * @param result - 捕获结果对象
   * @param node - 匹配的 DOM 元素
   * @param selector - 选择器定义（普通选择器或父引用选择器）
   */
  function capture(
    result: CaptureResult,
    node: Cheerio,
    selector: NormalSelector | ParentRefSelector,
  ) {
    // 获取最后一个 Section（属性捕获只在最后一个段落中有效）
    const section = selector.type === 'normal-selector' ? last(selector.sections) : selector.section

    // 获取属性限定符（使用缓存）
    let attributeQualifiers;
    if (qualifierCache?.has(section)) {
      attributeQualifiers = qualifierCache.get(section)!;
    } else {
      // 从所有限定符中筛选出属性限定符
      attributeQualifiers = section.qualifiers.filter(isAttributeQualifier);
      qualifierCache.set(section, attributeQualifiers);
    }

    // 处理属性捕获（如 [href=$link]、[data-id=$id]）
    for (let i = 0; i < attributeQualifiers.length; i++) {
      const qualifier = attributeQualifiers[i];
      if (isCapture(qualifier.value)) {
        // 该属性限定符包含捕获变量
        const { attribute, value: capture } = qualifier
        // 从元素中获取属性值
        const attributeValue = node.attr(attribute)
        if (attributeValue !== undefined) {
          // 仅当属性存在时才进行捕获（避免捕获 undefined）
          result.add(capture, attributeValue)
        }
      }
    }

    // 处理过程调用（如 @text、@html、@node、@find）
    if (selector.procedure != null) {
      const { name, args } = selector.procedure
      // 从过程字典中查找过程函数
      const fn = procedureDict[name]
      invariant(typeof fn === 'function', msg.invalidProcedure(name))
      // 调用过程函数，传入结果对象、DOM 元素和参数
      fn(result, node, ...args)
    }
  }
}
