import { rgb } from '@pdfme/pdf-lib'
import { pxToPt, parseColor } from '../htmlParser.js'
import type { RenderContext } from './context.js'
import { findPageIndex } from './geometry.js'
import { selectFont, baselineFromTop } from './text.js'
import { getStyle, getRect } from './layoutCache.js'

/**
 * 计算 <li> 在同级列表项中的序号（从 1 开始），忽略非 li 兄弟节点。
 */
function listItemOrdinal(li: HTMLElement): number {
  let ordinal = 0
  let sibling: Element | null = li.parentElement?.firstElementChild ?? null
  while (sibling) {
    if (sibling.tagName === 'LI') {
      ordinal++
      if (sibling === li) return ordinal
    }
    sibling = sibling.nextElementSibling
  }
  return ordinal || 1
}

/**
 * 绘制列表项 marker（• / ◦ / ▪ / 1. 等）。
 * 定位策略（精确版）：用 Range 测量 <li> 首行文字的真实矩形，
 * 与 renderTextNode 采用一致的坐标换算，使 marker 与首行文字精确对齐；
 * 多行 li 也只对齐首行，而非整框中点。
 * - list-style-type: none 或存在 list-style-image 时不绘制
 * - disc/circle 用圆形，square 用小方块，其余（decimal 等）按 "N." 文本绘制
 */
export function drawListMarker(ctx: RenderContext, li: HTMLElement): void {
  const styles = getStyle(ctx.layoutCache, li)
  if (styles.display === 'none' || styles.visibility === 'hidden') return

  const type = styles.listStyleType
  if (type === 'none' || styles.listStyleImage !== 'none') return

  // 用 Range 取首行内容矩形（getClientRects()[0] 即首个行盒），回退到 li 边框盒
  const range = document.createRange()
  range.selectNodeContents(li)
  const rects = range.getClientRects()
  const lineRect = rects.length > 0 ? rects[0] : getRect(ctx.layoutCache, li)
  if (lineRect.height === 0) return

  const pageIndex = findPageIndex(ctx, li)
  if (pageIndex >= ctx.pages.length) return
  const page = ctx.pages[pageIndex]
  const pageRect = pageIndex < ctx.pageRects.length ? ctx.pageRects[pageIndex] : ctx.containerRect

  const fontSize = pxToPt(parseFloat(styles.fontSize))
  const font = selectFont(ctx, styles.fontWeight)
  const color = parseColor(styles.color)
  const fill = rgb(color.r, color.g, color.b)

  // 与 renderTextNode 完全一致的换算：x 相对容器左缘，y 相对所属页顶
  const contentLeft = pxToPt(lineRect.left - ctx.containerRect.left)
  const lineTop = pxToPt(lineRect.top - pageRect.top)
  const lineHeightPt = pxToPt(lineRect.height)
  // 首行文字基线（行盒顶 + 基线偏移），PDF 坐标自下而上
  const baselineY = ctx.pageHeight - lineTop - baselineFromTop(font, fontSize, lineHeightPt)

  // 圆点/方块类 marker：绘制在内容左缘左侧的留白区
  if (type === 'disc' || type === 'circle' || type === 'square') {
    const glyphSize = fontSize * 0.32
    // 水平：中心位于内容左缘左侧约 0.8em（与浏览器 outside 定位的 marker 留白相当）
    const cx = contentLeft - fontSize * 0.8
    // 垂直：对齐小写字母视觉中线（基线上方约 ascent 的一半 ≈ 0.26em）
    const cy = baselineY + fontSize * 0.26
    if (type === 'square') {
      page.drawRectangle({
        x: cx - glyphSize / 2,
        y: cy - glyphSize / 2,
        width: glyphSize,
        height: glyphSize,
        color: fill,
      })
    } else if (type === 'circle') {
      page.drawEllipse({
        x: cx,
        y: cy,
        xScale: glyphSize / 2,
        yScale: glyphSize / 2,
        borderColor: fill,
        borderWidth: pxToPt(1),
      })
    } else {
      page.drawEllipse({ x: cx, y: cy, xScale: glyphSize / 2, yScale: glyphSize / 2, color: fill })
    }
    return
  }

  // 文本类 marker（decimal 等）：绘制 "N."，右对齐到内容左缘左侧
  const ordinal = listItemOrdinal(li)
  const label = `${ordinal}.`
  const labelWidth = font.widthOfTextAtSize(label, fontSize)
  try {
    page.drawText(label, {
      x: contentLeft - labelWidth - fontSize * 0.25,
      y: baselineY,
      size: fontSize,
      font,
      color: fill,
    })
  } catch (error) {
    console.warn('Failed to draw list marker:', label, error)
  }
}
