import { PDFDocument, PDFFont, StandardFonts } from '@pdfme/pdf-lib'
import * as fontkit from 'fontkit'
import type { PdfExportOptions, PdfGenerateResult } from '../types'
import { renderHTML, type RenderContext } from './pdfRenderer'
import { createFontSubsetsForElement } from './fontSubset'
import { createPerformanceMonitor, type PerformanceMonitor } from './performanceMonitor'
import { PDF_PAGE_ATTR } from '../constants'

/** 默认字体路径 */
const DEFAULT_FONT_URLS = {
  regular: '/fonts/Source_Han_Sans_SC_Regular.otf',
  bold: '/fonts/Source_Han_Sans_SC_Bold.otf',
}

/**
 * 标准化边距
 */
function normalizeMargin(margin: number | { top: number; right: number; bottom: number; left: number } = 40) {
  if (typeof margin === 'number') {
    return { top: margin, right: margin, bottom: margin, left: margin }
  }
  return margin
}

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
 * 为元素动态生成并嵌入中文字体子集
 * @param subset 是否子集化（false 时嵌入完整字体）
 */
async function embedChineseFonts(
  pdfDoc: PDFDocument,
  element: HTMLElement,
  customFontPaths: PdfExportOptions['fontPaths'],
  subset: boolean,
  monitor: PerformanceMonitor,
): Promise<{ regular: PDFFont; bold?: PDFFont }> {
  // 合并自定义路径和默认路径（始终加载 Regular 和 Bold 两个字重）
  const fontUrls: { regular: string; bold: string } = {
    regular: customFontPaths?.regular || DEFAULT_FONT_URLS.regular,
    bold: customFontPaths?.bold || DEFAULT_FONT_URLS.bold,
  }

  // 不子集化：直接嵌入完整字体文件
  if (!subset) {
    const [regularBuf, boldBuf] = await Promise.all([
      fetch(fontUrls.regular).then((r) => r.arrayBuffer()),
      fetch(fontUrls.bold).then((r) => r.arrayBuffer()),
    ])
    monitor.mark('加载完整字体')

    const regular = await pdfDoc.embedFont(regularBuf, { subset: false })
    const bold = await pdfDoc.embedFont(boldBuf, { subset: false })
    monitor.mark('嵌入完整字体')

    return { regular, bold }
  }

  const subsets = await createFontSubsetsForElement(element, fontUrls)
  monitor.mark('创建字体子集')

  if (!subsets.regular) {
    throw new Error('子集字体嵌入失败：缺少 Regular 字重')
  }

  const regular = await pdfDoc.embedFont(subsets.regular)
  const bold = subsets.bold ? await pdfDoc.embedFont(subsets.bold) : undefined
  monitor.mark('嵌入子集字体')

  return { regular, bold }
}

/**
 * 为容器内每个 PdfPage 计算对应的 DOM 区域，并创建等量 PDF 页面。
 * 若无 PdfPage 标记则创建单页。返回每页的 DOMRect。
 *
 * PdfPage 可以不是容器的直接子元素，但 PdfPage 之间不能嵌套。
 */
function computePages(
  pdfDoc: PDFDocument,
  element: HTMLElement,
  containerRect: DOMRect,
  finalPageSize: { width: number; height: number },
): DOMRect[] {
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
    return [containerRect]
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

  return pageRects
}

/**
 * HTML 转 PDF 并自动下载
 * @param element - 要导出的 HTML 元素
 * @param options - 导出选项
 * @returns 包含 blob 的结果对象
 */
export async function htmlToPdf(element: HTMLElement, options: PdfExportOptions = {}): Promise<PdfGenerateResult> {
  const monitor = createPerformanceMonitor()
  monitor.start()

  try {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit as any)

    // 英文使用标准字体（Regular + Bold），中文使用动态子集化字体
    const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const latinFontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    monitor.mark('加载标准字体')

    const subset = options.fontSubset !== false
    const chineseFonts = await embedChineseFonts(pdfDoc, element, options.fontPaths, subset, monitor)

    // 页面尺寸、边距、方向
    const pageSize = getPageSize(options.pageSize)
    const margin = normalizeMargin(options.margin)
    const orientation = options.orientation || 'portrait'
    const finalPageSize = orientation === 'landscape' ? { width: pageSize.height, height: pageSize.width } : pageSize

    const containerRect = element.getBoundingClientRect()
    const pageRects = computePages(pdfDoc, element, containerRect, finalPageSize)
    monitor.mark(`创建 ${pdfDoc.getPageCount()} 个页面`)

    const ctx: RenderContext = {
      pdfDoc,
      pages: pdfDoc.getPages(),
      pageRects,
      latinFont,
      latinFontBold,
      chineseFont: chineseFonts.regular,
      chineseFontBold: chineseFonts.bold,
      containerRect,
      pageHeight: finalPageSize.height,
      pageWidth: finalPageSize.width,
      margin,
      canvasResolver: options.canvasResolver,
      canvasPixelRatio:
        options.canvasPixelRatio ?? Math.max(2, window.devicePixelRatio || 1),
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
