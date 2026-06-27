import {
  PDFPage,
  PDFFont,
  PDFImage,
  rgb,
  PDFDocument,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  clip,
  endPath,
} from '@pdfme/pdf-lib'
import { pxToPt, parseColor } from './htmlParser.js'
import { loadImageAsArrayBuffer, canvasToArrayBuffer, detectImageFormat, tryEChartsHighRes, canvasSourceToArrayBuffer } from './imageHelper.js'
import { PDF_CONTAINER_ATTR, PDF_PAGE_ATTR } from '../constants.js'

export interface RenderContext {
  pdfDoc: PDFDocument
  pages: PDFPage[]
  pageRects: DOMRect[] // 每个页面对应的 DOM 区域
  latinFont: PDFFont
  latinFontBold: PDFFont
  chineseFont?: PDFFont
  chineseFontBold?: PDFFont
  containerRect: DOMRect
  pageHeight: number
  pageWidth: number
  margin: {
    top: number
    right: number
    bottom: number
    left: number
  }
  /** 自定义 canvas → 图片数据的钩子（见 PdfExportOptions.canvasResolver） */
  canvasResolver?: (
    canvas: HTMLCanvasElement,
  ) => string | ArrayBuffer | null | undefined | Promise<string | ArrayBuffer | null | undefined>
  /** ECharts 自动探测兜底的像素比 */
  canvasPixelRatio: number
}

/** 元素在 PDF 中解析后的位置与尺寸 */
interface ResolvedBox {
  page: PDFPage
  x: number
  y: number
  width: number
  height: number
}

/**
 * 查找元素所属的 PdfPage 并返回页码
 * PdfPage 可以不是容器的直接子元素，但不能嵌套。
 */
