/**
 * 捕获结果（CaptureResult）类文件
 *
 * CaptureResult 是 temme 运行时的核心数据容器。
 * 它负责：
 * 1. 存储所有捕获的数据（键值对形式）
 * 2. 应用过滤器链对捕获值进行转换
 * 3. 应用修饰符控制数据写入方式
 * 4. 提供最终结果的获取和格式化
 *
 * 每次 temme 调用都会创建一个 CaptureResult 实例，
 * 所有捕获操作（add、forceAdd）都在此实例上进行
 */

import invariant from 'invariant'
import { Capture, Dict, Filter, Modifier } from './interfaces'
import { FilterFn } from './filters'
import { DEFAULT_CAPTURE_KEY } from './constants'
import { isEmptyObject } from './utils'
import { msg } from './check'
import { ModifierFn } from './modifiers'

/**
 * 默认的 add 修饰符（普通捕获使用）
 * 值不为 null 且非空对象时写入结果
 */
const addModifier: Modifier = { name: 'add', args: [] }

/**
 * 默认的 forceAdd 修饰符（赋值操作使用）
 * 无条件写入结果
 */
const forceAddModifier: Modifier = { name: 'forceAdd', args: [] }

/**
 * CaptureResult 类
 * temme 运行时的捕获结果容器，管理所有从 DOM 中提取的数据
 */
export class CaptureResult {
  /**
   * 内部结果存储对象
   * 所有捕获的键值对都存储在此对象中
   * 使用普通对象而非 Map，便于序列化和结果输出
   */
  private readonly result: any = {}

  /**
   * 过滤器函数缓存
   * 避免在同一个 CaptureResult 实例中重复查找过滤器函数
   * 提高过滤器链的执行效率
   */
  private filterFnCache = new Map<string, FilterFn>();

  /**
   * 构造函数
   * @param filterDict - 过滤器字典（包含默认过滤器和用户自定义过滤器）
   * @param modifierDict - 修饰符字典（包含默认修饰符和用户自定义修饰符）
   */
  constructor(readonly filterDict: Dict<FilterFn>, readonly modifierDict: Dict<ModifierFn>) {}

  /**
   * 获取指定键的值
   * @param key - 键名
   * @returns 键对应的值，如果不存在返回 undefined
   */
  get(key: string) {
    return this.result[key]
  }

  /**
   * 设置指定键的值
   * 直接写入，不经过修饰符判断
   * @param key - 键名
   * @param value - 要写入的值
   */
  set(key: string, value: any) {
    this.result[key] = value
  }

  /**
   * 添加捕获值（使用默认的 add 修饰符）
   * 默认行为：值不为 null 且非空对象时才写入
   * 这是普通捕获（$var）调用的方法
   *
   * @param capture - 捕获变量定义（包含名称、过滤器链和修饰符）
   * @param value - 从 DOM 中提取的原始值
   */
  add(capture: Capture, value: any) {
    this.exec(capture, value, addModifier)
  }

  /**
   * 强制添加捕获值（使用默认的 forceAdd 修饰符）
   * 无条件写入，即使值为 null
   * 这是赋值操作（=）调用的方法
   *
   * @param capture - 捕获变量定义
   * @param value - 要写入的值
   */
  forceAdd(capture: Capture, value: any) {
    this.exec(capture, value, forceAddModifier)
  }

  /**
   * 执行捕获操作的核心方法
   * 处理流程：
   * 1. 确定要使用的修饰符（捕获定义的修饰符 > 默认修饰符）
   * 2. 对原始值应用过滤器链，得到转换后的值
   * 3. 调用修饰符函数将转换后的值写入结果
   *
   * @param capture - 捕获变量定义
   * @param value - 从 DOM 中提取的原始值
   * @param defaultModifier - 默认修饰符（当捕获未指定修饰符时使用）
   */
  private exec(capture: Capture, value: any, defaultModifier: Modifier) {
    // 确定修饰符：优先使用捕获定义的修饰符，否则使用默认修饰符
    const modifier = capture.modifier || defaultModifier
    // 从修饰符字典中查找修饰符函数
    const modifierFn = this.modifierDict[modifier.name]
    invariant(typeof modifierFn === 'function', msg.invalidModifier(modifier.name))
    // 调用修饰符函数，传入过滤器链处理后的值
    modifierFn(
      this,
      capture.name,
      this.applyFilterList(value, capture.filterList),
      ...modifier.args,
    )
  }

  /**
   * 获取最终结果
   * 处理逻辑：
   * 1. 如果结果中包含默认捕获键（@@default-capture@@），直接返回该键的值
   * 2. 如果结果为空对象，返回 null
   * 3. 否则返回完整的结果对象
   *
   * 默认捕获键用于简化场景：当选择器只有一个捕获且没有显式名称时，
   * 用户期望直接得到值而非 { @@default-capture@@: value } 形式
   *
   * @returns 最终的捕获结果
   */
  getResult() {
    let returnVal = this.result
    if (returnVal.hasOwnProperty(DEFAULT_CAPTURE_KEY)) {
      returnVal = this.result[DEFAULT_CAPTURE_KEY]
    }
    if (isEmptyObject(returnVal)) {
      returnVal = null
    }
    return returnVal
  }

  /**
   * 应用单个过滤器
   * 查找过滤器函数并执行，结果通过 this 绑定传递
   *
   * @param value - 要过滤的值（作为过滤器函数的 this）
   * @param filter - 过滤器定义（包含名称和参数）
   * @returns 过滤器处理后的值
   */
  private applyFilter(value: any, filter: Filter) {
    // 先从缓存中查找过滤器函数
    let filterFn: FilterFn;
    if (this.filterFnCache.has(filter.name)) {
      filterFn = this.filterFnCache.get(filter.name)!;
    } else {
      // 缓存未命中，从字典中查找
      // 如果字典中没有，尝试从值对象本身查找（支持对象方法作为过滤器）
      filterFn = this.filterDict[filter.name] || value[filter.name];
      invariant(typeof filterFn === 'function', msg.invalidFilter(filter.name));
      // 缓存查找到的过滤器函数
      this.filterFnCache.set(filter.name, filterFn);
    }
    // 使用 apply 调用过滤器函数，将 value 绑定为 this
    return filterFn.apply(value, filter.args);
  }

  /**
   * 应用过滤器链
   * 按顺序将过滤器列表中的每个过滤器应用到值上
   *
   * 处理逻辑：
   * - 如果过滤器列表为空，直接返回初始值（优化性能）
   * - 使用 reduce 依次应用每个过滤器
   * - 普通过滤器：直接转换值
   * - 数组过滤器（带 []）：对数组中的每个元素分别应用过滤器
   *
   * @param initValue - 初始值（从 DOM 提取的原始值）
   * @param filterList - 过滤器列表（按顺序应用）
   * @returns 经过所有过滤器处理后的最终值
   */
  private applyFilterList(initValue: any, filterList: Filter[]) {
    // 快速路径：没有过滤器时直接返回
    if (filterList.length === 0) {
      return initValue;
    }

    // 依次应用每个过滤器
    return filterList.reduce((value, filter) => {
      if (filter.isArrayFilter) {
        // 数组过滤器：值必须是数组，对每个元素分别应用过滤器
        invariant(Array.isArray(value), msg.arrayFilterAppliedToNonArrayValue(filter.name));
        const result = [];
        for (let i = 0; i < value.length; i++) {
          result.push(this.applyFilter(value[i], filter));
        }
        return result;
      } else {
        // 普通过滤器：直接对整个值应用
        return this.applyFilter(value, filter);
      }
    }, initValue);
  }
}
