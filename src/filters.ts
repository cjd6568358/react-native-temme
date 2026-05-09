/**
 * 过滤器（Filter）定义文件
 *
 * 过滤器是 temme 中对捕获值进行转换的函数。
 * 在 temme 选择器中通过 `|` 管道符使用，如 `$price|number`、`$items[]|compact`
 *
 * 过滤器的 this 指向：
 * - 普通过滤器（如 |number）：this 指向当前捕获的值
 * - 数组过滤器（如 |items[]）：this 指向数组中的每个元素
 *
 * 用户可以通过 defineFilter() 注册自定义过滤器
 */

import { Dict } from './interfaces'

/**
 * 过滤器函数接口
 * this 参数指向被过滤的值（由 temme 运行时绑定）
 * 剩余参数为过滤器定义时传入的参数（如 |toFixed(2) 中的 2）
 */
export interface FilterFn {
  (this: any, ...args: any[]): any
}

/**
 * 默认过滤器字典
 * 包含 temme 内置的所有过滤器函数
 * 用户可以通过 defineFilter() 向此字典添加自定义过滤器
 */
export const defaultFilterDict: Dict<FilterFn> = {
  /**
   * pack 过滤器：将数组中的对象合并为单个对象
   * 使用 Object.assign 将所有元素展开合并到一个新对象中
   *
   * 示例：[{a:1}, {b:2}] → {a:1, b:2}
   *
   * 注意：如果数组中有同名属性，后面的值会覆盖前面的值
   */
  pack(this: any[]) {
    return Object.assign({}, ...this)
  },

  /**
   * compact 过滤器：过滤数组中的假值元素
   * 移除数组中所有 falsy 值（null、undefined、0、false、''、NaN）
   *
   * 示例：[0, 1, null, 2, undefined, 3] → [1, 2, 3]
   */
  compact(this: any[]) {
    return this.filter(Boolean)
  },

  /**
   * flatten 过滤器：将嵌套数组展平为一维数组
   * 使用 Array.prototype.flat 方法，仅展平一层
   *
   * 示例：[[1, 2], [3, [4, 5]]] → [1, 2, 3, [4, 5]]
   *
   * 注意：使用 Array.prototype.flat.call(this) 而非 this.flat()
   * 是为了兼容不支持 flat 方法的旧版 JavaScript 环境
   */
  flatten(this: any[][]) {
    return Array.prototype.flat.call(this)
  },

  /**
   * first 过滤器：获取数组的第一个元素
   *
   * 示例：[1, 2, 3] → 1
   */
  first(this: any[]) {
    return this[0]
  },

  /**
   * last 过滤器：获取数组的最后一个元素
   *
   * 示例：[1, 2, 3] → 3
   */
  last(this: any[]) {
    return this[this.length - 1]
  },

  /**
   * get 过滤器：通过键名/索引获取对象或数组的属性值
   *
   * @param key - 要获取的属性名或数组索引
   *
   * 示例：对象 {a: 1, b: 2} |get('a') → 1
   * 示例：数组 [10, 20, 30] |get(1) → 20
   */
  get(this: any, key: any) {
    return this[key]
  },

  /**
   * Number 类型转换过滤器：将值转换为数字
   *
   * 示例：'123' |Number → 123
   * 示例：'abc' |Number → NaN
   */
  Number() {
    return Number(this)
  },

  /**
   * String 类型转换过滤器：将值转换为字符串
   *
   * 示例：123 |String → '123'
   * 示例：null |String → 'null'
   */
  String() {
    return String(this)
  },

  /**
   * Boolean 类型转换过滤器：将值转换为布尔值
   *
   * 示例：0 |Boolean → false
   * 示例：'hello' |Boolean → true
   */
  Boolean() {
    return Boolean(this)
  },

  /**
   * Date 类型转换过滤器：将值转换为 Date 对象
   *
   * 示例：'2024-01-01' |Date → Date 对象
   * 示例：1704067200000 |Date → Date 对象
   */
  Date() {
    return new Date(this)
  },
}

/**
 * 注册自定义过滤器
 * 将用户定义的过滤器函数添加到默认过滤器字典中
 * 注册后的过滤器可在所有 temme 选择器中使用
 *
 * @param name - 过滤器名称（在选择器中通过 |name 使用）
 * @param filter - 过滤器函数实现
 *
 * @example
 * // 注册一个将字符串转为大写的过滤器
 * defineFilter('upper', function() {
 *   return String(this).toUpperCase()
 * })
 * // 使用：$text|upper
 */
export function defineFilter(name: string, filter: FilterFn) {
  defaultFilterDict[name] = filter
}
