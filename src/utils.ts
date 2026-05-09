/**
 * 工具函数文件
 * 提供 temme 解析器内部使用的通用辅助函数
 */

import invariant from 'invariant'
import { Section, Qualifier, AttributeQualifier, Capture } from './interfaces'
import { msg } from './check'

/**
 * 根据 temme 的 Section 数组生成标准 CSS 选择器字符串
 * 这是 temme 内部将解析后的 AST 转换为浏览器/cheerio 可识别的 CSS 选择器的关键函数
 *
 * 转换规则：
 * - 每个 Section 的 combinator、element 和 qualifiers 拼接为 CSS 选择器片段
 * - ID 限定符 → #id
 * - 类名限定符 → .className
 * - 属性限定符 → [attr op "value"]（捕获变量会被跳过，仅检查操作符是否为 =）
 * - 伪类限定符 → :name 或 :name(content)
 *
 * @param sections - 选择器的段落列表
 * @returns 标准 CSS 选择器字符串
 *
 * @example
 * sections = [
 *   { combinator: ' ', element: 'div', qualifiers: [{ type: 'class-qualifier', className: 'foo' }] },
 *   { combinator: '>', element: 'span', qualifiers: [] }
 * ]
 * 返回: "div.foo>span"
 */
export function makeNormalCssSelector(sections: Section[]) {
  const result: string[] = []
  for (const section of sections) {
    // 添加组合器（空格、>、+、~）
    result.push(section.combinator)
    // 添加元素名（如 div、span、* 等）
    result.push(section.element)
    // 遍历所有限定符，转换为对应的 CSS 语法
    for (const qualifier of section.qualifiers) {
      if (qualifier.type === 'id-qualifier') {
        // ID 限定符：#myId
        result.push(`#${qualifier.id}`)
      } else if (qualifier.type === 'class-qualifier') {
        // 类名限定符：.myClass
        result.push(`.${qualifier.className}`)
      } else if (qualifier.type === 'attribute-qualifier') {
        const { attribute, operator, value } = qualifier
        if (operator == null && value == null) {
          // 存在性检查：[attr]（仅检查属性是否存在，不关心值）
          result.push(`[${attribute}]`)
        } else if (isCapture(value)) {
          // 捕获变量：[attr=$capture]（不生成 CSS 选择器，仅验证操作符为 =）
          // 捕获操作在后续的 capture 函数中处理，此处只做语法验证
          invariant(operator === '=', msg.valueCaptureWithOtherOperator())
        } else {
          // 普通属性匹配：[attr="value"] 或 [attr^="value"] 等
          result.push(`[${attribute}${operator}"${value}"]`)
        }
      } else {
        // 伪类/伪元素限定符：:hover、:nth-child(2) 等
        const { name, content } = qualifier
        if (content) {
          result.push(`:${name}(${content})`)
        } else {
          result.push(`:${name}`)
        }
      }
    }
  }
  // 拼接所有片段并去除首尾空格
  return result.join('').trim()
}

/**
 * 检查对象是否为空对象（{}）
 * 不检查 null/undefined，仅检查原型为 Object.prototype 且没有自有属性的对象
 *
 * @param x - 要检查的值
 * @returns 如果是空对象返回 true，否则返回 false
 */
export function isEmptyObject(x: any) {
  return (
    x !== null &&
    typeof x === 'object' &&
    Object.getPrototypeOf(x) === Object.prototype &&
    Object.keys(x).length === 0
  )
}

/**
 * 类型守卫：判断参数是否为 CheerioStatic 对象
 * 通过检查是否存在 root 方法来区分 CheerioStatic 和 CheerioElement
 *
 * @param arg - 要检查的值
 * @returns 如果是 CheerioStatic 返回 true
 */
export function isCheerioStatic(arg: CheerioStatic | CheerioElement): arg is CheerioStatic {
  return typeof (<CheerioStatic>arg).root === 'function'
}

/**
 * 类型守卫：判断限定符是否为属性限定符
 * 属性限定符用于通过元素的属性值来限定匹配条件
 *
 * @param qualifier - 要检查的限定符
 * @returns 如果是 AttributeQualifier 返回 true
 */
export function isAttributeQualifier(qualifier: Qualifier): qualifier is AttributeQualifier {
  return qualifier.type === 'attribute-qualifier'
}

/**
 * 类型守卫：判断值是否为 Capture 对象
 * Capture 对象必须有 name（字符串）和 filterList（数组）属性
 *
 * @param x - 要检查的值
 * @returns 如果是 Capture 返回 true
 */
export function isCapture(x: any): x is Capture {
  return (
    x != null && typeof x === 'object' && typeof x.name === 'string' && Array.isArray(x.filterList)
  )
}

/**
 * 获取数组的最后一个元素
 *
 * @param arr - 输入数组
 * @returns 数组的最后一个元素
 */
export function last<T>(arr: T[]): T {
  return arr[arr.length - 1]
}
