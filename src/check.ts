/**
 * 选择器校验文件
 * 提供 temme 选择器的语法校验功能，在开发模式下检查选择器的合法性
 * 校验包括：结构检查、位置检查、名称冲突检查等
 */

import { Qualifier, Section, TemmeSelector } from './interfaces'

/**
 * 错误消息对象
 * 定义所有校验失败时的错误提示信息
 * 每个函数返回一个描述性的错误字符串
 */
export const msg = {
  /** 过滤器名称无效（未在过滤器字典中找到） */
  invalidFilter(name: string) {
    return `${name} is not a valid filter.`
  },
  /** 修饰符名称无效（未在修饰符字典中找到） */
  invalidModifier(name: string) {
    return `${name} is not a valid modifier.`
  },
  /** 过程名称无效（未在过程字典中找到） */
  invalidProcedure(name: string) {
    return `${name} is not a valid procedure.`
  },
  /** 属性捕获出现在非最后一个选择器段落中（仅最后一段允许捕获） */
  hasLeadingAttributeCapture() {
    return 'Attribute capturing is only allowed in the last css section. Capture in leading css-selectors will be omitted.'
  },
  /** 父引用选择器（&）出现在顶层（不允许，必须在嵌套选择器中使用） */
  parentRefSelectorAtTopLevel() {
    return `Parent-reference must not be at top level.`
  },
  /** 片段名称重复定义 */
  snippetAlreadyDefined(name: string) {
    return `Snippet \`${name}\` is already defined.`
  },
  /** 片段定义不在顶层（必须在顶层定义，不能嵌套在子选择器中） */
  snippetDefineNotAtTopLevel(name: string) {
    return `The definition of snippet \`${name}\` must be at top level.`
  },
  /** 内联过滤器定义不在顶层 */
  filterDefineNotAtTopLevel(name: string) {
    return `The definition of inline filter \`${name}\` must be at top level.`
  },
  /** 过滤器名称重复定义 */
  filterAlreadyDefined(name: string) {
    return `Filter \`${name}\` is already defined.`
  },
  /** 修饰符名称重复定义 */
  modifierAlreadyDefined(name: string) {
    return `Modifier ${name} is already defined.`
  },
  /** 过程名称重复定义 */
  procedureAlreadyDefined(name: string) {
    return `Procedure ${name} is already defined.`
  },
  /** 引用的片段未定义 */
  snippetNotDefined(name: string) {
    return `Snippet \`${name}\` is not defined.`
  },
  /** 属性捕获使用了非 = 操作符（捕获仅支持 = 操作符） */
  valueCaptureWithOtherOperator() {
    return 'Value capture in attribute qualifier only works with `=` operator.'
  },
  /** 检测到片段循环展开（如 A 引用 B，B 又引用 A） */
  circularSnippetExpansion(loop: string[]) {
    return `Circular snippet expansion detected: ${loop.join(' -> ')}`
  },
  /** 数组过滤器应用于非数组值 */
  arrayFilterAppliedToNonArrayValue(filterName: string) {
    return `Array-filter \`${filterName}\` can only be applied to an array.`
  },
}

/**
 * 检查限定符是否为包含捕获变量的属性限定符
 * 捕获变量的属性限定符的 value 是一个对象（Capture），而非普通字符串
 *
 * @param qualifier - 要检查的限定符
 * @returns 如果是包含捕获的属性限定符返回 true
 */
function isCaptureQualifier(qualifier: Qualifier) {
  return (
    qualifier.type === 'attribute-qualifier' &&
    qualifier.value &&
    typeof qualifier.value === 'object'
  )
}

/**
 * 检查 Section 数组中是否包含任何捕获变量
 * 用于验证属性捕获是否出现在了不允许的位置（非最后一个段落）
 *
 * @param sections - 选择器的段落列表
 * @returns 如果任何段落包含捕获变量返回 true
 */
function containsAnyCapture(sections: Section[]) {
  return sections.some(section => section.qualifiers.some(isCaptureQualifier))
}

/**
 * 校验顶层选择器
 * 在开发模式下，temme 会调用此函数检查每个顶层选择器的合法性
 *
 * 校验规则：
 * 1. 通用检查（commonCheck）：属性捕获只能出现在最后一个 CSS 段落中
 * 2. 父引用选择器不能出现在顶层
 * 3. 普通选择器的子选择器必须通过 checkChild 校验
 * 4. 片段定义的子选择器必须通过 checkChild 校验
 *
 * @param selector - 要校验的顶层选择器
 * @throws 如果校验失败抛出 Error
 */
export function checkRootSelector(selector: TemmeSelector) {
  // 执行通用检查
  commonCheck(selector)
  if (selector.type === 'parent-ref-selector') {
    // 父引用选择器（&）不能在顶层使用，必须嵌套在其他选择器中
    throw new Error(msg.parentRefSelectorAtTopLevel())
  } else if (selector.type === 'normal-selector') {
    // 递归校验所有子选择器
    for (const child of selector.children) {
      checkChild(child)
    }
  } else if (selector.type === 'snippet-define') {
    // 递归校验片段定义中的所有选择器
    for (const child of selector.selectors) {
      checkChild(child)
    }
  }
}

/**
 * 通用校验函数
 * 检查选择器的基本规则：属性捕获只能出现在最后一个 CSS 段落中
 *
 * 为什么有这个限制？
 * 因为 temme 在生成 CSS 选择器时会忽略捕获变量（只检查操作符是否为 =），
 * 捕获操作在匹配成功后才执行。如果捕获出现在非最后段落，
 * 该段落的属性限定符会被忽略，可能导致匹配行为不符合用户预期。
 *
 * @param selector - 要校验的选择器
 * @throws 如果前置段落包含属性捕获则抛出 Error
 */
function commonCheck(selector: TemmeSelector) {
  if (selector.type === 'normal-selector') {
    const sectionCount = selector.sections.length
    // 取除最后一个段落外的所有前置段落
    const leadingSections = selector.sections.slice(0, sectionCount - 1)
    // 检查前置段落是否包含捕获变量
    const hasLeadingCapture = containsAnyCapture(leadingSections)
    if (hasLeadingCapture) {
      throw new Error(msg.hasLeadingAttributeCapture())
    }
  }
}

/**
 * 校验子选择器
 * 子选择器比顶层选择器有更严格的限制：
 * 1. 不能包含片段定义（片段必须在顶层定义）
 * 2. 不能包含过滤器定义（过滤器必须在顶层定义）
 * 3. 普通选择器的子选择器需要递归校验
 *
 * @param selector - 要校验的子选择器
 * @throws 如果校验失败抛出 Error
 */
export function checkChild(selector: TemmeSelector) {
  // 执行通用检查
  commonCheck(selector)
  if (selector.type === 'snippet-define') {
    // 片段定义必须在顶层，不能嵌套在子选择器中
    throw new Error(msg.snippetDefineNotAtTopLevel(selector.name))
  } else if (selector.type === 'filter-define') {
    // 过滤器定义必须在顶层，不能嵌套在子选择器中
    throw new Error(msg.filterDefineNotAtTopLevel(selector.name))
  } else if (selector.type === 'normal-selector') {
    // 递归校验更深层的子选择器
    for (const child of selector.children) {
      checkChild(child)
    }
  }
}
