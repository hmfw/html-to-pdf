import { describe, it, expect } from 'vitest'
import { extractUsedCharacters } from './fontSubset'

/** 用 HTML 字符串构造一个挂在 document 上的元素 */
function makeEl(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  return el
}

describe('extractUsedCharacters', () => {
  it('提取中英文字符', () => {
    const chars = extractUsedCharacters(makeEl('<p>Hi 你好</p>'))
    expect(chars.has('H')).toBe(true)
    expect(chars.has('i')).toBe(true)
    expect(chars.has('你')).toBe(true)
    expect(chars.has('好')).toBe(true)
  })

  it('递归遍历嵌套元素', () => {
    const chars = extractUsedCharacters(makeEl('<div><span>A</span><b><i>B</i></b></div>'))
    expect(chars.has('A')).toBe(true)
    expect(chars.has('B')).toBe(true)
  })

  it('去重：同一字符只记一次', () => {
    const chars = extractUsedCharacters(makeEl('<p>aaa</p>'))
    expect([...chars].filter((c) => c === 'a')).toHaveLength(1)
  })

  it('跳过纯空白文本节点', () => {
    // 元素之间的换行/缩进不应被收集
    const chars = extractUsedCharacters(makeEl('<div>\n  <span>x</span>\n</div>'))
    expect(chars.has('x')).toBe(true)
    expect(chars.has('\n')).toBe(false)
  })

  it('保留非空白文本中的空格', () => {
    const chars = extractUsedCharacters(makeEl('<p>a b</p>'))
    expect(chars.has(' ')).toBe(true)
  })

  it('过滤 emoji', () => {
    const chars = extractUsedCharacters(makeEl('<p>笑😀脸</p>'))
    expect(chars.has('笑')).toBe(true)
    expect(chars.has('脸')).toBe(true)
    // 😀 (U+1F600) 在被过滤的 emoji 范围内
    expect([...chars].some((c) => c.codePointAt(0)! >= 0x1f300)).toBe(false)
  })

  it('空元素返回空集合', () => {
    expect(extractUsedCharacters(makeEl('')).size).toBe(0)
  })
})
