import { drawElementFill, drawElementBorders, drawPseudoElement } from './render/box.js'
import { resolveBox, getBorderRadiusPt, insetToContentBox } from './render/geometry.js'
import { renderTextNode } from './render/text.js'
import { embedImageElement, embedCanvasElement, renderImage } from './render/image.js'
import { drawListMarker } from './render/list.js'
import type { RenderContext } from './render/context.js'

export type { RenderContext }

/**
 * 渲染上下文入口：分两遍渲染容器内所有元素。
 *
 * 单遍 DFS 会把「背景/边框」与「文字」交错绘制，导致后绘制的兄弟元素背景
 * 覆盖先绘制的文字（典型：表格 rowspan 单元格的文字被下一行的条纹背景遮挡）。
 * 改为两遍，匹配 CSS 绘制顺序：
 *   第一遍 drawBoxLayer —— 所有元素的背景、边框、图片/canvas、伪元素
 *   第二遍 drawTextLayer —— 所有文字与列表 marker
 * 这样任何块级背景都不可能再盖住文字。
 */
export async function renderHTML(ctx: RenderContext, element: HTMLElement): Promise<void> {
  await drawBoxLayer(ctx, element)
  drawTextLayer(ctx, element)
}

/**
 * 第一遍：递归绘制盒子装饰层（背景 → 边框 → ::before → 子元素 → ::after），不绘制文字。
 */
async function drawBoxLayer(ctx: RenderContext, element: HTMLElement): Promise<void> {
  const styles = window.getComputedStyle(element)
  if (styles.display === 'none' || styles.visibility === 'hidden') return

  const tagName = element.tagName.toLowerCase()

  // 元素盒子装饰：按 CSS 规范的层叠顺序绘制
  // 正确的层级（由底到顶）：背景 → 边框 → ::before → 子元素 → ::after
  const box = resolveBox(ctx, element)
  if (box) {
    // 1. 绘制背景
    drawElementFill(element, box)

    // 2. 绘制边框
    drawElementBorders(element, box)

    // 3. img/canvas：先画边框，再画图片，最后画 ::before（图片覆盖边框，::before 覆盖图片）
    // 位图绘制在 content-box（内缩 border + padding），让边框露出；有圆角时把图片裁成圆角矩形
    if (tagName === 'img') {
      const { box: contentBox, radius } = insetToContentBox(element, box, getBorderRadiusPt(element))
      await renderImage(ctx, contentBox, radius, () => embedImageElement(ctx, element as HTMLImageElement))
      drawPseudoElement(ctx, element, '::before')
      return
    }

    if (tagName === 'canvas') {
      const { box: contentBox, radius } = insetToContentBox(element, box, getBorderRadiusPt(element))
      await renderImage(ctx, contentBox, radius, () => embedCanvasElement(ctx, element as HTMLCanvasElement))
      drawPseudoElement(ctx, element, '::before')
      return
    }

    // 4. 绘制 ::before 伪元素（在背景和边框之上，子元素之下）
    drawPseudoElement(ctx, element, '::before')
  } else if (tagName === 'img' || tagName === 'canvas') {
    // 零尺寸的图片类元素无可渲染区域，直接跳过
    return
  }

  // 表格：按 CSS 表格绘制层级（行组 → 行 → 单元格）重排背景绘制，
  // 否则后出现的行背景会盖住前面 rowspan 单元格跨出的部分。
  if (tagName === 'table') {
    await drawTableBoxLayer(ctx, element)
    if (box) drawPseudoElement(ctx, element, '::after')
    return
  }

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      await drawBoxLayer(ctx, child as HTMLElement)
    }
  }

  // 绘制 ::after 伪元素（在所有子元素之后）
  if (box) {
    drawPseudoElement(ctx, element, '::after')
  }
}

// PLACEHOLDER_ORCHESTRATION

/**
 * 表格盒子层：按 CSS 规范的表格绘制层级绘制背景与边框，确保单元格背景永远在行背景之上。
 * 层级（由底到顶）：行组(thead/tbody/tfoot) → 行(tr) → 单元格(td/th)。
 * 单元格通过 drawBoxLayer 递归，以支持其内部嵌套内容（图片、嵌套表格等）。
 */
async function drawTableBoxLayer(ctx: RenderContext, table: HTMLElement): Promise<void> {
  // 仅处理直属本表格的元素，排除嵌套表格内的行/单元格（它们由该嵌套表格自行绘制）
  const ownedBy = (el: Element) => el.closest('table') === table

  // 1. 行组背景（thead/tbody/tfoot）
  const groups = (Array.from(table.querySelectorAll('thead, tbody, tfoot')) as HTMLElement[]).filter(
    (g) => g.closest('table') === table,
  )
  for (const group of groups) {
    const gbox = resolveBox(ctx, group)
    if (gbox) {
      drawElementFill(group, gbox)
      drawElementBorders(group, gbox)
    }
  }

  // 2. 行背景（tr）
  const rows = (Array.from(table.querySelectorAll('tr')) as HTMLElement[]).filter(ownedBy)
  for (const row of rows) {
    const rbox = resolveBox(ctx, row)
    if (rbox) {
      drawElementFill(row, rbox)
      drawElementBorders(row, rbox)
    }
  }

  // 3. 单元格（td/th）：递归绘制，单元格背景覆盖在行背景之上。
  //    递归会处理单元格内的嵌套内容（含嵌套表格）。
  const cells = (Array.from(table.querySelectorAll('td, th')) as HTMLElement[]).filter(ownedBy)
  for (const cell of cells) {
    await drawBoxLayer(ctx, cell)
  }
}

/**
 * 第二遍：递归绘制文字层（文本节点 + 列表 marker），不再绘制任何背景。
 */
function drawTextLayer(ctx: RenderContext, element: HTMLElement): void {
  const styles = window.getComputedStyle(element)
  if (styles.display === 'none' || styles.visibility === 'hidden') return

  const tagName = element.tagName.toLowerCase()
  // 图片/canvas 无文字内容，跳过
  if (tagName === 'img' || tagName === 'canvas') return

  // 列表项：在文字之前绘制 marker（•、1. 等）
  if (tagName === 'li') {
    drawListMarker(ctx, element)
  }

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      renderTextNode(ctx, child as Text, element)
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      drawTextLayer(ctx, child as HTMLElement)
    }
  }
}
