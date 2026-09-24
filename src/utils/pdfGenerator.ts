import { PDFDocument } from '@pdfme/pdf-lib'
import * as fontkit from 'fontkit'
import type { PdfExportOptions, PdfGenerateResult, FontFacePaths } from '../types.js'
import { renderHTML, type RenderContext } from './pdfRenderer.js'
import {
  createFontRegistrySubsets,
  type FamilyFontBuffers,
  type FamilySubset,
} from './fontSubset.js'
import { loadFontWithFallback, fetchFontBuffer } from './fontLoader.js'
import { createPerformanceMonitor, type PerformanceMonitor } from './performanceMonitor.js'
import { collectBreakUnits, packIntoPages, hasManualPages } from './autoPaginate.js'
import { createLayoutCache } from './render/layoutCache.js'
import { DEFAULT_FONT_KEY, type EmbeddedFont } from './render/context.js'
import { PDF_PAGE_ATTR } from '../constants.js'

/** pt → px（与 pxToPt 的 0.75 比例互逆） */
const PT_TO_PX = 1 / 0.75

/**
 * 获取页面尺寸
 */
function getPageSize(pageSize: PdfExportOptions['pageSize'] = 'A4') {
  if (typeof pageSize === 'object') {
    return pageSize
  }

  const sizes = {
    A4: { width: 595.28, height: 841.89 },
    A3: { width: 841.89, height: 1190.55 },
    Letter: { width: 612, height: 792 },
  }

  return sizes[pageSize] || sizes.A4
}

/**
 * 为容器内每个 PdfPage 计算对应的 DOM 区域，并创建等量 PDF 页面。
 *
 * 三种情况：
 * 1. 有 data-pdf-page 标记 → 手动分页：每个标记一页（原有行为）。
 * 2. 无标记 → 自动分页（computeAutoPages）：按内容流切页，返回 autoBands。
 * 3. 无标记且内容放得下/无可分页单元 → 单页。
 *
 * 返回 pageRects（供渲染坐标换算）与可选 autoBands（自动分页时归页用）。
 *
 * PdfPage 可以不是容器的直接子元素，但 PdfPage 之间不能嵌套。
 */
function computePages(
  pdfDoc: PDFDocument,
  element: HTMLElement,
  containerRect: DOMRect,
  finalPageSize: { width: number; height: number },
): { pageRects: DOMRect[]; autoBands?: number[] } {
  // 无手动分页标记 → 自动分页
  if (!hasManualPages(element)) {
    return computeAutoPages(pdfDoc, element, containerRect, finalPageSize)
  }

  const containerStyles = window.getComputedStyle(element)
  const paddingTop = parseFloat(containerStyles.paddingTop) || 0

  // 查找所有后代中的 data-pdf-page 元素
  const allPages = Array.from(element.querySelectorAll(`[${PDF_PAGE_ATTR}]`)) as HTMLElement[]

  // 过滤出顶层 page（不在另一个 page 内部的）
  const pageElements = allPages.filter((page) => {
    let parent = page.parentElement
    while (parent && parent !== element) {
      if (parent.hasAttribute(PDF_PAGE_ATTR)) {
        return false // 嵌套在另一个 page 内，跳过
      }
      parent = parent.parentElement
    }
    return true // 顶层 page
  })

  const pageRects: DOMRect[] = []

  if (pageElements.length === 0) {
    pdfDoc.addPage([finalPageSize.width, finalPageSize.height])
    return { pageRects: [containerRect] }
  }

  pageElements.forEach((pageEl, index) => {
    const children = Array.from(pageEl.children) as HTMLElement[]
    let pageTop: number
    let pageBottom: number

    if (children.length > 0) {
      const minTop = Math.min(...children.map((child) => child.getBoundingClientRect().top))
      // 首页保留容器自然 padding，后续页减去 padding 以对齐首页效果
      pageTop = index === 0 ? containerRect.top : minTop - paddingTop
      pageBottom = Math.max(...children.map((child) => child.getBoundingClientRect().bottom))
    } else {
      pageTop = containerRect.top
      pageBottom = pageTop + finalPageSize.height
    }

    pageRects.push({
      top: pageTop,
      left: containerRect.left,
      right: containerRect.right,
      bottom: pageBottom,
      width: containerRect.width,
      height: pageBottom - pageTop,
      x: containerRect.left,
      y: pageTop,
    } as DOMRect)

    pdfDoc.addPage([finalPageSize.width, finalPageSize.height])
  })

  return { pageRects }
}

