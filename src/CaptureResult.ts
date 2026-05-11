import invariant from 'invariant'
import { Capture, Dict, Filter, Modifier } from './interfaces'
import { FilterFn } from './filters'
import { DEFAULT_CAPTURE_KEY } from './constants'
import { isEmptyObject } from './utils'
import { msg } from './check'
import { ModifierFn } from './modifiers'

const addModifier: Modifier = { name: 'add', args: [] }
const forceAddModifier: Modifier = { name: 'forceAdd', args: [] }

export class CaptureResult {
  private readonly result: any = {}

  constructor(readonly filterDict: Dict<FilterFn>, readonly modifierDict: Dict<ModifierFn>) {}

  get(key: string) {
    return this.result[key]
  }

  set(key: string, value: any) {
    this.result[key] = value
  }

  add(capture: Capture, value: any) {
    this.exec(capture, value, addModifier)
  }

  forceAdd(capture: Capture, value: any) {
    this.exec(capture, value, forceAddModifier)
  }

  private exec(capture: Capture, value: any, defaultModifier: Modifier) {
    const modifier = capture.modifier || defaultModifier
    const modifierFn = this.modifierDict[modifier.name]
    invariant(typeof modifierFn === 'function', msg.invalidModifier(modifier.name))
    modifierFn(
      this,
      capture.name,
      this.applyFilterList(value, capture.filterList),
      ...modifier.args,
    )
  }

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

  // 缓存过滤器函数，避免重复查找
  private filterFnCache = new Map<string, FilterFn>();

  private applyFilter(value: any, filter: Filter) {
    // 使用缓存获取过滤器函数
    let filterFn: FilterFn;
    if (this.filterFnCache.has(filter.name)) {
      filterFn = this.filterFnCache.get(filter.name)!;
    } else {
      filterFn = this.filterDict[filter.name] || value[filter.name];
      invariant(typeof filterFn === 'function', msg.invalidFilter(filter.name));
      this.filterFnCache.set(filter.name, filterFn);
    }
    return filterFn.apply(value, filter.args);
  }

  private applyFilterList(initValue: any, filterList: Filter[]) {
    if (filterList.length === 0) {
      return initValue;
    }

    let value = initValue;
    for (let i = 0; i < filterList.length; i++) {
      const filter = filterList[i];
      if (filter.isArrayFilter) {
        invariant(Array.isArray(value), msg.arrayFilterAppliedToNonArrayValue(filter.name));
        const result = [];
        for (let j = 0; j < value.length; j++) {
          result.push(this.applyFilter(value[j], filter));
        }
        value = result;
      } else {
        value = this.applyFilter(value, filter);
      }
    }
    return value;
  }
}
