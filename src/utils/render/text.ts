import {
  PDFPage,
  PDFFont,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from '@pdfme/pdf-lib'
import { pxToPt, parseColor } from '../htmlParser.js'
import type { RenderContext } from './context.js'
import { findPageIndex } from './geometry.js'
import { getStyle } from './layoutCache.js'

/**
 * 根据字重选择合适的字体。
 * 中英文统一走子集化的思源黑体（子集已包含页面用到的拉丁字符），
 * 保证中英文混排时字形一致。
 */
export function selectFont(ctx: RenderContext, fontWeight: string | number): PDFFont {
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

  // 使用主字体
  const mainFont = isBold ? (ctx.chineseFontBold ?? ctx.chineseFont) : ctx.chineseFont

  return mainFont
}

/** 斜体倾斜角度（度）。项目未内嵌斜体字体，用 skew 变换模拟 oblique */
const ITALIC_SKEW_DEGREES = 12

/** 文本渲染的基础配置 */
type BaseTextOptions = {
  x: number
  y: number
  size: number
  color: ReturnType<typeof rgb>
  italic: boolean
  letterSpacing?: number
}

/** 底层绘制选项：需要已选好的字体对象 */
type DrawTextOptions = BaseTextOptions & {
  font: PDFFont
}

/** 上层渲染选项：需要字重和上下文来选择字体、处理字符映射 */
type RenderWithFallbackOptions = BaseTextOptions & {
  fontWeight: string | number
  ctx: RenderContext
}

/**
 * 渲染文本，支持字符映射（简繁转换）。
 * 当字符有映射时（如繁体字库遇到简体字），使用映射后的繁体字符。
 * 将相邻字符合并为段，减少 drawText 调用次数。
 */
function renderTextWithFallback(
  page: PDFPage,
  text: string,
  opts: RenderWithFallbackOptions,
): void {
  const { x, y, size, fontWeight, color, italic, letterSpacing, ctx } = opts
  const chars = Array.from(text) // 处理代理对

  // 根据字重选择简繁映射表
  const weight =
    typeof fontWeight === 'number'
      ? fontWeight
      : fontWeight === 'bold' || fontWeight === 'bolder'
        ? 700
        : 400
  const isBold = weight >= 600
  const charMap = isBold ? ctx.charMapBold : ctx.charMapRegular

  // 如果没有字符映射，直接绘制整段文本
  if (!charMap) {
    const font = selectFont(ctx, fontWeight)
    drawStyledText(page, text, { x, y, size, font, color, italic, letterSpacing })
    return
  }

  // 有字符映射时，逐字符处理并合并相邻字符
  let mappedText = ''

  for (const char of chars) {
    // 使用映射后的字符
    mappedText += charMap.get(char) ?? char
  }

  const font = selectFont(ctx, fontWeight)
  drawStyledText(page, mappedText, { x, y, size, font, color, italic, letterSpacing })
}

/**
 * 绘制文本，支持用 skew 变换模拟斜体，支持 letter-spacing 字符间距。
 * skew 绕坐标原点进行，故先把变换原点平移到基线 (x, y) 再倾斜，避免文字水平错位。
 *
 * @returns 返回绘制文本的总宽度（pt），包含 letter-spacing
 */
function drawStyledText(page: PDFPage, text: string, opts: DrawTextOptions): number {
  const { x, y, italic, font, size, letterSpacing, ...rest } = opts

  // 如果没有 letter-spacing 或为 0，使用原有的整段绘制逻辑
  if (!letterSpacing || letterSpacing === 0) {
    if (!italic) {
      page.drawText(text, { x, y, font, size, ...rest })
    } else {
      const tan = Math.tan((ITALIC_SKEW_DEGREES * Math.PI) / 180)
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(1, 0, 0, 1, x, y),
        concatTransformationMatrix(1, 0, tan, 1, 0, 0),
        concatTransformationMatrix(1, 0, 0, 1, -x, -y),
      )
      page.drawText(text, { x, y, font, size, ...rest })
      page.pushOperators(popGraphicsState())
    }
    return font.widthOfTextAtSize(text, size)
  }

  // 有 letter-spacing：逐字符绘制
  const chars = Array.from(text)
  let currentX = x
  const tan = italic ? Math.tan((ITALIC_SKEW_DEGREES * Math.PI) / 180) : 0

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]
    const charWidth = font.widthOfTextAtSize(char, size)

    if (!italic) {
      page.drawText(char, { x: currentX, y, font, size, ...rest })
    } else {
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(1, 0, 0, 1, currentX, y),
        concatTransformationMatrix(1, 0, tan, 1, 0, 0),
        concatTransformationMatrix(1, 0, 0, 1, -currentX, -y),
      )
      page.drawText(char, { x: currentX, y, font, size, ...rest })
      page.pushOperators(popGraphicsState())
    }

    // 字符宽度 + letter-spacing（最后一个字符后不加间距）
    currentX += charWidth
    if (i < chars.length - 1) {
      currentX += letterSpacing
    }
  }

  return currentX - x
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
export function baselineFromTop(font: PDFFont, fontSize: number, lineBoxPt: number): number {
  const ascent = font.heightAtSize(fontSize, { descender: false })
  const fullHeight = font.heightAtSize(fontSize) // 含 descender
  const halfLeading = (lineBoxPt - fullHeight) / 2
  return halfLeading + ascent
}

