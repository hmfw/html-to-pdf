import { PDF_PAGE_ATTR } from '../constants.js'

/**
 * 自动分页：容器内无 data-pdf-page 标记时，按内容流把容器切成多页。
 *
 * 设计要点：
 * - 只在「无手动分页标记」时启用，与现有 data-pdf-page 手动分页互斥，零冲突。
 * - 收集「不可分割的叶子块」（段落、标题、图片、表格行等），贪心打包到每页，
 *   超过页内容高度就在该块顶部断页，使该块整体落到下一页，避免被切成半行。
 * - 打包逻辑 packIntoPages 为纯函数，便于单测；DOM 采集与之分离。
 */

/** 一个参与分页的「叶子块」在视口中的纵向占位 */
export interface BreakUnit {
  /** 视口坐标系下的顶边（px） */
  top: number
  /** 视口坐标系下的底边（px） */
  bottom: number
}

/** 标签为「原子块」的元素：自身整体参与分页，不再向下拆分 */
const ATOMIC_TAGS = new Set(['IMG', 'CANVAS', 'TR', 'HR', 'SVG', 'VIDEO', 'PRE', 'BLOCKQUOTE'])

/**
 * 判断元素是否为块级（用于决定是否继续向下递归找叶子块）。
 * 依据 computed display，inline / inline-* 视为非块级。
 */
function isBlockLevel(styles: CSSStyleDeclaration): boolean {
  const d = styles.display
  return d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item' || d === 'table' || d.startsWith('table-')
}

/**
 * 递归收集容器内的「叶子块」单元（带视口 top/bottom），按 top 升序返回。
 * - 跳过 display:none / visibility:hidden / position:absolute|fixed（不占文档流）。
 * - 命中 ATOMIC_TAGS、或没有块级子元素的块级元素 → 作为一个叶子块。
 * - 否则向块级子元素递归。
 */
export function collectBreakUnits(container: HTMLElement): BreakUnit[] {
  const units: BreakUnit[] = []

  const visit = (el: HTMLElement): void => {
    const styles = window.getComputedStyle(el)
    if (styles.display === 'none' || styles.visibility === 'hidden') return
    if (styles.position === 'absolute' || styles.position === 'fixed') return

    const tag = el.tagName
    const blockChildren = Array.from(el.children).filter((c): c is HTMLElement => {
      const cs = window.getComputedStyle(c as HTMLElement)
      if (cs.display === 'none') return false
      if (cs.position === 'absolute' || cs.position === 'fixed') return false
      return isBlockLevel(cs)
    })

    // 原子块，或无块级子元素的叶子 → 作为一个分页单元
    if (ATOMIC_TAGS.has(tag) || blockChildren.length === 0) {
      const rect = el.getBoundingClientRect()
      if (rect.height > 0) units.push({ top: rect.top, bottom: rect.bottom })
      return
    }

    // 表格：行（tr）才是分页单元，递归交给子元素即可命中
    for (const child of blockChildren) visit(child)
  }

  for (const child of Array.from(container.children)) {
    visit(child as HTMLElement)
  }

  units.sort((a, b) => a.top - b.top)
  return units
}

/**
 * 贪心打包：把按 top 升序的叶子块分配到每页，返回各页「断页带」边界（视口 Y 坐标）。
 *
 * 返回数组形如 `[startTop, page2Top, ..., containerBottom]`，长度 = 页数 + 1，
 * 相邻两项即一页的 [上界, 下界)。用绝对视口坐标，自然计入块间空白。
 *
 * @param units            叶子块（须按 top 升序）
 * @param startTop         首页内容起始 Y（通常为容器内容顶）
 * @param containerBottom  容器内容底 Y（末页下界）
 * @param contentHeightPx  每页可用内容高度（px）
 *
 * 规则：累计某块底边超过当前页可用高度时，在该块顶部断页。
 * 单块高于一页时独占一页（溢出底部，不再细分）。
 */
export function packIntoPages(
  units: BreakUnit[],
  startTop: number,
  containerBottom: number,
  contentHeightPx: number,
): number[] {
  const breaks = [startTop]
  if (contentHeightPx <= 0 || units.length === 0) {
    breaks.push(containerBottom)
    return breaks
  }

  let pageStart = startTop
  for (const u of units) {
    // 该块底边相对当前页顶的高度超过页高，且断点能真正前进（块顶在页顶之下）→ 换页
    if (u.bottom - pageStart > contentHeightPx && u.top > pageStart + 1) {
      pageStart = u.top
      breaks.push(pageStart)
    }
  }

  breaks.push(containerBottom)
  return breaks
}

/** 容器内是否存在 data-pdf-page 手动分页标记 */
export function hasManualPages(container: HTMLElement): boolean {
  return container.querySelector(`[${PDF_PAGE_ATTR}]`) !== null
}
