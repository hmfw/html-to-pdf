import { PDFPage, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath } from '@pdfme/pdf-lib'
import { pxToPt } from '../htmlParser.js'
import { PDF_CONTAINER_ATTR, PDF_PAGE_ATTR } from '../../constants.js'
import type { RenderContext, ResolvedBox } from './context.js'
import { getStyle, getRect, type LayoutCache } from './layoutCache.js'

/**
 * 查找元素所属的 PdfPage 并返回页码
 * PdfPage 可以不是容器的直接子元素，但不能嵌套。
 */
export function findPageIndex(ctx: RenderContext, element: HTMLElement): number {
  // 自动分页模式：按元素在视口中的 top 落在哪个「断页带」区间归页
  if (ctx.autoBands) {
    return findAutoBandIndex(ctx.autoBands, getRect(ctx.layoutCache, element).top)
  }

  // 向上遍历找到最近的 [data-pdf-page] 元素
  let current: HTMLElement | null = element

  while (current) {
    if (current.hasAttribute(PDF_PAGE_ATTR)) {
      // 找到容器元素
      let container = current.parentElement
      while (container && !container.hasAttribute(PDF_CONTAINER_ATTR)) {
        container = container.parentElement
      }

      if (container) {
        // 查找所有后代中的顶层 page（与 computePages 逻辑一致）
        const allPages = Array.from(container.querySelectorAll(`[${PDF_PAGE_ATTR}]`)) as HTMLElement[]
        const topLevelPages = allPages.filter((page) => {
          let parent = page.parentElement
          while (parent && parent !== container) {
            if (parent.hasAttribute(PDF_PAGE_ATTR)) {
              return false // 嵌套 page，跳过
            }
            parent = parent.parentElement
          }
          return true
        })

        const index = topLevelPages.indexOf(current)
        if (index !== -1 && index < ctx.pages.length) {
          return index
        }
      }

      // 回退：使用 page-number 属性（从 1 开始）
      const pageNumber = current.getAttribute(PDF_PAGE_ATTR)
      if (pageNumber) {
        const num = parseInt(pageNumber) - 1
        if (num >= 0 && num < ctx.pages.length) {
          return num
        }
      }

      return 0
    }
    current = current.parentElement
  }

  // 没有 PdfPage 标记，返回第一页
  return 0
}

/**
 * 自动分页归页：给定断页带边界 `bands`（长度 = 页数 + 1）和元素视口 top，
 * 返回元素所属页码。落在 `[bands[i], bands[i+1])` 即第 i 页。
 * 用 1px epsilon 容忍亚像素抖动；越界 clamp 到首/末页。
 */
function findAutoBandIndex(bands: number[], top: number): number {
  const pageCount = bands.length - 1
  if (pageCount <= 1) return 0
  for (let i = 0; i < pageCount; i++) {
    if (top < bands[i + 1] - 1) return i
  }
  return pageCount - 1
}

/**
 * 计算元素在 PDF 中的页面、坐标与尺寸（统一坐标换算入口）
 * 返回 null 表示元素不可渲染（零尺寸或超出可用页面）
 */
export function resolveBox(ctx: RenderContext, element: HTMLElement): ResolvedBox | null {
  const rect = getRect(ctx.layoutCache, element)
  if (rect.width === 0 || rect.height === 0) return null

  // 通过 DOM 树确定所属页面
  const pageIndex = findPageIndex(ctx, element)
  if (pageIndex >= ctx.pages.length) return null

  const pageRect = pageIndex < ctx.pageRects.length ? ctx.pageRects[pageIndex] : ctx.containerRect

  const relativeX = rect.left - ctx.containerRect.left
  const relativeYBottom = rect.top - pageRect.top + rect.height

  return {
    page: ctx.pages[pageIndex],
    x: pxToPt(relativeX),
    // PDF 坐标系 Y 轴从下往上，drawText/drawRectangle 的 y 为底部位置
    y: ctx.pageHeight - pxToPt(relativeYBottom),
    width: pxToPt(rect.width),
    height: pxToPt(rect.height),
  }
}

/** 读取元素的 border-radius 并换算为 pt（无圆角返回 0） */
export function getBorderRadiusPt(element: HTMLElement, cache?: LayoutCache): number {
  const borderRadius = parseFloat(getStyle(cache, element).borderRadius) || 0
  return borderRadius > 0 ? pxToPt(borderRadius) : 0
}

/**
 * 将 border-box 的 box 内缩到 content-box。
 * resolveBox 用 getBoundingClientRect（border-box）定位，但 <img>/<canvas> 的位图
 * 内容只占 content-box（不含 border、padding）。若按 border-box 铺满位图，会盖住先画的边框。
 * 内缩后位图正好落在内容区，边框得以露出。圆角同步内缩半个边宽，保持与边框内缘贴合。
 */
export function insetToContentBox(
  element: HTMLElement,
  box: ResolvedBox,
  radius: number,
  cache?: LayoutCache,
): { box: ResolvedBox; radius: number } {
  const styles = getStyle(cache, element)
  const top = pxToPt((parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.paddingTop) || 0))
  const right = pxToPt((parseFloat(styles.borderRightWidth) || 0) + (parseFloat(styles.paddingRight) || 0))
  const bottom = pxToPt((parseFloat(styles.borderBottomWidth) || 0) + (parseFloat(styles.paddingBottom) || 0))
  const left = pxToPt((parseFloat(styles.borderLeftWidth) || 0) + (parseFloat(styles.paddingLeft) || 0))

  // PDF 坐标系 Y 轴向上：底部 y 上移 bottom 内缩量，高度减去上下内缩量
  const insetBox: ResolvedBox = {
    page: box.page,
    x: box.x + left,
    y: box.y + bottom,
    width: Math.max(0, box.width - left - right),
    height: Math.max(0, box.height - top - bottom),
  }

  // 内容区圆角 = 外圆角 - 边框宽度（取上/左边框近似），收敛到非负
  const borderInset = pxToPt(Math.max(parseFloat(styles.borderTopWidth) || 0, parseFloat(styles.borderLeftWidth) || 0))
  const insetRadius = radius > 0 ? Math.max(0, radius - borderInset) : 0

  return { box: insetBox, radius: insetRadius }
}

/**
 * 将圆角矩形路径压入裁剪区。坐标为 PDF 坐标系（左下原点）。
 * 半径过大时收敛到边长的一半，避免路径自交。
 */
export function pushRoundedRectClip(page: PDFPage, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  // bezier 近似圆弧的控制点系数
  const k = radius * (1 - 0.5522847498)
  page.pushOperators(
    moveTo(x + radius, y),
    lineTo(x + w - radius, y),
    appendBezierCurve(x + w - k, y, x + w, y + k, x + w, y + radius),
    lineTo(x + w, y + h - radius),
    appendBezierCurve(x + w, y + h - k, x + w - k, y + h, x + w - radius, y + h),
    lineTo(x + radius, y + h),
    appendBezierCurve(x + k, y + h, x, y + h - k, x, y + h - radius),
    lineTo(x, y + radius),
    appendBezierCurve(x, y + k, x + k, y, x + radius, y),
    closePath(),
    clip(),
    endPath(),
  )
}
