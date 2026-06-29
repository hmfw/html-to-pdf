import { rgb } from '@pdfme/pdf-lib'
import { pxToPt, parseColor } from '../htmlParser.js'
import type { RenderContext, ResolvedBox } from './context.js'
import { findPageIndex } from './geometry.js'
import { getStyle, getPseudoStyle, getRect, type LayoutCache } from './layoutCache.js'

/**
 * 绘制元素背景填充（仅在有非透明背景色时绘制），表格与普通元素共用
 */
export function drawElementFill(element: HTMLElement, box: ResolvedBox, cache?: LayoutCache): void {
  const styles = getStyle(cache, element)
  const bgColor = styles.backgroundColor
  if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') return

  const borderRadius = parseFloat(styles.borderRadius) || 0
  const radius = borderRadius > 0 ? pxToPt(borderRadius) : undefined
  const color = parseColor(bgColor)

  box.page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: rgb(color.r, color.g, color.b),
    opacity: color.a ?? 1,
    radius,
  })
}

/**
 * 逐边绘制元素边框。
 * - 四条边宽度/颜色/样式一致且有圆角时，用描边矩形画出圆角边框
 * - 否则逐边作为填充条贴在 box 对应边缘（不支持圆角）
 */
export function drawElementBorders(element: HTMLElement, resolved: ResolvedBox, cache?: LayoutCache): void {
  const styles = getStyle(cache, element)
  const edges = [
    { width: styles.borderTopWidth, style: styles.borderTopStyle, color: styles.borderTopColor },
    { width: styles.borderRightWidth, style: styles.borderRightStyle, color: styles.borderRightColor },
    { width: styles.borderBottomWidth, style: styles.borderBottomStyle, color: styles.borderBottomColor },
    { width: styles.borderLeftWidth, style: styles.borderLeftStyle, color: styles.borderLeftColor },
  ] as const

  const isVisible = (e: (typeof edges)[number]) =>
    (parseFloat(e.width) || 0) > 0 && !!e.color && e.style !== 'none' && e.style !== 'hidden'

  const borderRadius = parseFloat(styles.borderRadius) || 0

  // 判断四条可见边是否完全一致（宽度、颜色、样式）
  const allVisible = edges.every(isVisible)
  const uniform =
    allVisible &&
    edges.every((e) => e.width === edges[0].width && e.color === edges[0].color && e.style === edges[0].style)

  // 一致的四边：用描边矩形绘制（边线居中）
  // - 有圆角时内缩半个边宽，使外缘与盒子对齐并画出圆角
  // - 无圆角时不内缩，边线居中：collapse 表格相邻单元格的共享边框会重合而非并排叠加（避免内边框双倍）
  if (uniform) {
    const w = pxToPt(parseFloat(edges[0].width) || 0)
    const color = parseColor(edges[0].color)
    const inset = borderRadius > 0 ? w / 2 : 0
    resolved.page.drawRectangle({
      x: resolved.x + inset,
      y: resolved.y + inset,
      width: resolved.width - inset * 2,
      height: resolved.height - inset * 2,
      borderColor: rgb(color.r, color.g, color.b),
      borderWidth: w,
      radius: borderRadius > 0 ? pxToPt(borderRadius) : undefined,
    })
    return
  }

  // 否则逐边填充条
  edges.forEach((edge, side) => {
    if (!isVisible(edge)) return

    const w = pxToPt(parseFloat(edge.width) || 0)
    const color = parseColor(edge.color)
    const fill = rgb(color.r, color.g, color.b)

    // side: 0=上 1=右 2=下 3=左
    let { x, y, width: rectW, height: rectH } = resolved
    if (side === 0) {
      y = resolved.y + resolved.height - w
      rectH = w
    } else if (side === 1) {
      x = resolved.x + resolved.width - w
      rectW = w
    } else if (side === 2) {
      rectH = w
    } else {
      rectW = w
    }

    resolved.page.drawRectangle({ x, y, width: rectW, height: rectH, color: fill })
  })
}

/**
 * 检测并绘制伪元素（::before / ::after）的背景和边框
 * 限制：
 * - 只处理 display: block / inline-block 的伪元素
 * - 只绘制背景色和边框，不绘制 content 内容
 * - 需要显式设置 width 和 height（auto 高度会跳过）
 */
