import { PDFImage, rgb, pushGraphicsState, popGraphicsState } from '@pdfme/pdf-lib'
import {
  loadImageAsArrayBuffer,
  canvasToArrayBuffer,
  detectImageFormat,
  tryEChartsHighRes,
  canvasSourceToArrayBuffer,
} from '../imageHelper.js'
import type { RenderContext, ResolvedBox } from './context.js'
import { pushRoundedRectClip } from './geometry.js'

/** 加载并嵌入 <img> 为 PDFImage（按格式选择 png/jpg） */
export async function embedImageElement(ctx: RenderContext, img: HTMLImageElement): Promise<PDFImage> {
  const imageData = await loadImageAsArrayBuffer(img.src)
  const format = detectImageFormat(img.src)
  if (format === 'jpg') return ctx.pdfDoc.embedJpg(imageData)
  return ctx.pdfDoc.embedPng(imageData)
}

/**
 * 嵌入 <canvas> 为 PDFImage。优先级：
 * 1. canvasResolver（使用方显式提供高清数据）
 * 2. ECharts 自动探测（tryEChartsHighRes）
 * 3. 默认栅格（直接读取 canvas backing store）
 */
export async function embedCanvasElement(ctx: RenderContext, canvas: HTMLCanvasElement): Promise<PDFImage> {
  // 1. 使用方钩子
  if (ctx.canvasResolver) {
    const resolved = await ctx.canvasResolver(canvas)
    if (resolved) {
      return embedCanvasSource(ctx, resolved)
    }
  }

  // 2. ECharts 自动探测兜底
  const echartsUrl = tryEChartsHighRes(canvas, ctx.canvasPixelRatio)
  if (echartsUrl) {
    return embedCanvasSource(ctx, echartsUrl)
  }

  // 3. 默认栅格
  return ctx.pdfDoc.embedPng(await canvasToArrayBuffer(canvas))
}

/** 将 canvasResolver/探测返回的数据（data URL 或 ArrayBuffer）按格式嵌入 */
function embedCanvasSource(ctx: RenderContext, source: string | ArrayBuffer): Promise<PDFImage> {
  const data = canvasSourceToArrayBuffer(source)
  // data URL 形如 data:image/jpeg;... 时用 jpg，其余按 png 处理
  const isJpg = typeof source === 'string' && /^data:image\/jpe?g/i.test(source)
  return isJpg ? ctx.pdfDoc.embedJpg(data) : ctx.pdfDoc.embedPng(data)
}

/** 图片/Canvas 渲染失败时的占位框样式 */
const IMAGE_ERROR_STYLE = {
  label: '[图片加载失败]',
  textColor: rgb(0.6, 0.6, 0.6),
  borderColor: rgb(0.8, 0.8, 0.8),
  borderWidth: 1,
  fontSize: 10,
  padding: 5,
} as const

/**
 * 渲染图片类元素（img / canvas 通用），失败时绘制统一的错误占位框。
 * radius > 0 时把图片裁成圆角矩形。
 */
export async function renderImage(
  ctx: RenderContext,
  box: ResolvedBox,
  radius: number,
  embed: () => Promise<PDFImage>,
): Promise<void> {
  try {
    const pdfImage = await embed()
    if (radius > 0) {
      box.page.pushOperators(pushGraphicsState())
      pushRoundedRectClip(box.page, box.x, box.y, box.width, box.height, radius)
      box.page.drawImage(pdfImage, { x: box.x, y: box.y, width: box.width, height: box.height })
      box.page.pushOperators(popGraphicsState())
    } else {
      box.page.drawImage(pdfImage, { x: box.x, y: box.y, width: box.width, height: box.height })
    }
  } catch (error) {
    console.warn('Failed to render image:', error)
    const s = IMAGE_ERROR_STYLE
    box.page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      borderColor: s.borderColor,
      borderWidth: s.borderWidth,
    })
    box.page.drawText(s.label, {
      x: box.x + s.padding,
      y: box.y + box.height / 2 - s.fontSize / 2,
      size: s.fontSize,
      font: ctx.chineseFont ?? ctx.latinFont,
      color: s.textColor,
    })
  }
}
