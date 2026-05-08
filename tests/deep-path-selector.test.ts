import fs from 'fs'
import path from 'path'
import temme from '../src/temme'

const html = fs.readFileSync(
  path.resolve(__dirname, 'fixtures/deep-path-selector.html'),
  'utf-8',
)

describe('深路径选择器测试 (_useHtmlParser2: false)', () => {
  // ========== #pmlist 相关测试 ==========

  describe('#pmlist 表格数据提取', () => {
    test('深路径选择器 #pmlist tbody tr[id] 应能匹配到数据', () => {
      const result = temme(html, `
        #pmlist tbody tr[id]@messages {
          &[id=$id];
          .author{$author};
          .title{$title};
        }
      `)
      expect(result).toEqual({
        messages: [
          { id: 'msg-1001', author: '张三', title: '你好' },
          { id: 'msg-1002', author: '李四', title: '再见' },
          { id: 'msg-1003', author: '王五', title: '谢谢' },
        ],
      })
    })

    test('浅路径选择器 #pmlist tr[id] 应能匹配到数据', () => {
      const result = temme(html, `
        #pmlist tr[id]@messages {
          &[id=$id];
          .author{$author};
          .title{$title};
        }
      `)
      expect(result).toEqual({
        messages: [
          { id: 'msg-1001', author: '张三', title: '你好' },
          { id: 'msg-1002', author: '李四', title: '再见' },
          { id: 'msg-1003', author: '王五', title: '谢谢' },
        ],
      })
    })

    test('深路径与浅路径选择器结果应一致', () => {
      const deepResult = temme(html, `
        #pmlist tbody tr[id]@messages {
          &[id=$id];
          .author{$author};
          .title{$title};
        }
      `)
      const shallowResult = temme(html, `
        #pmlist tr[id]@messages {
          &[id=$id];
          .author{$author};
          .title{$title};
        }
      `)
      expect(deepResult).toEqual(shallowResult)
    })
  })

  describe('#pmlist 单条记录提取', () => {
    test('深路径提取单条记录的 id', () => {
      const result = temme(html, '#pmlist tbody tr[id=$firstId];')
      expect(result).toEqual({ firstId: 'msg-1001' })
    })

    test('浅路径提取单条记录的 id', () => {
      const result = temme(html, '#pmlist tr[id=$firstId];')
      expect(result).toEqual({ firstId: 'msg-1001' })
    })

    test('提取第一行的作者和标题（多选择器）', () => {
      const result = temme(html, `
        #pmlist tbody tr .author{$author};
        #pmlist tbody tr .title{$title};
      `)
      expect(result).toEqual({ author: '张三', title: '你好' })
    })
  })

  // ========== .headaction .notabs 相关测试 ==========

  describe('.headaction .notabs 数组捕获', () => {
    test('深路径选择器 .headaction .notabs@moderator 应能匹配到数据', () => {
      const result = temme(html, `
        .headaction .notabs@moderators {
          .moderator{$name};
        }
      `)
      expect(result).toEqual({
        moderators: [
          { name: '管理员A' },
          { name: '管理员B' },
          { name: '管理员C' },
        ],
      })
    })

    test('浅路径选择器 .notabs@moderator 应能匹配到数据', () => {
      const result = temme(html, `
        .notabs@moderators {
          .moderator{$name};
        }
      `)
      expect(result).toEqual({
        moderators: [
          { name: '管理员A' },
          { name: '管理员B' },
          { name: '管理员C' },
        ],
      })
    })

    test('深路径与浅路径数组捕获结果应一致', () => {
      const deepResult = temme(html, `
        .headaction .notabs@moderators {
          .moderator{$name};
        }
      `)
      const shallowResult = temme(html, `
        .notabs@moderators {
          .moderator{$name};
        }
      `)
      expect(deepResult).toEqual(shallowResult)
    })

    test('使用默认数组捕获语法', () => {
      const result = temme(html, `
        .headaction .notabs@ {
          .moderator{$name};
        }
      `)
      expect(result).toEqual([
        { name: '管理员A' },
        { name: '管理员B' },
        { name: '管理员C' },
      ])
    })

    test('使用父结点引用 & 捕获 class', () => {
      const result = temme(html, `
        .headaction .notabs@ {
          &[class=$cls];
          .moderator{$name};
        }
      `)
      expect(result).toEqual([
        { cls: 'notabs', name: '管理员A' },
        { cls: 'notabs', name: '管理员B' },
        { cls: 'notabs', name: '管理员C' },
      ])
    })
  })

  // ========== 综合测试 ==========

  describe('综合选择器', () => {
    test('同时提取表格数据和管理员数据', () => {
      const result = temme(html, `
        #pmlist tbody tr[id]@messages {
          &[id=$id];
          .author{$author};
        };
        .headaction .notabs@moderators {
          .moderator{$name};
        }
      `)
      expect(result).toEqual({
        messages: [
          { id: 'msg-1001', author: '张三' },
          { id: 'msg-1002', author: '李四' },
          { id: 'msg-1003', author: '王五' },
        ],
        moderators: [
          { name: '管理员A' },
          { name: '管理员B' },
          { name: '管理员C' },
        ],
      })
    })
  })
})