function findPageIndex(ctx: RenderContext, element: HTMLElement): number {
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
 * 计算元素在 PDF 中的页面、坐标与尺寸（统一坐标换算入口）
 * 返回 null 表示元素不可渲染（零尺寸或超出可用页面）
 */
function resolveBox(ctx: RenderContext, element: HTMLElement): ResolvedBox | null {
  const rect = element.getBoundingClientRect()
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
/**
 * 根据字重选择合适的字体。
 * 中英文统一走子集化的思源黑体（子集已包含页面用到的拉丁字符），
 * 保证中英文混排时字形一致；仅在子集字体缺失时回退到内置 Helvetica。
 */
function selectFont(ctx: RenderContext, fontWeight: string | number): PDFFont {
  // 解析字重（处理字符串和数字）
  let weight = 400
  if (typeof fontWeight === 'string') {
    if (fontWeight === 'bold' || fontWeight === 'bolder') {
      weight = 700
    } else if (fontWeight === 'lighter') {
      weight = 300
    } else if (fontWeight !== 'normal') {
      const parsed = parseInt(fontWeight)
      weight = isNaN(parsed) ? 400 : parsed
    }
  } else {
    weight = fontWeight
  }

  // 600 及以上（Semi-bold、Bold、Extra-bold、Black）使用 Bold 字体
  // 理由：库只有 Regular / Bold 两个字重，600+ 视觉上更接近粗体
  const isBold = weight >= 600

  if (isBold) return ctx.chineseFontBold ?? ctx.chineseFont ?? ctx.latinFontBold
  return ctx.chineseFont ?? ctx.latinFont
}

/** 斜体倾斜角度（度）。项目未内嵌斜体字体，用 skew 变换模拟 oblique */
const ITALIC_SKEW_DEGREES = 12

type DrawTextOptions = {
  x: number
  y: number
  size: number
  font: PDFFont
  color: ReturnType<typeof rgb>
  italic: boolean
  maxWidth?: number
  lineHeight?: number
}

/**
 * 绘制文本，支持用 skew 变换模拟斜体。
 * skew 绕坐标原点进行，故先把变换原点平移到基线 (x, y) 再倾斜，避免文字水平错位。
 */
function drawStyledText(page: PDFPage, text: string, opts: DrawTextOptions): void {
  const { x, y, italic, ...rest } = opts

  if (!italic) {
    page.drawText(text, { x, y, ...rest })
    return
  }

  const tan = Math.tan((ITALIC_SKEW_DEGREES * Math.PI) / 180)
  page.pushOperators(
    pushGraphicsState(),
    // 平移到基线 → 水平 skew（矩阵 c = tan）→ 平移回原点
    concatTransformationMatrix(1, 0, 0, 1, x, y),
    concatTransformationMatrix(1, 0, tan, 1, 0, 0),
    concatTransformationMatrix(1, 0, 0, 1, -x, -y),
  )
  page.drawText(text, { x, y, ...rest })
  page.pushOperators(popGraphicsState())
}

/**
 * 解析元素实际行高（返回 pt）。
 * computed style 的 lineHeight 通常已是像素值，可直接换算；
 * 仅当为 'normal'（或无法解析）时，才回退到 1.2 倍字号的估算。
 */
function resolveLineHeight(styles: CSSStyleDeclaration, fontSizePt: number): number {
  const raw = styles.lineHeight
  if (raw && raw !== 'normal') {
    const px = parseFloat(raw)
    if (!Number.isNaN(px)) return pxToPt(px)
  }
  return fontSizePt * 1.2
}

/**
 * 计算文字基线距行盒顶部的距离（pt）。
 * CSS 行盒模型：行高大于字体自然高度时，多出的 leading 上下均分，
 * 故 baseline = 半 leading + ascent。这样行高越松，文字越靠下，与浏览器一致。
 * @param font     pdf-lib 字体
 * @param fontSize 字号（pt）
 * @param lineBoxPt 行盒高度（pt），单行时取 range 的实测高度
 */
function baselineFromTop(font: PDFFont, fontSize: number, lineBoxPt: number): number {
  const ascent = font.heightAtSize(fontSize, { descender: false })
  const fullHeight = font.heightAtSize(fontSize) // 含 descender
  const halfLeading = (lineBoxPt - fullHeight) / 2
  return halfLeading + ascent
}

/** 单个可视行的测量结果：文本内容 + 该行在视口中的矩形 */
type MeasuredLine = { text: string; left: number; top: number; width: number; height: number }

/**
 * 用 Range 逐字符测量，把一个文本节点切分为浏览器实际渲染的「可视行」。
 * 依据每个字符的 client rect top 是否跳变来判断换行，从而完全复刻浏览器的换行点
 * （含中英文混排、长单词、标点避头尾等），不再依赖 pdf-lib 的宽度估算换行。
 */
function measureVisualLines(textNode: Text): MeasuredLine[] {
  const content = textNode.textContent ?? ''
  const lines: MeasuredLine[] = []
  const range = document.createRange()

  let lineStart = 0
  let prevTop: number | null = null
  let prevRect: DOMRect | null = null

  // 以「字符」为单位遍历（兼容代理对），按视口 top 跳变切行
  const chars = Array.from(content)
  let offset = 0
  const offsets: number[] = []
  for (const ch of chars) {
    offsets.push(offset)
    offset += ch.length
  }
  offsets.push(offset)

  const flush = (startOff: number, endOff: number, rect: DOMRect) => {
    const t = content.slice(startOff, endOff)
    if (t.trim()) lines.push({ text: t, left: rect.left, top: rect.top, width: rect.width, height: rect.height })
  }

  for (let i = 0; i < chars.length; i++) {
    range.setStart(textNode, offsets[i])
    range.setEnd(textNode, offsets[i + 1])
    const r = range.getBoundingClientRect()
    // 空白字符可能返回零宽 rect，跳过其 top 判断但保留在行文本中
    if (r.height === 0) {
      prevRect = prevRect ?? r
      continue
    }
    if (prevTop !== null && Math.abs(r.top - prevTop) > 1) {
      // 换行：结算上一行（用上一行整体矩形）
      range.setStart(textNode, offsets[lineStart])
      range.setEnd(textNode, offsets[i])
      flush(offsets[lineStart], offsets[i], range.getBoundingClientRect())
      lineStart = i
    }
    prevTop = r.top
    prevRect = r
  }

  // 结算最后一行
  if (lineStart < chars.length) {
    range.setStart(textNode, offsets[lineStart])
    range.setEnd(textNode, offsets[chars.length])
    flush(offsets[lineStart], offsets[chars.length], range.getBoundingClientRect())
  }

  return lines
}

/**
 * 渲染文本节点（基于 Range 精确定位）
 */
function renderTextNode(ctx: RenderContext, textNode: Text, parentElement: HTMLElement): void {
  const text = textNode.textContent?.trim()
  if (!text) return

  // 用临时 range 获取文本节点的精确位置
  const range = document.createRange()
  range.selectNodeContents(textNode)
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return

  const pageIndex = findPageIndex(ctx, parentElement)
  if (pageIndex >= ctx.pages.length) return

  const pageRect = pageIndex < ctx.pageRects.length ? ctx.pageRects[pageIndex] : ctx.containerRect
  const page = ctx.pages[pageIndex]

  const styles = window.getComputedStyle(parentElement)
  const fontSize = pxToPt(parseFloat(styles.fontSize)) // px → pt
  const font = selectFont(ctx, styles.fontWeight)
  const color = parseColor(styles.color)
  // italic / oblique 都按斜体处理
  const italic = styles.fontStyle === 'italic' || styles.fontStyle.startsWith('oblique')

  // 检查是否在 <pre> 标签内（需要保留换行符）
  let isPreformatted = false
  let current = parentElement
  while (current) {
    if (current.tagName === 'PRE') {
      isPreformatted = true
      break
    }
    current = current.parentElement as HTMLElement
  }

  // 对于 <pre> 内的多行文本，按行分别渲染
  if (isPreformatted && text.includes('\n')) {
    const lines = textNode.textContent!.split('\n')
    const lineHeight = resolveLineHeight(styles, fontSize)
    // 每行行盒高度即 lineHeight，基线据此居中定位
    const firstBaseline = baselineFromTop(font, fontSize, lineHeight)

    lines.forEach((line, index) => {
      if (!line.trim()) return // 跳过空行

      // 基线 = 边界框顶部 + 首行基线偏移 + 当前行偏移
      const lineY = ctx.pageHeight - pxToPt(rect.top - pageRect.top) - firstBaseline - index * lineHeight

      try {
        drawStyledText(page, line, {
          x: pxToPt(rect.left - ctx.containerRect.left),
          y: lineY,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
          italic,
          lineHeight,
        })
      } catch (error) {
        console.warn('Failed to draw text line:', line, error)
      }
    })
  } else {
    // 普通文本：用 Range 逐行测量，复刻浏览器换行点后逐行绘制，
    // 不再交给 pdf-lib 自动换行（其宽度估算会导致中英文混排时换行点偏差、右侧溢出）。
    const lines = measureVisualLines(textNode)
    const lineHeight = resolveLineHeight(styles, fontSize)

    for (const line of lines) {
      const x = pxToPt(line.left - ctx.containerRect.left)
      // 每行用自身实测行盒高度定位基线，首行不再被整段高度顶到中部
      const baselineY =
        ctx.pageHeight - pxToPt(line.top - pageRect.top) - baselineFromTop(font, fontSize, pxToPt(line.height))
      try {
        drawStyledText(page, line.text, {
          x,
          y: baselineY,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
          italic,
          lineHeight,
        })
        // 文字装饰线（下划线 / 删除线 / 上划线），按行宽绘制
        drawTextDecoration(page, styles, {
          x,
          baselineY,
          width: pxToPt(line.width),
          fontSize,
          color: rgb(color.r, color.g, color.b),
        })
      } catch (error) {
        console.warn('Failed to draw text:', line.text, error)
      }
    }
  }
}

/**
 * 绘制 text-decoration-line（underline / line-through / overline）。
 * 用细矩形模拟，线宽随字号缩放，颜色取文字颜色。
 * 不支持装饰线颜色/样式（dashed/wavy 等），统一画实线。
 */
function drawTextDecoration(
  page: PDFPage,
  styles: CSSStyleDeclaration,
  opts: { x: number; baselineY: number; width: number; fontSize: number; color: ReturnType<typeof rgb> },
): void {
  const line = styles.textDecorationLine || styles.textDecoration || 'none'
  if (!line || line === 'none') return

  const { x, baselineY, width, fontSize, color } = opts
  const thickness = Math.max(pxToPt(1), fontSize * 0.06)
  const draw = (y: number) => page.drawRectangle({ x, y, width, height: thickness, color })

  if (line.includes('underline')) draw(baselineY - fontSize * 0.12)
  if (line.includes('line-through')) draw(baselineY + fontSize * 0.28)
  if (line.includes('overline')) draw(baselineY + fontSize * 0.78)
}
/**
 * 检测并绘制伪元素（::before / ::after）的背景和边框
 * 限制：
 * - 只处理 display: block / inline-block 的伪元素
 * - 只绘制背景色和边框，不绘制 content 内容
 * - 需要显式设置 width 和 height（auto 高度会跳过）
 * - 支持 absolute/relative/static 定位
 */
function drawPseudoElement(ctx: RenderContext, element: HTMLElement, pseudoType: '::before' | '::after'): void {
  const styles = window.getComputedStyle(element, pseudoType)

  // 判断伪元素是否应该渲染
  const content = styles.content
  const display = styles.display
  if (!content || content === 'none' || display === 'none') return
  if (display !== 'block' && display !== 'inline-block') return

  // 读取尺寸（需要显式设置，auto 会跳过）
  const width = parseFloat(styles.width)
  const height = parseFloat(styles.height)
  if (!width || !height || isNaN(width) || isNaN(height)) return

  const rect = element.getBoundingClientRect()
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
    const elStyle = window.getComputedStyle(element)
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
function drawListMarker(ctx: RenderContext, li: HTMLElement): void {
  const styles = window.getComputedStyle(li)
  if (styles.display === 'none' || styles.visibility === 'hidden') return

  const type = styles.listStyleType
  if (type === 'none' || styles.listStyleImage !== 'none') return

  // 用 Range 取首行内容矩形（getClientRects()[0] 即首个行盒），回退到 li 边框盒
  const range = document.createRange()
  range.selectNodeContents(li)
  const rects = range.getClientRects()
  const lineRect = rects.length > 0 ? rects[0] : li.getBoundingClientRect()
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

/** 加载并嵌入 <img> 为 PDFImage（按格式选择 png/jpg） */
async function embedImageElement(ctx: RenderContext, img: HTMLImageElement): Promise<PDFImage> {
  const imageData = await loadImageAsArrayBuffer(img.src)
  const format = detectImageFormat(img.src)
  if (format === 'jpg') return ctx.pdfDoc.embedJpg(imageData)
  return ctx.pdfDoc.embedPng(imageData)
}

/**
 * 嵌入 <canvas> 为 PDFImage。优先级：
 * 1. canvasResolver（使用方显式提供高清数据）
 * 2. ECharts 自动探测（命中全局 window.echarts 实例时源头高清重绘）
 * 3. 默认栅格（直接读取 canvas backing store）
 */
async function embedCanvasElement(ctx: RenderContext, canvas: HTMLCanvasElement): Promise<PDFImage> {
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

/** 读取元素的 border-radius 并换算为 pt（无圆角返回 0） */
function getBorderRadiusPt(element: HTMLElement): number {
  const borderRadius = parseFloat(window.getComputedStyle(element).borderRadius) || 0
  return borderRadius > 0 ? pxToPt(borderRadius) : 0
}

/**
 * 将 border-box 的 box 内缩到 content-box。
 * resolveBox 用 getBoundingClientRect（border-box）定位，但 <img>/<canvas> 的位图
 * 内容只占 content-box（不含 border、padding）。若按 border-box 铺满位图，会盖住先画的边框。
 * 内缩后位图正好落在内容区，边框得以露出。圆角同步内缩半个边宽，保持与边框内缘贴合。
 */
function insetToContentBox(element: HTMLElement, box: ResolvedBox, radius: number): { box: ResolvedBox; radius: number } {
  const styles = window.getComputedStyle(element)
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
function pushRoundedRectClip(page: PDFPage, x: number, y: number, w: number, h: number, r: number): void {
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

/**
 * 渲染图片类元素（img / canvas 通用），失败时绘制统一的错误占位框。
 * radius > 0 时把图片裁成圆角矩形。
 */
async function renderImage(
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
      font: ctx.latinFont,
      color: s.textColor,
    })
  }
}
/**
 * 绘制元素背景填充（仅在有非透明背景色时绘制），表格与普通元素共用
 */
function drawElementFill(element: HTMLElement, box: ResolvedBox): void {
  const styles = window.getComputedStyle(element)
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
function drawElementBorders(element: HTMLElement, resolved: ResolvedBox): void {
  const styles = window.getComputedStyle(element)
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