/**
 * 自动分页：按内容流把容器切成多页。
 *
 * 边距「所见即所得」——完全由容器的 CSS padding 推导，不再有独立的 margin 选项：
 * - 上下留白 = 容器 padding-top / padding-bottom。
 * - 左右留白由 resolveBox（rect.left - containerRect.left，含 padding-left）天然带出。
 *
 * 坐标分两套：
 * - autoBands：原始未偏移的视口 Y 边界（content-box 区间），供 findPageIndex 按元素 top 归页。
 * - pageRects：每页的 DOM 区域，top 上移 paddingTop（px），使每页第一个块在 PDF 中
 *   距页顶恰为 padding-top；渲染坐标 y = pageHeight - pxToPt(rect.top - pageRect.top + h)。
 *
 * 每页可用内容高度 = 页高(px) - paddingTop - paddingBottom；padding 过大致其 <= 0 时回退单页并告警。
 */
function computeAutoPages(
  pdfDoc: PDFDocument,
  element: HTMLElement,
  containerRect: DOMRect,
  finalPageSize: { width: number; height: number },
): { pageRects: DOMRect[]; autoBands?: number[] } {
  // 边距完全由容器 CSS padding 推导（所见即所得）：
  // - 上下留白 = padding-top / padding-bottom
  // - 左右留白由 resolveBox 的 rect.left - containerRect.left 天然带出（含 padding-left），无需在此处理
  const styles = window.getComputedStyle(element)
  const paddingTopPx = parseFloat(styles.paddingTop) || 0
  const paddingBottomPx = parseFloat(styles.paddingBottom) || 0

  // 内容区上下边界（content-box）。以 content-box 顶为页 1 起点，保留首个子元素自身的
  // margin（与浏览器一致）；同时避免把 border-box 顶到内容区的 padding 二次叠加。
  const contentTop = containerRect.top + paddingTopPx
  const contentBottom = containerRect.bottom - paddingBottomPx

  // 每页可用内容高度（px）：页高换算为 px 后减去上下 padding
  const pageHeightPx = finalPageSize.height * PT_TO_PX
  const contentHeightPx = pageHeightPx - paddingTopPx - paddingBottomPx

  const singlePage = (): { pageRects: DOMRect[]; autoBands?: number[] } => {
    pdfDoc.addPage([finalPageSize.width, finalPageSize.height])
    // pageRect.top 上移 paddingTop，使内容区顶部在 PDF 中留出 padding-top
    return {
      pageRects: [makeRect(containerRect, contentTop - paddingTopPx, containerRect.bottom)],
      autoBands: [contentTop, contentBottom],
    }
  }

  if (contentHeightPx <= 0) {
    console.warn('[html-to-pdf] 容器上下 padding 之和已超过页面高度，自动分页回退为单页')
    return singlePage()
  }

  const units = collectBreakUnits(element)
  const bands = packIntoPages(units, contentTop, contentBottom, contentHeightPx)

  // 只有一页（含空内容）→ 走单页，避免多余偏移
  if (bands.length <= 2) return singlePage()

  const pageRects: DOMRect[] = []
  for (let i = 0; i < bands.length - 1; i++) {
    // 每页渲染区域 top 上移 paddingTop：使该页第一个块在 PDF 中距页顶恰为 padding-top
    pageRects.push(makeRect(containerRect, bands[i] - paddingTopPx, bands[i + 1]))
    pdfDoc.addPage([finalPageSize.width, finalPageSize.height])
  }

  return { pageRects, autoBands: bands }
}

