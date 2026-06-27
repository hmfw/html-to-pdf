import { describe, it, expect } from 'vitest'
import { packIntoPages, type BreakUnit } from './autoPaginate'

/** 便捷构造叶子块 */
const u = (top: number, bottom: number): BreakUnit => ({ top, bottom })

describe('packIntoPages', () => {
  it('无单元时返回单页 [startTop, containerBottom]', () => {
    expect(packIntoPages([], 0, 500, 800)).toEqual([0, 500])
  })

  it('contentHeight <= 0 时退化为单页', () => {
    expect(packIntoPages([u(0, 100)], 0, 100, 0)).toEqual([0, 100])
    expect(packIntoPages([u(0, 100)], 0, 100, -10)).toEqual([0, 100])
  })

  it('所有内容放得下时不分页', () => {
    const units = [u(0, 100), u(100, 200), u(200, 300)]
    expect(packIntoPages(units, 0, 300, 800)).toEqual([0, 300])
  })

  it('超过页高时在越界块顶部断页', () => {
    // 页高 250：第三块底 300 > 250，在其顶 200 断页
    const units = [u(0, 100), u(100, 200), u(200, 300)]
    expect(packIntoPages(units, 0, 300, 250)).toEqual([0, 200, 300])
  })

  it('多次换页：每页累计高度从新页顶重新计算', () => {
    // 页高 100，块各 60 高
    const units = [u(0, 60), u(60, 120), u(120, 180), u(180, 240)]
    // 页1: 0..60(底60<=100), 120>100 → 断于60; 页2: 60..120(底120-60=60), 180-60=120>100 → 断于120;
    // 页3: 120..180(60), 240-120=120>100 → 断于180; 页4: 180..240
    expect(packIntoPages(units, 0, 240, 100)).toEqual([0, 60, 120, 180, 240])
  })

  it('单块高于一页时独占一页并溢出（不再细分）', () => {
    // 第二块高 300 > 页高 200：在其顶断页，整块落到该页并溢出
    const units = [u(0, 100), u(100, 400), u(400, 450)]
    // 页1: 0..100; 第二块底400-0=400>200 且顶100>0 → 断于100; 页2从100起,
    // 第三块底450-100=350>200 且顶400>100 → 断于400; 页3: 400..450
    expect(packIntoPages(units, 0, 450, 200)).toEqual([0, 100, 400, 450])
  })

  it('块间空白计入页高（用绝对坐标）', () => {
    // 两块间有 150 空白，页高 200
    const units = [u(0, 50), u(200, 260)]
    // 第二块底 260 > 200 且顶 200>0 → 断于 200
    expect(packIntoPages(units, 0, 260, 200)).toEqual([0, 200, 260])
  })

  it('startTop 非零时以其为首页上界', () => {
    const units = [u(100, 200), u(200, 360)]
    // 页高 200，从 100 起：第二块底 360-100=260>200 且顶 200>100 → 断于 200
    expect(packIntoPages(units, 100, 360, 200)).toEqual([100, 200, 360])
  })
})
