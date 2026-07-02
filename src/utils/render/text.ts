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
 * 保证中英文混排时字形一致；仅在子集字体缺失时回退到内置 Helvetica。
 *
 * 如果提供了后备字体（fallbackFont），会根据字符是否在主字体中存在来选择字体。
 */
export function selectFont(ctx: RenderContext, fontWeight: string | number, char?: string): PDFFont {
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

  // 如果提供了字符且该字符在缺失列表中，使用后备字体
  if (char && ctx.missingChars?.has(char)) {
    const fallback = isBold
      ? (ctx.fallbackFontBold ?? ctx.fallbackFont)
      : ctx.fallbackFont

    // 如果后备字体存在，使用后备字体；否则降级到主字体（会显示为方块）
    if (fallback) {
      return fallback
    }
  }

  // 使用主字体
  const mainFont = isBold
    ? (ctx.chineseFontBold ?? ctx.chineseFont ?? ctx.latinFontBold)
    : (ctx.chineseFont ?? ctx.latinFont)

  return mainFont
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
  letterSpacing?: number
}

type RenderWithFallbackOptions = {
  x: number
  y: number
  size: number
  fontWeight: string | number
  color: ReturnType<typeof rgb>
  italic: boolean
  lineHeight?: number
  letterSpacing?: number
  ctx: RenderContext
}

/**
 * 渲染文本，根据每个字符是否在主字体中存在，动态选择主字体或后备字体。
 * 支持简繁转换：当字符有映射时（繁体字库遇到简体字），使用映射后的繁体字符。
 * 将相邻使用相同字体的字符合并为段，减少 drawText 调用次数。
 */
