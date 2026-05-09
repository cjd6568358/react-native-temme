/**
 * temme 库的入口文件
 *
 * temme 是一个 HTML 数据提取库，使用类似 CSS 选择器的语法从 HTML 中提取结构化数据。
 * 它扩展了 CSS 选择器，添加了变量捕获（$var）、过滤器（|filter）、
 * 修饰符（|=modifier）、过程（@procedure）等特性。
 *
 * 使用方式：
 * ```js
 * import temme from 'temme'
 *
 * const html = '<div class="price">$19.99</div>'
 * const result = temme(html, 'div.price{ $price|number }')
 * // result = { price: 19.99 }
 * ```
 */

// 导出所有子模块的公共 API
export * from './CaptureResult'   // CaptureResult 类
export * from './check'           // 选择器校验函数
export * from './constants'       // 常量定义
export * from './procedures'      // 过程定义和注册函数
export * from './filters'         // 过滤器定义和注册函数
export * from './modifiers'       // 修饰符定义和注册函数
export * from './interfaces'      // TypeScript 接口和类型定义
export * from './temme'           // 核心 temme 函数和解析器
export * from './utils'           // 工具函数

// 导入默认导出的 temme 函数
import temme from './temme'

/**
 * temme 库的版本号
 */
export const version = '0.8.3'

/**
 * 默认导出 temme 函数
 * 这是用户使用 temme 库的主要入口点
 */
export default temme
