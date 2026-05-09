/**
 * 修饰符（Modifier）定义文件
 *
 * 修饰符控制捕获值如何写入结果对象。
 * 在 temme 选择器中通过 `|=` 语法使用，如 `$result|=candidate`
 *
 * 默认修饰符为 'add'（值不为 null 且非空对象时写入），
 * 如果使用 `forceAdd`（赋值操作 = 的默认修饰符），则无条件写入。
 *
 * 用户可以通过 defineModifier() 注册自定义修饰符
 */

import { CaptureResult } from './CaptureResult'
import { Dict } from './interfaces'
import { isEmptyObject } from './utils'
import { DEFAULT_CAPTURE_KEY } from './constants'

/**
 * 修饰符函数接口
 * @param result - 当前的捕获结果对象
 * @param key - 要写入的键名
 * @param value - 经过过滤器处理后的值
 * @param args - 修饰符的额外参数
 */
export interface ModifierFn {
  (result: CaptureResult, key: string, value: any, ...args: any[]): void
}

/**
 * 默认修饰符字典
 * 包含 temme 内置的所有修饰符函数
 */
export const defaultModifierDict: Dict<ModifierFn> = {
  /**
   * add 修饰符（默认修饰符）
   * 仅当值不为 null 且不为空对象时写入结果
   * 这是普通捕获（$var）的默认行为
   *
   * @param result - 捕获结果对象
   * @param key - 键名
   * @param value - 要写入的值
   */
  add(result, key, value) {
    if (value != null && !isEmptyObject(value)) {
      result.set(key, value)
    }
  },

  /**
   * forceAdd 修饰符
   * 无条件写入结果，即使值为 null 或空对象
   * 这是赋值操作（=）的默认修饰符
   *
   * @param result - 捕获结果对象
   * @param key - 键名
   * @param value - 要写入的值
   */
  forceAdd(result, key, value) {
    result.set(key, value)
  },

  /**
   * candidate 修饰符（候选值）
   * 仅当该键在结果中尚不存在时写入
   * 适用于提供默认值的场景：第一个匹配的值生效，后续的被忽略
   *
   * @param result - 捕获结果对象
   * @param key - 键名
   * @param value - 候选值
   */
  candidate(result, key, value) {
    const oldValue = result.get(key)
    if (!Boolean(oldValue)) {
      result.set(key, value)
    }
  },

  /**
   * array 修饰符
   * 将值追加到数组中，如果该键尚不存在则创建新数组
   * 适用于收集多个同名捕获的场景
   *
   * @param result - 捕获结果对象
   * @param key - 键名
   * @param value - 要追加的值
   *
   * @example
   * // 第一次：$items|array → 创建数组 [value1]
   * // 第二次：$items|array → 追加到数组 [value1, value2]
   */
  array(result, key, value) {
    const array = result.get(key) || []
    array.push(value)
    result.set(key, array)
  },

  /**
   * spread 修饰符（展开）
   * 将对象的键值对分别写入结果，实现对象展开
   * 可选指定前缀，默认使用捕获名作为前缀
   *
   * @param result - 捕获结果对象
   * @param key - 原始键名
   * @param value - 要展开的对象
   * @param prefix - 展开后的键名前缀，默认为 key（捕获名）
   *
   * @example
   * // $info|spread，value = { name: 'John', age: 30 }
   * // 结果：{ infoName: 'John', infoAge: 30 }
   *
   * // $@|spread（默认捕获），value = { a: 1, b: 2 }
   * // 结果：{ a: 1, b: 2 }（无前缀）
   */
  spread(result, key, value, prefix = key) {
    if (value == null) {
      return
    }
    // 默认捕获键不需要前缀
    if (prefix === DEFAULT_CAPTURE_KEY) {
      prefix = ''
    }
    // 将对象的每个键值对写入结果
    for (const k of Object.keys(value)) {
      result.set(prefix + k, value[k])
    }
  },
}

/**
 * 注册自定义修饰符
 * 将用户定义的修饰符函数添加到默认修饰符字典中
 *
 * @param name - 修饰符名称（在选择器中通过 |=name 使用）
 * @param modifier - 修饰符函数实现
 *
 * @example
 * // 注册一个仅在值非空字符串时写入的修饰符
 * defineModifier('nonEmpty', (result, key, value) => {
 *   if (typeof value === 'string' && value.length > 0) {
 *     result.set(key, value)
 *   }
 * })
 * // 使用：$text|=nonEmpty
 */
export function defineModifier(name: string, modifier: ModifierFn) {
  defaultModifierDict[name] = modifier
}
