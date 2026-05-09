/**
 * 常量定义文件
 * 定义 temme 解析器中使用的所有全局常量
 */

/**
 * 默认捕获键名
 * 当用户在 temme 选择器中没有显式指定捕获名称时，使用此常量作为 key
 * 例如 `div{ $text }` 中的 `$text` 没有指定名称时，会使用此默认键
 * 在 CaptureResult.getResult() 中，如果结果包含此键，则直接返回该键对应的值
 */
export const DEFAULT_CAPTURE_KEY = '@@default-capture@@'

/**
 * 默认过程（procedure）名称
 * 当用户没有指定过程时，默认使用 'text' 过程来提取元素的文本内容
 * 例如 `div{ $text }` 等价于 `div@text{ $text }`
 */
export const DEFAULT_PROCEDURE_NAME = 'text'

/**
 * 赋值过程名称
 * 用于在选择器中直接赋值，而非从 DOM 中提取
 * 例如 `div{ $title = 'hello' }` 中的 `=` 操作对应此过程
 */
export const ASSIGN_PROCEDURE_NAME = 'assign'

/**
 * 通用选择器（通配符）
 * CSS 中的 `*` 选择器，匹配任意元素
 * 在 temme 的内部处理中用于表示匹配所有元素的情况
 */
export const UNIVERSAL_SELECTOR = '*'