/** 单个可视行的测量结果：文本内容 + 该行在视口中的矩形 */
type MeasuredLine = { text: string; left: number; top: number; width: number; height: number }

/** 文本样式集合 */
type TextStyles = {
  fontSize: number // pt
  fontWeight: string
  color: ReturnType<typeof parseColor>
  italic: boolean
  letterSpacing: number // pt
  textAlign: string
}

/**
 * 从元素收集文本渲染所需的样式
 */
function collectTextStyles(styles: CSSStyleDeclaration): TextStyles {
  const fontSize = pxToPt(parseFloat(styles.fontSize))
  const fontWeight = styles.fontWeight
  const color = parseColor(styles.color)
  const italic = styles.fontStyle === 'italic' || styles.fontStyle.startsWith('oblique')

  const letterSpacingPx = styles.letterSpacing
  const letterSpacing =
    letterSpacingPx && letterSpacingPx !== 'normal' ? pxToPt(parseFloat(letterSpacingPx)) : 0

  const textAlign = styles.textAlign || 'left'

  return { fontSize, fontWeight, color, italic, letterSpacing, textAlign }
}

/**
 * 检查元素是否在 <pre> 标签内
 */
function isInPreformatted(element: HTMLElement): boolean {
  let current = element as HTMLElement | null
  while (current) {
    if (current.tagName === 'PRE') {
      return true
    }
    current = current.parentElement
  }
  return false
}

/**
 * 计算文本对齐后的 X 坐标
 */
function calculateAlignedX(
  textAlign: string,
  lineLeft: number,
  lineWidth: number,
  containerLeft: number,
  parentElement: HTMLElement,
): number {
  let x = pxToPt(lineLeft - containerLeft)

  if (textAlign === 'center') {
    const parentRect = parentElement.getBoundingClientRect()
    const styles = window.getComputedStyle(parentElement)
    const paddingLeft = parseFloat(styles.paddingLeft) || 0
    const paddingRight = parseFloat(styles.paddingRight) || 0

    const parentWidth = pxToPt(parentRect.width)
    const textWidth = pxToPt(lineWidth)
    const parentX = pxToPt(parentRect.left - containerLeft)
    const paddingLeftPt = pxToPt(paddingLeft)
    const paddingRightPt = pxToPt(paddingRight)

    // 在 content-box 内居中（减去左右 padding）
    const contentWidth = parentWidth - paddingLeftPt - paddingRightPt
    x = parentX + paddingLeftPt + (contentWidth - textWidth) / 2
  } else if (textAlign === 'right') {
    const parentRect = parentElement.getBoundingClientRect()
    const styles = window.getComputedStyle(parentElement)
    const paddingRight = parseFloat(styles.paddingRight) || 0

    const parentWidth = pxToPt(parentRect.width)
    const textWidth = pxToPt(lineWidth)
    const parentX = pxToPt(parentRect.left - containerLeft)
    const paddingRightPt = pxToPt(paddingRight)

    // 右对齐时减去右侧 padding
    x = parentX + parentWidth - textWidth - paddingRightPt
  }

  return x
}

/**
 * 渲染单行文本（支持字符映射和装饰线）
 */
