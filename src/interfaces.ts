/**
 * 接口定义文件
 * 定义 temme 解析器的核心数据结构和类型
 * 这些类型描述了 temme 选择器解析后的 AST（抽象语法树）结构
 */

/**
 * 通用字典类型
 * 用于表示键值对映射，如过滤器字典、修饰符字典等
 * @template V - 值的类型
 */
export interface Dict<V> {
  [key: string]: V
}

/**
 * 字面量类型
 * 表示 temme 选择器中可以直接使用的值类型
 * 用于过滤器参数、赋值操作等场景
 */
export type Literal = string | number | boolean | null | RegExp

/**
 * 捕获（Capture）接口
 * 表示 temme 选择器中的变量捕获，如 `$name`、`$price|number`
 * 捕获是 temme 的核心概念，用于从 DOM 中提取数据并绑定到变量
 *
 * 示例：
 * - `$name` → { name: 'name', filterList: [], modifier: null }
 * - `$price|number|toFixed(2)` → { name: 'price', filterList: [number, toFixed(2)], modifier: null }
 */
export interface Capture {
  /** 捕获的变量名（不含 $ 前缀） */
  name: string
  /** 过滤器链，按顺序应用的过滤器列表（如 |number|toFixed(2)） */
  filterList: Filter[]
  /** 修饰符（如 add、forceAdd、array 等），用户未指定时为 null */
  modifier: Modifier
}

/**
 * 过滤器（Filter）接口
 * 表示对捕获值的转换操作，如 `|number`、`|trim`、`|items[]`
 * 过滤器可以是普通过滤器或数组过滤器（带 [] 后缀）
 */
export interface Filter {
  /** 是否为数组过滤器（带 [] 后缀），数组过滤器会将值映射到数组的每个元素上 */
  isArrayFilter: boolean
  /** 过滤器名称（如 'number'、'trim'、'items'） */
  name: string
  /** 过滤器参数列表（如 |toFixed(2) 中的 [2]） */
  args: Literal[]
}

/**
 * 修饰符（Modifier）接口
 * 控制捕获值如何写入结果对象
 * 默认使用 add 修饰符（值不为 null 时写入），可通过 `|=` 语法指定
 *
 * 内置修饰符：
 * - add: 值不为 null 且非空对象时写入（默认）
 * - forceAdd: 无条件写入（覆盖已有值）
 * - candidate: 仅当键不存在时写入（候选值）
 * - array: 将值追加到数组中
 * - spread: 将对象的键值对展开写入结果
 */
export interface Modifier {
  /** 修饰符名称 */
  name: string
  /** 修饰符参数列表 */
  args: Literal[]
}

/**
 * Temme 选择器联合类型
 * 表示解析后的 temme 选择器 AST 中所有可能的节点类型
 * 这是 temme 选择器语言的核心类型系统
 */
export type TemmeSelector =
  | ParentRefSelector    // 父引用选择器（& 开头）
  | NormalSelector       // 普通 CSS 选择器（最常见）
  | Assignment           // 赋值操作（= 直接赋值）
  | SnippetDefine        // 片段定义（定义可复用的选择器片段）
  | SnippetExpand        // 片段展开（引用已定义的片段）
  | FilterDefine         // 过滤器定义（定义自定义过滤器）
  | ModifierDefine       // 修饰符定义（定义自定义修饰符）
  | ProcedureDefine      // 过程定义（定义自定义提取过程）

/**
 * 展开后的 Temme 选择器联合类型
 * 与 TemmeSelector 的区别：不包含 SnippetExpand 类型
 * 因为展开阶段会将所有 SnippetExpand 替换为其对应的片段内容
 * 此类型用于实际的 DOM 匹配和数据提取阶段
 */
export type ExpandedTemmeSelector =
  | ParentRefSelector
  | NormalSelector
  | Assignment
  | SnippetDefine
  | FilterDefine
  | ModifierDefine
  | ProcedureDefine

