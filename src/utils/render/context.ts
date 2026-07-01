import { PDFPage, PDFFont, PDFDocument } from '@pdfme/pdf-lib'
import type { LayoutCache } from './layoutCache.js'

/** 渲染上下文：贯穿一次导出的字体、页面、坐标基准等共享状态 */
export interface RenderContext {
  pdfDoc: PDFDocument
  pages: PDFPage[]
  pageRects: DOMRect[] // 每个页面对应的 DOM 区域
  latinFont: PDFFont
  latinFontBold: PDFFont
  chineseFont?: PDFFont
  chineseFontBold?: PDFFont
  fallbackFont?: PDFFont // 后备字体（当自定义字体缺少某些字符时使用）
  fallbackFontBold?: PDFFont // 后备字体 Bold
  missingChars?: Set<string> // 主字体中缺失的字符集合
  charMapRegular?: Map<string, string> // Regular 字体简繁映射（简体→繁体）
  charMapBold?: Map<string, string> // Bold 字体简繁映射（简体→繁体）
  containerRect: DOMRect
  pageHeight: number
  pageWidth: number
  /** 布局读取缓存（getComputedStyle / getBoundingClientRect 的 per-export 缓存） */
  layoutCache?: LayoutCache
  /** 自定义 canvas → 图片数据的钩子（见 PdfExportOptions.canvasResolver） */
  canvasResolver?: (
    canvas: HTMLCanvasElement,
  ) => string | ArrayBuffer | null | undefined | Promise<string | ArrayBuffer | null | undefined>
  /** ECharts 自动探测兜底的像素比 */
  canvasPixelRatio: number
  /**
   * 自动分页的「断页带」边界（原始 DOM 视口 Y 坐标，未做 margin 偏移），形如
   * `[firstPageTop, page2Top, ..., containerBottom]`，长度 = 页数 + 1。
   * 仅在自动分页（容器无 data-pdf-page 标记）时存在；存在时 findPageIndex 改按
   * 元素 rect.top 落在哪个区间来归页，而非沿 DOM 祖先查 data-pdf-page。
   */
  autoBands?: number[]
}

/** 元素在 PDF 中解析后的位置与尺寸 */
export interface ResolvedBox {
  page: PDFPage
  x: number
  y: number
  width: number
  height: number
}