export function drawPseudoElement(ctx: RenderContext, element: HTMLElement, pseudoType: '::before' | '::after'): void {
  const styles = getPseudoStyle(ctx.layoutCache, element, pseudoType)

  // 判断伪元素是否应该渲染
  const content = styles.content
  const display = styles.display
  if (!content || content === 'none' || display === 'none') return
  if (display !== 'block' && display !== 'inline-block') return

  // 读取尺寸（需要显式设置，auto 会跳过）
  const width = parseFloat(styles.width)
  const height = parseFloat(styles.height)
  if (!width || !height || isNaN(width) || isNaN(height)) return

  const rect = getRect(ctx.layoutCache, element)
  const pageIndex = findPageIndex(ctx, element)
  if (pageIndex >= ctx.pages.length) return

  const pageRect = pageIndex < ctx.pageRects.length ? ctx.pageRects[pageIndex] : ctx.containerRect

  // 读取定位模式和偏移量
  const position = styles.position
  const top = parseFloat(styles.top) || 0
  const left = parseFloat(styles.left) || 0
  const right = parseFloat(styles.right)
  const bottom = parseFloat(styles.bottom)

  let pseudoX: number
  let pseudoY: number

  if (position === 'absolute' || position === 'fixed') {
    // absolute/fixed：相对于父元素定位
    // 支持 left/right/top/bottom
    if (!isNaN(right)) {
      // 使用 right 定位
      pseudoX = rect.left - ctx.containerRect.left + rect.width - width - right
    } else {
      // 使用 left 定位（默认）
      pseudoX = rect.left - ctx.containerRect.left + left
    }

    if (!isNaN(bottom)) {
      // 使用 bottom 定位
      pseudoY = rect.top - pageRect.top + rect.height - height - bottom
    } else {
      // 使用 top 定位（默认）
      pseudoY = rect.top - pageRect.top + top
    }
  } else {
    // static/relative：按文档流定位
    const elStyle = getStyle(ctx.layoutCache, element)
    const paddingTop = parseFloat(elStyle.paddingTop) || 0
    const paddingBottom = parseFloat(elStyle.paddingBottom) || 0
    const paddingLeft = parseFloat(elStyle.paddingLeft) || 0
    const borderTop = parseFloat(elStyle.borderTopWidth) || 0
    const borderBottom = parseFloat(elStyle.borderBottomWidth) || 0
    const borderLeft = parseFloat(elStyle.borderLeftWidth) || 0

    // 伪元素水平位置：内容区左缘（getBoundingClientRect 为 border-box，需加上左边框+左内边距）
    pseudoX = rect.left - ctx.containerRect.left + borderLeft + paddingLeft

    // 父元素为 flex/inline-flex 且 align-items: center 时，伪元素在内容盒内垂直居中
    // （常见的「标题前竖条」用法，否则会贴顶偏上）
    const isFlex = elStyle.display === 'flex' || elStyle.display === 'inline-flex'
    const centered = isFlex && (elStyle.alignItems === 'center' || elStyle.alignItems === 'normal')

    if (centered) {
      const contentTop = rect.top - pageRect.top + borderTop + paddingTop
      const contentHeight = rect.height - borderTop - borderBottom - paddingTop - paddingBottom
      pseudoY = contentTop + (contentHeight - height) / 2
    } else if (pseudoType === '::before') {
      // ::before 在元素内容区顶部
      pseudoY = rect.top - pageRect.top + borderTop + paddingTop
    } else {
      // ::after 在元素内容区底部
      pseudoY = rect.top - pageRect.top + rect.height - borderBottom - paddingBottom - height
    }
  }

  const pseudoBox: ResolvedBox = {
    page: ctx.pages[pageIndex],
    x: pxToPt(pseudoX),
    y: ctx.pageHeight - pxToPt(pseudoY + height),
    width: pxToPt(width),
    height: pxToPt(height),
  }

  // 绘制背景（复用现有逻辑）
  const bgColor = styles.backgroundColor
  if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
    const borderRadius = parseFloat(styles.borderRadius) || 0
    const radius = borderRadius > 0 ? pxToPt(borderRadius) : undefined
    const color = parseColor(bgColor)

    pseudoBox.page.drawRectangle({
      x: pseudoBox.x,
      y: pseudoBox.y,
      width: pseudoBox.width,
      height: pseudoBox.height,
      color: rgb(color.r, color.g, color.b),
      opacity: color.a ?? 1,
      radius,
    })
  }

  // 绘制边框（简化版：只处理统一边框）
  const borderWidth = parseFloat(styles.borderWidth) || 0
  const borderStyle = styles.borderStyle
  const borderColor = styles.borderColor

  if (borderWidth > 0 && borderStyle !== 'none' && borderStyle !== 'hidden' && borderColor) {
    const w = pxToPt(borderWidth)
    const color = parseColor(borderColor)
    const borderRadius = parseFloat(styles.borderRadius) || 0
    const inset = borderRadius > 0 ? w / 2 : 0

    pseudoBox.page.drawRectangle({
      x: pseudoBox.x + inset,
      y: pseudoBox.y + inset,
      width: pseudoBox.width - inset * 2,
      height: pseudoBox.height - inset * 2,
      borderColor: rgb(color.r, color.g, color.b),
      borderWidth: w,
      radius: borderRadius > 0 ? pxToPt(borderRadius) : undefined,
    })
  }
}