/**
 * 普通选择器接口
 * 最常见的选择器类型，对应 CSS 选择器 + 可选的捕获、过程和子选择器
 *
 * 示例：`div.class[attr=$value]@text{ span{ $text } }`
 * - sections: [div.class, [attr=$value]]  → CSS 选择器部分
 * - procedure: @text                       → 提取过程
 * - children: [span{ $text }]              → 子选择器
 * - arrayCapture: $items                   → 数组捕获（如果有的话）
 */
export interface NormalSelector {
  type: 'normal-selector'
  /** CSS 选择器的段落列表，每段包含组合器、元素名和限定符 */
  sections: Section[]
  /** 提取过程（如 @text、@html、@attr(href)），用户未指定时为 null */
  procedure: Procedure
  /** 数组捕获（如 `div[]{ $text }`），用户未指定数组捕获时为 null */
  arrayCapture: Capture
  /** 子选择器列表，用于嵌套提取 */
  children: TemmeSelector[]
}

/**
 * 父引用选择器接口
 * 使用 `&` 引用父级选择器的当前元素，用于在嵌套上下文中匹配当前节点
 *
 * 示例：在 `div{ &[class=$cls] }` 中，`&` 引用外层的 `div` 元素
 */
export interface ParentRefSelector {
  type: 'parent-ref-selector'
  /** 父引用选择器的段落（单个段落） */
  section: Section
  /** 提取过程，用户未指定时为 null */
  procedure: Procedure
}

/**
 * 过程（Procedure）接口
 * 定义如何从匹配的 DOM 元素中提取数据
 *
 * 内置过程：
 * - text: 提取文本内容（默认）
 * - html: 提取 HTML 内容
 * - node: 提取 DOM 节点本身
 * - find: 在文本中查找子串
 * - assign: 直接赋值
 */
export interface Procedure {
  /** 过程名称 */
  name: string
  /** 过程参数列表（可以是字面量或捕获变量） */
  args: (Literal | Capture)[]
}

/**
 * 赋值操作接口
 * 直接将字面量值赋给捕获变量，不从 DOM 中提取
 *
 * 示例：`div{ $title = 'Hello World' }`
 */
export interface Assignment {
  type: 'assignment'
  /** 目标捕获变量 */
  capture: Capture
  /** 要赋的字面量值 */
  value: Literal
}

/**
 * 片段定义接口
 * 定义可复用的选择器片段，类似函数定义
 * 片段在顶层定义，可在后续选择器中通过名称引用
 *
 * 示例：`$list = li{ $item }` 定义了一个名为 list 的片段
 */
export interface SnippetDefine {
  type: 'snippet-define'
  /** 片段名称 */
  name: string
  /** 片段包含的选择器列表（片段的"函数体"） */
  selectors: TemmeSelector[]
}

/**
 * 片段展开接口
 * 引用已定义的片段，展开时会被替换为片段的实际内容
 *
 * 示例：`$list` 引用之前定义的 list 片段
 */
export interface SnippetExpand {
  type: 'snippet-expand'
  /** 要展开的片段名称 */
  name: string
}

/**
 * 过滤器定义接口
 * 在选择器中定义内联过滤器函数
 *
 * 示例：`@filter myFilter(x) { return x.toUpperCase() }`
 */
export interface FilterDefine {
  type: 'filter-define'
  /** 过滤器名称 */
  name: string
  /** 函数参数部分（如 'x, y'） */
  argsPart: string
  /** 函数体代码 */
  code: string
}

/**
 * 修饰符定义接口
 * 在选择器中定义内联修饰符函数
 *
 * 示例：`@modifier myMod(result, key, value) { ... }`
 */
export interface ModifierDefine {
  type: 'modifier-define'
  /** 修饰符名称 */
  name: string
  /** 函数参数部分 */
  argsPart: string
  /** 函数体代码 */
  code: string
}

/**
 * 过程定义接口
 * 在选择器中定义内联过程函数
 *
 * 示例：`@procedure myProc(node, capture) { ... }`
 */