/** 以容器的水平范围 + 给定上下边界构造一个 DOMRect 形状对象 */
function makeRect(containerRect: DOMRect, top: number, bottom: number): DOMRect {
  return {
    top,
    left: containerRect.left,
    right: containerRect.right,
    bottom,
    width: containerRect.width,
    height: bottom - top,
    x: containerRect.left,
    y: top,
  } as DOMRect
}
/** 内部：一个待加载字体家族的规格（URL 未定则用内置思源黑体，仅默认家族允许） */
interface FontLoadSpec {
  key: string // 小写字体名
  regularUrl?: string
  boldUrl?: string
  isDefault: boolean
}

/**
 * 根据 options.fonts（+ 兼容旧的 options.fontPaths）构建待加载字体规格列表，
 * 并保证存在默认家族（key = DEFAULT_FONT_KEY）。
 */
function buildFontSpecs(
  fonts: Record<string, FontFacePaths> | undefined,
  fontPaths: PdfExportOptions['fontPaths'],
): FontLoadSpec[] {
  const specs = new Map<string, FontLoadSpec>()

  if (fonts) {
    for (const [name, face] of Object.entries(fonts)) {
      const key = name.trim().toLowerCase()
      if (!key || !face?.regular) continue
      specs.set(key, {
        key,
        regularUrl: face.regular,
        boldUrl: face.bold,
        isDefault: key === DEFAULT_FONT_KEY,
      })
    }
  }

  // 保证默认家族存在：优先用 fonts.default，其次兼容旧 fontPaths，最后内置思源黑体
  if (!specs.has(DEFAULT_FONT_KEY)) {
    specs.set(DEFAULT_FONT_KEY, {
      key: DEFAULT_FONT_KEY,
      regularUrl: fontPaths?.regular, // undefined → 内置思源黑体
      boldUrl: fontPaths?.bold,
      isDefault: true,
    })
  }

  return [...specs.values()]
}

/**
 * 加载并嵌入 fonts 注册表中的所有字体家族。
 *
 * - 默认家族（DEFAULT_FONT_KEY）：URL 未指定时回退到内置思源黑体（受 basePath 影响）。
 * - 其它家族：Regular 必需（加载失败则跳过该家族并告警），Bold 可选。
 * - 每个家族按页面实际用到的字符做子集化，并记录字形覆盖集供渲染时选字体/逐字形回退。
 */
async function embedFonts(
  pdfDoc: PDFDocument,
  element: HTMLElement,
  fonts: Record<string, FontFacePaths> | undefined,
  fontPaths: PdfExportOptions['fontPaths'],
  subset: boolean,
  monitor: PerformanceMonitor,
  timeout: number,
  basePath: string,
  converterOptions: PdfExportOptions['converterOptions'],
): Promise<{ fonts: Map<string, EmbeddedFont>; fontKeys: string[]; hasCharMap: boolean }> {
  const specs = buildFontSpecs(fonts, fontPaths)

  // 并行加载各家族字体 buffer
  const families = await Promise.all(
    specs.map(async (spec): Promise<FamilyFontBuffers> => {
      if (spec.isDefault) {
        // 默认家族：URL 未指定时回退内置思源黑体
        const regular = await loadFontWithFallback('regular', spec.regularUrl, timeout, basePath)
        const bold = await loadFontWithFallback('bold', spec.boldUrl, timeout, basePath).catch(
          (err) => {
            console.warn('[html-to-pdf] 默认字体 Bold 加载失败，将仅使用 Regular:', err)
            return undefined
          },
        )
        return { key: spec.key, regular, bold }
      }

      // 其它家族：Regular 必需，失败则跳过整个家族
      const regular = spec.regularUrl
        ? await fetchFontBuffer(spec.regularUrl, timeout).catch((err) => {
            console.warn(`[html-to-pdf] 字体 "${spec.key}" 加载失败，将忽略该字体:`, err)
            return undefined
          })
        : undefined
      const bold = spec.boldUrl
        ? await fetchFontBuffer(spec.boldUrl, timeout).catch((err) => {
            console.warn(`[html-to-pdf] 字体 "${spec.key}" Bold 加载失败，将降级为 Regular:`, err)
            return undefined
          })
        : undefined
      return { key: spec.key, regular, bold }
    }),
  )
  monitor.mark(`加载 ${families.length} 个字体家族`)

  // 子集化（非子集化模式仅计算 coverage，保留完整字体）
  const { subsets } = await createFontRegistrySubsets(element, families, converterOptions, subset)
  monitor.mark('创建字体子集')

  // 嵌入
  const embedded = new Map<string, EmbeddedFont>()
  let hasCharMap = false
  const embedOpts = subset ? undefined : { subset: false }

  for (const s of subsets as FamilySubset[]) {
    if (!s.regular) continue
    const regular = await pdfDoc.embedFont(s.regular, embedOpts)
    const bold = s.bold ? await pdfDoc.embedFont(s.bold, embedOpts) : undefined
    embedded.set(s.key, {
      regular,
      bold,
      coveredRegular: s.coveredRegular,
      coveredBold: s.coveredBold,
      charMapRegular: s.charMapRegular,
      charMapBold: s.charMapBold,
    })
    if ((s.charMapRegular && s.charMapRegular.size > 0) || (s.charMapBold && s.charMapBold.size > 0))
      hasCharMap = true
  }
  monitor.mark('嵌入子集字体')

  if (!embedded.has(DEFAULT_FONT_KEY)) {
    throw new Error('字体嵌入失败：缺少默认字体（default）')
  }

  return { fonts: embedded, fontKeys: [...embedded.keys()], hasCharMap }
}

