/**
 * 过程（Procedure）定义文件
 *
 * 过程定义了如何从匹配的 DOM 元素中提取数据。
 * 在 temme 选择器中通过 `@` 语法使用，如 `div@html{ $content }`、`a@attr(href){ $link }`
 *
 * 内置过程：
 * - text（默认）：提取元素的文本内容
 * - html：提取元素的内部 HTML
 * - node：提取 DOM 节点本身
 * - find：在文本中查找并提取子串
 * - assign：直接赋值（不从 DOM 提取）
 *
 * 用户可以通过 defineProcedure() 注册自定义过程
 */

import cheerio from 'react-native-cheerio'
import invariant from 'invariant'
import { Capture, Dict, Literal } from './interfaces'
import { CaptureResult } from './CaptureResult'
import { isCapture } from './utils'
import { ASSIGN_PROCEDURE_NAME, DEFAULT_PROCEDURE_NAME } from './constants'

/**
 * 过程函数接口
 * @param result - 捕获结果对象，用于存储提取的数据
 * @param node - 匹配的 DOM 元素（Cheerio 对象）
 * @param args - 过程的参数列表
 */
export interface ProcedureFn {
  (result: CaptureResult, node: any, ...args: any[]): void
}

/**
 * text 过程（默认过程）
 * 提取元素的纯文本内容，等价于 cheerio 的 .text() 方法
 * 这是不指定过程时的默认行为
 *
 * @param result - 捕获结果对象
 * @param node - 匹配的 DOM 元素
 * @param capture - 捕获变量定义
 *
 * @example
 * div{ $text }          // 等价于 div@text{ $text }
 * span@text{ $content } // 显式指定 text 过程
 */
function text(result: CaptureResult, node: any, capture: Capture) {
  result.add(capture, node.text())
}

/**
 * html 过程
 * 提取元素的内部 HTML 内容，等价于 cheerio 的 .html() 方法
 *
 * @param result - 捕获结果对象
 * @param node - 匹配的 DOM 元素
 * @param capture - 捕获变量定义
 *
 * @example
 * div@html{ $content } // 提取 div 内部的 HTML 字符串
 */
function html(result: CaptureResult, node: any, capture: Capture) {
  result.add(capture, node.html())
}

/**
 * node 过程
 * 提取 DOM 节点本身（Cheerio 对象），而非其内容
 * 适用于需要对节点进行进一步操作的场景
 *
 * @param result - 捕获结果对象
 * @param node - 匹配的 DOM 元素
 * @param capture - 捕获变量定义
 *
 * @example
 * div@node{ $element } // 获取 div 元素本身，可在后续使用
 */
function node(result: CaptureResult, node: any, capture: Capture) {
  result.add(capture, cheerio(node))
}

/**
 * find 过程
 * 在元素的文本内容中查找并提取子串
 * 支持三种形式：
 * 1. find('before', $capture)   → 提取 'before' 之后的文本
 * 2. find($capture, 'after')    → 提取 'after' 之前的文本
 * 3. find('pre', $capture, 'post') → 提取 'pre' 和 'post' 之间的文本
 *
 * @param result - 捕获结果对象
 * @param node - 匹配的 DOM 元素
 * @param args - 参数列表，包含字符串标记和捕获变量
 *
 * @example
 * div@find('Price: ', $price)          // 提取 "Price: " 之后的文本
 * div@find($name, ' - end')            // 提取 " - end" 之前的文本
 * div@find('Start: ', $middle, ' End') // 提取两个标记之间的文本
 */
function find(result: CaptureResult, node: any, ...args: (string | Capture)[]) {
  const invalidArgs = 'Invalid arguments received by match(...)'
  // 获取元素的纯文本内容
  const s = node.text()

  if (args.length === 2) {
    const [before, after] = args
    // 验证参数类型：必须一个是字符串，一个是捕获变量
    invariant(
      (typeof before === 'string' && isCapture(after)) ||
        (isCapture(before) && typeof after === 'string'),
      invalidArgs,
    )
    if (typeof before === 'string') {
      // 形式 1：find('before', $capture) - 提取 before 之后的文本
      const capture = after as Capture
      const i = s.indexOf(before)
      if (i === -1) {
        return // 未找到标记字符串，不进行捕获
      }
      result.add(capture, s.substring(i + before.length))
    } else {
      // 形式 2：find($capture, 'after') - 提取 after 之前的文本
      const capture = before as Capture
      const i = s.indexOf(after as string)
      if (i === -1) {
        return // 未找到标记字符串，不进行捕获
      }
      result.add(capture, s.substring(0, i))
    }
  } else {
    // 形式 3：find('pre', $capture, 'post') - 提取两个标记之间的文本
    invariant(args.length === 3, invalidArgs)
    const [before, capture, after] = args as [string, Capture, string]
    invariant(
      typeof before === 'string' && isCapture(capture) && typeof after === 'string',
      invalidArgs,
    )
    // 查找前标记
    const i = s.indexOf(before)
    if (i === -1) {
      return
    }
    // 查找后标记（从前标记之后开始搜索）
    const j = s.indexOf(after, i + before.length)
    if (j === -1) {
      return
    }
    // 提取两个标记之间的文本
    result.add(capture, s.substring(i + before.length, j))
  }
}

/**
 * assign 过程
 * 直接将字面量值赋给捕获变量，不从 DOM 中提取
 * 这是赋值操作（=）对应的过程
 *
 * @param result - 捕获结果对象
 * @param node - 匹配的 DOM 元素（此过程中未使用）
 * @param capture - 捕获变量定义
 * @param value - 要赋的字面量值
 *
 * @example
 * div{ $title = 'Hello' }    // 将字符串 'Hello' 赋给 $title
 * div{ $count = 42 }          // 将数字 42 赋给 $count
 * div{ $flag = true }         // 将布尔值 true 赋给 $flag
 */
function assign(result: CaptureResult, node: any, capture: Capture, value: Literal) {
  result.forceAdd(capture, value)
}

/**
 * 默认过程字典
 * 包含 temme 内置的所有过程函数
 * 键名为过程名称，值为对应的函数实现
 */
export const defaultProcedureDict: Dict<ProcedureFn> = {
  /** 默认过程：提取文本内容（不指定 @ 时使用） */
  [DEFAULT_PROCEDURE_NAME]: text,
  /** 赋值过程：直接赋值（= 操作时使用） */
  [ASSIGN_PROCEDURE_NAME]: assign,
  /** html 过程：提取内部 HTML */
  html,
  /** node 过程：提取 DOM 节点本身 */
  node,
  /** find 过程：在文本中查找并提取子串 */
  find,
}

/**
 * 注册自定义过程
 * 将用户定义的过程函数添加到默认过程字典中
 *
 * @param name - 过程名称（在选择器中通过 @name 使用）
 * @param fn - 过程函数实现
 *
 * @example
 * // 注册一个提取元素 data 属性的过程
 * defineProcedure('data', (result, node, capture, attrName) => {
 *   result.add(capture, node.data(attrName))
 * })
 * // 使用：div@data(myAttr){ $value }
 */
export function defineProcedure(name: string, fn: ProcedureFn) {
  defaultProcedureDict[name] = fn
}