export interface ProcedureDefine {
  type: 'procedure-define'
  /** 过程名称 */
  name: string
  /** 函数参数部分 */
  argsPart: string
  /** 函数体代码 */
  code: string
}

/**
 * CSS 选择器段落接口
 * 表示 CSS 选择器中的一个段落，如 `div.class#id[attr="value"]:hover`
 * 完整的 CSS 选择器由多个 Section 通过组合器连接而成
 *
 * 示例：`div > .class` 有两个 Section：
 * - { combinator: ' ', element: 'div', qualifiers: [] }
 * - { combinator: '>', element: '', qualifiers: [{ type: 'class-qualifier', className: 'class' }] }
 */
export interface Section {
  /** 与前一个段落的组合方式（空格=后代，> =子元素，+ =相邻兄弟，~ =通用兄弟） */
  combinator: Combinator
  /** 元素名称（如 'div'、'span'、'' 表示无元素名，仅有限定符） */
  element: string
  /** 限定符列表（ID、类名、属性、伪类等） */
  qualifiers: Qualifier[]
}

/**
 * CSS 组合器类型
 * 定义选择器段落之间的关系
 */
export type Combinator = ' ' | '>' | '+' | '~'
// ' ' = 后代选择器（div span）
// '>'  = 子元素选择器（div > span）
// '+'  = 相邻兄弟选择器（div + span）
// '~'  = 通用兄弟选择器（div ~ span）

/**
 * 限定符联合类型
 * 表示附加在元素名上的各种限定条件
 */
export type Qualifier = IdQualifier | ClassQualifier | AttributeQualifier | PseudoQualifier

/**
 * ID 限定符接口
 * 通过 ID 属性限定元素
 *
 * 示例：`#myId` → { type: 'id-qualifier', id: 'myId' }
 */
export interface IdQualifier {
  type: 'id-qualifier'
  /** ID 值 */
  id: string
}

/**
 * 类名限定符接口
 * 通过 class 属性限定元素
 *
 * 示例：`.myClass` → { type: 'class-qualifier', className: 'myClass' }
 */
export interface ClassQualifier {
  type: 'class-qualifier'
  /** 类名 */
  className: string
}

/**
 * 属性操作符类型
 * 定义属性限定符中支持的比较操作
 */
export type AttributeOperator = '=' | '~=' | '|=' | '*=' | '^=' | '$='
// '='   : 等于（exact match）
// '~='  : 包含以空格分隔的词（word in space-separated list）
// '|='  : 以值开头，后跟连字符（lang-code prefix match）
// '*='  : 包含子串（substring match）
// '^='  : 以值开头（starts with）
// '$='  : 以值结尾（ends with）

/**
 * 属性限定符接口
 * 通过元素的属性值来限定元素
 * 支持普通的属性匹配和属性捕获（将属性值绑定到变量）
 *
 * 示例：
 * - `[href]`           → 存在性检查（operator 和 value 为 null）
 * - `[href="url"]`     → 普通属性匹配
 * - `[href=$link]`     → 属性捕获（value 是 Capture 对象）
 */
export interface AttributeQualifier {
  type: 'attribute-qualifier'
  /** 属性名（如 'href'、'class'、'data-id'） */
  attribute: string
  /** 操作符，仅检查属性存在时为 null */
  operator: AttributeOperator
  /** 属性值，可以是字面量字符串或捕获变量，仅检查属性存在时为 null */
  value: string | Capture
}

/**
 * 伪类/伪元素限定符接口
 * 表示 CSS 伪类（如 :hover、:first-child）和伪元素（如 ::before）
 *
 * 示例：
 * - `:first-child` → { type: 'pseudo-qualifier', name: 'first-child', content: '' }
 * - `:nth-child(2)` → { type: 'pseudo-qualifier', name: 'nth-child', content: '2' }
 */
export interface PseudoQualifier {
  type: 'pseudo-qualifier'
  /** 伪类/伪元素名称（不含冒号前缀） */
  name: string
  /** 伪类参数内容（如 nth-child(2) 中的 '2'），无参数时为空字符串 */
  content: string
}
