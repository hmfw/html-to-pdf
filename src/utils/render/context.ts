import { PDFPage, PDFFont, PDFDocument } from '@pdfme/pdf-lib'
import type { LayoutCache } from './layoutCache.js'

/** fonts 注册表中默认/兜底字体的保留 key */
export const DEFAULT_FONT_KEY = 'default'

/**
 * 已嵌入的一个字体家族（对应 fonts 注册表的一个 key）。
 * covered* 记录该字体子集实际包含字形的字符集（= 使用到的字符 − 缺失字符），
 * 供渲染时判断某字符能否由该字体绘制，从而决定是否逐字形回退到其它字体。
 */
export interface EmbeddedFont {
  regular: PDFFont // Regular 字重（必需）
  bold?: PDFFont // Bold 字重，缺失时降级为 Regular
  coveredRegular: Set<string> // Regular 覆盖的字符（含经 OpenCC 转换后可渲染的原字符）
  coveredBold?: Set<string> // Bold 覆盖的字符；无 Bold 时为 undefined
  charMapRegular?: Map<string, string> // Regular 简繁映射（原始→转换后）
  charMapBold?: Map<string, string> // Bold 简繁映射
}

/** 渲染上下文：贯穿一次导出的字体、页面、坐标基准等共享状态 */
export interface RenderContext {
  pdfDoc: PDFDocument
  pages: PDFPage[]
  pageRects: DOMRect[] // 每个页面对应的 DOM 区域
  /** 字体注册表：小写字体名 → 已嵌入字体。必定包含 defaultFontKey。 */
  fonts: Map<string, EmbeddedFont>
  /** 默认/兜底字体的 key（未匹配 font-family 或用到通用族时使用） */
  defaultFontKey: string
  /** 所有字体 key（逐字形回退时的扫描顺序） */
  fontKeys: string[]
  /** 是否存在任一 OpenCC 字符映射（用于渲染快速路径判断） */
  hasCharMap: boolean
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