function renderTextWithFallback(page: PDFPage, text: string, opts: RenderWithFallbackOptions): void {
  const { x, y, size, fontWeight, color, italic, letterSpacing, ctx } = opts
  const chars = Array.from(text) // 处理代理对
  let currentX = x
  let segmentText = ''
  let segmentFont: PDFFont | null = null

  // 根据字重选择简繁映射表
  const weight = typeof fontWeight === 'number' ? fontWeight : (fontWeight === 'bold' || fontWeight === 'bolder' ? 700 : 400)
  const isBold = weight >= 600
  const charMap = isBold ? ctx.charMapBold : ctx.charMapRegular

  const flushSegment = () => {
    if (segmentText && segmentFont) {
      const drawnWidth = drawStyledText(page, segmentText, {
        x: currentX,
        y,
        size,
        font: segmentFont,
        color,
        italic,
        letterSpacing,
      })
      // 使用 drawStyledText 返回的实际宽度（已包含 letterSpacing）
      currentX += drawnWidth
      segmentText = ''
    }
  }

  for (const char of chars) {
    // 如果有简繁映射，使用映射后的繁体字符
    const actualChar = charMap?.get(char) ?? char

    // 调试：如果发生了映射，打印一次（仅第一个字符）
    if (actualChar !== char && chars.indexOf(char) === 0) {
      console.debug(`[html-to-pdf] 字符映射示例: '${char}' → '${actualChar}'`)
    }

    const font = selectFont(ctx, fontWeight, char)

    // 如果字体改变，先绘制当前段，再开始新段
    if (segmentFont && font !== segmentFont) {
      flushSegment()
    }

    segmentFont = font
    segmentText += actualChar  // 使用映射后的字符
  }

  // 绘制最后一段
  flushSegment()
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

// PLACEHOLDER_TEXT_REST

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
        height: rect.height
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
 * 渲染文本节点（基于 Range 精确定位）
 *
 * 如果存在后备字体且有缺失字符，会将文本拆分为不同字体段分别渲染。
 */
export function renderTextNode(ctx: RenderContext, textNode: Text, parentElement: HTMLElement): void {
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
  const fontSize = pxToPt(parseFloat(styles.fontSize)) // px → pt
  const fontWeight = styles.fontWeight
  const color = parseColor(styles.color)
  // italic / oblique 都按斜体处理
  const italic = styles.fontStyle === 'italic' || styles.fontStyle.startsWith('oblique')

  // 解析 letter-spacing（px → pt）
  const letterSpacingPx = styles.letterSpacing
  const letterSpacing = letterSpacingPx && letterSpacingPx !== 'normal'
    ? pxToPt(parseFloat(letterSpacingPx))
    : 0

  // 检查是否需要使用后备字体（有缺失字符且后备字体存在）
  const needsFallback = !!(ctx.missingChars && ctx.missingChars.size > 0 && ctx.fallbackFont)

  // 检查是否需要字符映射（简繁转换）
  const needsCharMapping = !!(ctx.charMapRegular || ctx.charMapBold)

  // 如果需要后备字体或字符映射，使用逐字符渲染
  const needsCharByCharRendering = needsFallback || needsCharMapping

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
    const defaultFont = selectFont(ctx, fontWeight)
    // 每行行盒高度即 lineHeight，基线据此居中定位
    const firstBaseline = baselineFromTop(defaultFont, fontSize, lineHeight)

    lines.forEach((line, index) => {
      if (!line.trim()) return // 跳过空行

      // 基线 = 边界框顶部 + 首行基线偏移 + 当前行偏移
      const lineY = ctx.pageHeight - pxToPt(rect.top - pageRect.top) - firstBaseline - index * lineHeight

      try {
        if (needsCharByCharRendering) {
          // 需要后备字体或字符映射：逐字符渲染
          renderTextWithFallback(page, line, {
            x: pxToPt(rect.left - ctx.containerRect.left),
            y: lineY,
            size: fontSize,
            fontWeight,
            color: rgb(color.r, color.g, color.b),
            italic,
            lineHeight,
            letterSpacing,
            ctx,
          })
        } else {
          // 不需要后备字体：整行渲染
          drawStyledText(page, line, {
            x: pxToPt(rect.left - ctx.containerRect.left),
            y: lineY,
            size: fontSize,
            font: defaultFont,
            color: rgb(color.r, color.g, color.b),
            italic,
            lineHeight,
            letterSpacing,
          })
        }
      } catch (error) {
        console.warn('Failed to draw text line:', line, error)
      }
    })
  } else {
    // 普通文本：用 Range 逐行测量，复刻浏览器换行点后逐行绘制，
    // 不再交给 pdf-lib 自动换行（其宽度估算会导致中英文混排时换行点偏差、右侧溢出）。
    const lines = measureVisualLines(textNode)
    const lineHeight = resolveLineHeight(styles, fontSize)
    const defaultFont = selectFont(ctx, fontWeight)

    // 读取 text-align 属性以处理居中对齐
    const textAlign = styles.textAlign || 'left'

    for (const line of lines) {
      let x = pxToPt(line.left - ctx.containerRect.left)

      // 如果是居中对齐，需要调整 x 坐标
      if (textAlign === 'center') {
        // 获取父元素的宽度
        const parentRect = parentElement.getBoundingClientRect()
        const parentWidth = pxToPt(parentRect.width)
        const textWidth = pxToPt(line.width)

        // 计算居中后的起始位置
        const parentX = pxToPt(parentRect.left - ctx.containerRect.left)
        x = parentX + (parentWidth - textWidth) / 2
      } else if (textAlign === 'right') {
        // 右对齐
        const parentRect = parentElement.getBoundingClientRect()
        const parentWidth = pxToPt(parentRect.width)
        const textWidth = pxToPt(line.width)
        const parentX = pxToPt(parentRect.left - ctx.containerRect.left)
        x = parentX + parentWidth - textWidth
      }

      // 每行用自身实测行盒高度定位基线，首行不再被整段高度顶到中部
      const baselineY =
        ctx.pageHeight - pxToPt(line.top - pageRect.top) - baselineFromTop(defaultFont, fontSize, pxToPt(line.height))
      try {
        if (needsCharByCharRendering) {
          // 需要后备字体或字符映射：逐字符渲染
          renderTextWithFallback(page, line.text, {
            x,
            y: baselineY,
            size: fontSize,
            fontWeight,
            color: rgb(color.r, color.g, color.b),
            italic,
            lineHeight,
            letterSpacing,
            ctx,
          })
        } else {
          // 不需要后备字体：整行渲染
          drawStyledText(page, line.text, {
            x,
            y: baselineY,
            size: fontSize,
            font: defaultFont,
            color: rgb(color.r, color.g, color.b),
            italic,
            lineHeight,
            letterSpacing,
          })
        }
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


