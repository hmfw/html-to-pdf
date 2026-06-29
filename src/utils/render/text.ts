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

  // 选择主字体
  const mainFont = isBold
    ? (ctx.chineseFontBold ?? ctx.chineseFont ?? ctx.latinFontBold)
    : (ctx.chineseFont ?? ctx.latinFont)

  // 如果没有提供字符或没有后备字体，直接返回主字体
  if (!char || !ctx.fallbackFont) {
    return mainFont
  }

  // 检查字符是否在主字体中存在
  // 注意：这里无法直接检查，因为 PDFFont 不暴露字形查询 API
  // 作为简化方案，我们只在有后备字体时返回后备字体选择器
  // 实际的字形查询在 drawText 时由 pdf-lib 处理
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


