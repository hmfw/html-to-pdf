import { describe, it, expect } from 'vitest'
import { pxToPt, parseColor } from './htmlParser'

describe('pxToPt', () => {
  it('按 0.75 比例换算（96 DPI → 72 DPI）', () => {
    expect(pxToPt(96)).toBe(72)
    expect(pxToPt(16)).toBe(12)
  })

  it('0 仍为 0', () => {
    expect(pxToPt(0)).toBe(0)
  })

  it('支持小数与负数', () => {
    expect(pxToPt(10)).toBeCloseTo(7.5)
    expect(pxToPt(-8)).toBe(-6)
  })
})

describe('parseColor', () => {
  it('空字符串回退为黑色不透明', () => {
    expect(parseColor('')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })

  it('解析 rgb()', () => {
    expect(parseColor('rgb(255, 0, 128)')).toEqual({ r: 1, g: 0, b: 128 / 255, a: 1 })
  })

  it('解析带透明度的 rgba()', () => {
    const c = parseColor('rgba(0, 128, 255, 0.5)')
    expect(c.r).toBe(0)
    expect(c.g).toBeCloseTo(128 / 255)
    expect(c.b).toBe(1)
    expect(c.a).toBe(0.5)
  })

  it('rgba 透明度为 0 时保留为 0', () => {
    expect(parseColor('rgba(10, 20, 30, 0)').a).toBe(0)
  })

  it('解析 6 位十六进制', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
  })

  it('十六进制大小写不敏感', () => {
    expect(parseColor('#00FF00')).toEqual({ r: 0, g: 1, b: 0, a: 1 })
  })

  it('解析 3 位短十六进制', () => {
    // #abc → #aabbcc
    expect(parseColor('#abc')).toEqual({
      r: 0xaa / 255,
      g: 0xbb / 255,
      b: 0xcc / 255,
      a: 1,
    })
  })

  it('无法识别的颜色回退为黑色', () => {
    expect(parseColor('not-a-color')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })
})