/**
 * HTML 转 PDF 并自动下载
 * @param element - 要导出的 HTML 元素
 * @param options - 导出选项
 * @returns 包含 blob 的结果对象
 */
export async function htmlToPdf(
  element: HTMLElement,
  options: PdfExportOptions = {},
): Promise<PdfGenerateResult> {
  const monitor = createPerformanceMonitor(options.debug)
  monitor.start()

  try {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit as any)

    // 按 fonts 注册表加载并嵌入各字体家族（默认家族回退内置思源黑体，子集含页面用到的字符）
    const subset = options.fontSubset !== false
    const embedded = await embedFonts(
      pdfDoc,
      element,
      options.fonts,
      options.fontPaths,
      subset,
      monitor,
      options.fontLoadTimeout ?? 30000,
      options.basePath ?? '/',
      options.converterOptions,
    )

    // 页面尺寸、边距、方向
    const pageSize = getPageSize(options.pageSize)
    const orientation = options.orientation || 'portrait'
    const finalPageSize =
      orientation === 'landscape' ? { width: pageSize.height, height: pageSize.width } : pageSize

    const containerRect = element.getBoundingClientRect()
    const { pageRects, autoBands } = computePages(pdfDoc, element, containerRect, finalPageSize)
    monitor.mark(`创建 ${pdfDoc.getPageCount()} 个页面`)

    const ctx: RenderContext = {
      pdfDoc,
      pages: pdfDoc.getPages(),
      pageRects,
      fonts: embedded.fonts,
      defaultFontKey: DEFAULT_FONT_KEY,
      fontKeys: embedded.fontKeys,
      hasCharMap: embedded.hasCharMap,
      containerRect,
      pageHeight: finalPageSize.height,
      pageWidth: finalPageSize.width,
      autoBands,
      canvasResolver: options.canvasResolver,
      canvasPixelRatio: options.canvasPixelRatio ?? Math.max(2, window.devicePixelRatio || 1),
      layoutCache: createLayoutCache(),
    }

    await renderHTML(ctx, element)
    monitor.mark('渲染 HTML 内容')

    const pdfBytes = await pdfDoc.save()
    monitor.mark('生成 PDF 字节')

    const blob = new Blob([pdfBytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
    monitor.end('PDF 导出完成')

    // 自动下载
    const filename = options.filename || 'document'
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return { success: true, blob }
  } catch (error) {
    console.error('PDF generation error:', error)
    monitor.end('PDF 导出失败')
    return { success: false, error: error as Error }
  }
}