function renderSingleLine(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  textStyles: TextStyles,
  ctx: RenderContext,
  styles: CSSStyleDeclaration,
  lineWidth: number,
): void {
  const { fontSize, fontWeight, color, italic, letterSpacing } = textStyles
  const needsCharMapping = !!(ctx.charMapRegular || ctx.charMapBold)
  const defaultFont = selectFont(ctx, fontWeight)

  try {
    if (needsCharMapping) {
      renderTextWithFallback(page, text, {
        x,
        y,
        size: fontSize,
        fontWeight,
        color: rgb(color.r, color.g, color.b),
        italic,
        letterSpacing,
        ctx,
      })
    } else {
      drawStyledText(page, text, {
        x,
        y,
        size: fontSize,
        font: defaultFont,
        color: rgb(color.r, color.g, color.b),
        italic,
        letterSpacing,
      })
    }

    // 绘制文字装饰线
    drawTextDecoration(page, styles, {
      x,
      baselineY: y,
      width: pxToPt(lineWidth),
      fontSize,
      color: rgb(color.r, color.g, color.b),
    })
  } catch (error) {
    console.warn('Failed to draw text:', text, error)
  }
}

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
    const trimmed = t.trim()
    if (trimmed) {
      // 计算前导空格占用的宽度，调整 left 坐标
      const leadingSpaces = t.length - t.trimStart().length
      let adjustedLeft = rect.left

      // 如果有前导空格，用 Range 测量它们的宽度并调整起始坐标
      if (leadingSpaces > 0) {
        range.setStart(textNode, startOff)
        range.setEnd(textNode, startOff + leadingSpaces)
        const spacesRect = range.getBoundingClientRect()
        adjustedLeft += spacesRect.width
      }

      lines.push({
        text: trimmed,
        left: adjustedLeft,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      })
    }
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
 * 渲染预格式化文本（<pre> 标签内的多行文本）
 */
function renderPreformattedText(
  ctx: RenderContext,
  textNode: Text,
  page: PDFPage,
  pageRect: DOMRect,
  rect: DOMRect,
  textStyles: TextStyles,
  styles: CSSStyleDeclaration,
): void {
  const lines = textNode.textContent!.split('\n')
  const { fontSize, fontWeight } = textStyles
  const lineHeight = resolveLineHeight(styles, fontSize)
  const defaultFont = selectFont(ctx, fontWeight)
  const firstBaseline = baselineFromTop(defaultFont, fontSize, lineHeight)

  lines.forEach((line, index) => {
    if (!line.trim()) return

    const lineY =
      ctx.pageHeight - pxToPt(rect.top - pageRect.top) - firstBaseline - index * lineHeight
    const x = pxToPt(rect.left - ctx.containerRect.left)

    renderSingleLine(page, line, x, lineY, textStyles, ctx, styles, rect.width)
  })
}

/**
 * 渲染普通文本（基于 Range 精确测量的多行文本）
 */
function renderNormalText(
  ctx: RenderContext,
  textNode: Text,
  page: PDFPage,
  pageRect: DOMRect,
  parentElement: HTMLElement,
  textStyles: TextStyles,
  styles: CSSStyleDeclaration,
): void {
  const lines = measureVisualLines(textNode)
  const { fontSize, fontWeight, textAlign } = textStyles
  const defaultFont = selectFont(ctx, fontWeight)

  for (const line of lines) {
    const x = calculateAlignedX(
      textAlign,
      line.left,
      line.width,
      ctx.containerRect.left,
      parentElement,
    )

    const baselineY =
      ctx.pageHeight -
      pxToPt(line.top - pageRect.top) -
      baselineFromTop(defaultFont, fontSize, pxToPt(line.height))

    renderSingleLine(page, line.text, x, baselineY, textStyles, ctx, styles, line.width)
  }
}

/**
 * 渲染文本节点（基于 Range 精确定位）
 *
 * 如果存在字符映射（简繁转换），会逐字符渲染并应用映射。
 */
export function renderTextNode(
  ctx: RenderContext,
  textNode: Text,
  parentElement: HTMLElement,
): void {
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

  const styles = getStyle(ctx.layoutCache, parentElement)
  const textStyles = collectTextStyles(styles)

  // 根据是否在 <pre> 内分别处理
  if (isInPreformatted(parentElement) && text.includes('\n')) {
    renderPreformattedText(ctx, textNode, page, pageRect, rect, textStyles, styles)
  } else {
    renderNormalText(ctx, textNode, page, pageRect, parentElement, textStyles, styles)
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
  opts: {
    x: number
    baselineY: number
    width: number
    fontSize: number
    color: ReturnType<typeof rgb>
  },
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
