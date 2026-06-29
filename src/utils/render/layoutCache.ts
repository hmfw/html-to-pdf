/**
 * 布局读取缓存（per-export）
 *
 * `getComputedStyle` 与 `getBoundingClientRect` 都会触发浏览器强制同步布局
 * （reflow），是渲染热点里最贵的 DOM 操作。渲染分两遍遍历（盒子层 + 文字层），
 * 且 box/border/radius 等多个绘制函数会对同一元素重复读取，导致同一元素的样式
 * 与矩形被反复计算多次。
 *
 * 本模块用挂在渲染上下文上的 WeakMap 缓存这两类结果，使同一元素在一次导出中
 * 只读取一次。导出期间 DOM 必须保持稳定（见 CLAUDE.md 约定），因此缓存的
 * 实时 CSSStyleDeclaration 引用与矩形快照在整个导出过程中都有效。
 *
 * WeakMap 随渲染上下文（RenderContext）一同被 GC，无需手动清理，也不会跨导出泄漏。
 */

/** 缓存容器：每次导出新建一份，挂在 RenderContext 上 */
export interface LayoutCache {
  styles: WeakMap<Element, CSSStyleDeclaration>
  /** 伪元素样式按 `::before` / `::after` 分开缓存 */
  pseudoStyles: WeakMap<Element, Map<string, CSSStyleDeclaration>>
  rects: WeakMap<Element, DOMRect>
}

/** 创建一份空缓存（每次导出调用一次） */
export function createLayoutCache(): LayoutCache {
  return {
    styles: new WeakMap(),
    pseudoStyles: new WeakMap(),
    rects: new WeakMap(),
  }
}

/**
 * 取元素的 computed style，命中缓存则复用。
 * cache 缺省（未提供缓存）时退化为直接读取，保证调用方在无缓存场景下仍可用。
 */
export function getStyle(cache: LayoutCache | undefined, element: Element): CSSStyleDeclaration {
  if (!cache) return window.getComputedStyle(element)
  const cached = cache.styles.get(element)
  if (cached) return cached
  const styles = window.getComputedStyle(element)
  cache.styles.set(element, styles)
  return styles
}

/**
 * 取元素伪元素（::before / ::after）的 computed style，按伪元素类型分别缓存。
 */
export function getPseudoStyle(
  cache: LayoutCache | undefined,
  element: Element,
  pseudo: string,
): CSSStyleDeclaration {
  if (!cache) return window.getComputedStyle(element, pseudo)
  let byPseudo = cache.pseudoStyles.get(element)
  if (!byPseudo) {
    byPseudo = new Map()
    cache.pseudoStyles.set(element, byPseudo)
  }
  const cached = byPseudo.get(pseudo)
  if (cached) return cached
  const styles = window.getComputedStyle(element, pseudo)
  byPseudo.set(pseudo, styles)
  return styles
}

/**
 * 取元素的 border-box 矩形，命中缓存则复用。
 *
 * 注意：返回的是导出开始时的布局快照。仅用于已完成布局、导出期间不再变动的元素
 * （本库的使用前提）。需要实时矩形的场景（如 Range 行盒）不要走此缓存。
 */
export function getRect(cache: LayoutCache | undefined, element: Element): DOMRect {
  if (!cache) return element.getBoundingClientRect()
  const cached = cache.rects.get(element)
  if (cached) return cached
  const rect = element.getBoundingClientRect()
  cache.rects.set(element, rect)
  return rect
}
