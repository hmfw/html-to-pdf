import {
  PDFPage,
  PDFFont,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from '@pdfme/pdf-lib'
import { pxToPt, parseColor } from '../htmlParser.js'
import { mathAutoTransform } from '../mathTransform.js'
import type { RenderContext } from './context.js'
import { findPageIndex } from './geometry.js'
import { getStyle } from './layoutCache.js'

/** CSS 通用字体族关键字：命中即回退到默认字体（default） */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
])

/**
 * 解析字重字符串/数字，判断是否按粗体渲染。
 * 600 及以上（Semi-bold、Bold、Extra-bold、Black）视为粗体：库通常只有
 * Regular / Bold 两个字重，600+ 视觉上更接近粗体。
 */
function isBoldWeight(fontWeight: string | number): boolean {
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
  return weight >= 600
}

/**
 * 判断字符是否为 CJK（含汉字、假名、韩文、CJK 标点与全角字符）。
 * 用于 text-align: justify 的两端对齐：CJK 文本靠「字间」拉伸，
 * 拉丁文本靠「词间（空格）」拉伸，需按字符类型区分平摊。
 */
function isCjkChar(char: string): boolean {
  const cp = char.codePointAt(0)
  if (cp === undefined) return false
  return (
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 标点
    (cp >= 0x3040 && cp <= 0x30ff) || // 平假名 / 片假名
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 基本区
    (cp >= 0xac00 && cp <= 0xd7af) || // 韩文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意
    (cp >= 0xff00 && cp <= 0xffef) || // 全角字符
    (cp >= 0x20000 && cp <= 0x2ffff) //  CJK 扩展 B 及以上
  )
}

/**
 * 判断某字符处是否为两端对齐的「拉伸机会」：空格（词间）或 CJK 字符（字间）。
 * 拉丁词内字母之间不拉伸，故仅空格与 CJK 字符后追加额外前进量。
 */
function isJustifyOpportunity(char: string): boolean {
  return char === ' ' || isCjkChar(char)
}

/**
 * 把元素计算样式的 `font-family` 候选链解析为 fonts 注册表中的 key 列表（有序、去重）。
 * - 具体字体名（去引号、忽略大小写）命中注册表则加入；
 * - 通用族（serif / sans-serif / monospace 等）→ 默认字体 key；
 * - 未注册的具体字体名忽略（靠 default + 逐字形回退兜底）。
 * 末尾始终追加默认字体 key，保证兜底。
 */
function resolveFamilyKeys(ctx: RenderContext, cssFontFamily?: string): string[] {
  const keys: string[] = []
  const push = (k: string) => {
    if (k && !keys.includes(k)) keys.push(k)
  }

  if (cssFontFamily) {
    for (const raw of cssFontFamily.split(',')) {
      const name = raw
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .trim()
        .toLowerCase()
      if (!name) continue
      if (GENERIC_FAMILIES.has(name)) {
        push(ctx.defaultFontKey)
      } else if (ctx.fonts.has(name)) {
        push(name)
      }
    }
  }

  push(ctx.defaultFontKey)
  return keys
}

/**
 * 为一段文本选择「主字体」：按 `font-family` 候选链选第一个命中的注册字体，
 * 取其 Regular / Bold 字重。用于单行文本的基线/宽度估算与无需逐字形回退时的整段绘制。
 */
export function selectFont(
  ctx: RenderContext,
  fontFamily: string | undefined,
  fontWeight: string | number,
): PDFFont {
  const isBold = isBoldWeight(fontWeight)
  const keys = resolveFamilyKeys(ctx, fontFamily)

  for (const key of keys) {
    const fam = ctx.fonts.get(key)
    if (!fam) continue
    return isBold ? (fam.bold ?? fam.regular) : fam.regular
  }

  const def = ctx.fonts.get(ctx.defaultFontKey)!
  return isBold ? (def.bold ?? def.regular) : def.regular
}

/**
 * 为单个字符选择字体并解析实际渲染字符（应用简繁映射）。
 *
 * 先按 font-family 候选链（preferredKeys）查找覆盖该字符的字体，未命中再扫描
 * 其它已注册字体做**逐字形回退**（镜像浏览器 per-glyph fallback）。全部缺失时
 * 用默认字体绘制（显示为方块）。coverage 集含 OpenCC 转换后可渲染的原字符，
 * 故用原字符判断覆盖，再经该字体的 charMap 得到实际字形字符。
 */
function resolveCharFont(
  ctx: RenderContext,
  preferredKeys: string[],
  char: string,
  isBold: boolean,
): { font: PDFFont; mappedChar: string } {
  const tryKey = (key: string): { font: PDFFont; mappedChar: string } | null => {
    const fam = ctx.fonts.get(key)
    if (!fam) return null
    const useBold = isBold && !!fam.bold
    const covered = useBold ? fam.coveredBold : fam.coveredRegular
    if (covered && covered.has(char)) {
      const charMap = useBold ? fam.charMapBold : fam.charMapRegular
      return { font: useBold ? fam.bold! : fam.regular, mappedChar: charMap?.get(char) ?? char }
    }
    return null
  }

  for (const key of preferredKeys) {
    const r = tryKey(key)
    if (r) return r
  }
  // 逐字形回退：扫描 preferredKeys 之外的其它已注册字体
  for (const key of ctx.fontKeys) {
    if (preferredKeys.includes(key)) continue
    const r = tryKey(key)
    if (r) return r
  }

  // 无任一字体覆盖：用默认字体绘制（显示为方块）
  const def = ctx.fonts.get(ctx.defaultFontKey)!
  const useBold = isBold && !!def.bold
  return { font: useBold ? def.bold! : def.regular, mappedChar: char }
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
  /**
   * 两端对齐（text-align: justify）时每个「拉伸机会」处追加的额外前进量（pt）。
   * 拉丁文本在空格后追加（词间），CJK 文本在每个 CJK 字符后追加（字间），
   * 由 isJustifyOpportunity 判定；用于还原浏览器的两端对齐效果。
   */
  justifySpacing?: number
}

/** 底层绘制选项：需要已选好的字体对象 */
type DrawTextOptions = BaseTextOptions & {
  font: PDFFont
}

/** 上层渲染选项：需要 font-family、字重和上下文来选择字体、处理字符映射与逐字形回退 */
type RenderWithFallbackOptions = BaseTextOptions & {
  fontFamily?: string
  fontWeight: string | number
  ctx: RenderContext
}

/**
 * 逐字符渲染文本，支持 font-family 选字体、简繁映射与逐字形回退。
 * 每个字符按 resolveCharFont 选定字体与实际字形字符，再把相邻使用相同字体的字符
 * 合并为段，减少 drawText 调用次数。
 */
function renderTextWithFallback(
  page: PDFPage,
  text: string,
  opts: RenderWithFallbackOptions,
): void {
  const { x, y, size, fontFamily, fontWeight, color, italic, letterSpacing, justifySpacing, ctx } =
    opts
  const chars = Array.from(text) // 处理代理对
  const isBold = isBoldWeight(fontWeight)
  const preferredKeys = resolveFamilyKeys(ctx, fontFamily)

  // 构建字符→字体的映射，合并相邻同字体字符为段
  type CharSegment = { text: string; font: PDFFont }
  const segments: CharSegment[] = []
  let currentText = ''
  let currentFont: PDFFont | null = null

  for (const char of chars) {
    const { font, mappedChar } = resolveCharFont(ctx, preferredKeys, char, isBold)

    if (currentFont && currentFont !== font) {
      segments.push({ text: currentText, font: currentFont })
      currentText = mappedChar
      currentFont = font
    } else {
      currentText += mappedChar
      currentFont = font
    }
  }

  // 输出最后一段
  if (currentText && currentFont) {
    segments.push({ text: currentText, font: currentFont })
  }

  // 绘制所有段
  let currentX = x
  for (const segment of segments) {
    const width = drawStyledText(page, segment.text, {
      x: currentX,
      y,
      size,
      font: segment.font,
      color,
      italic,
      letterSpacing,
      justifySpacing,
    })
    currentX += width
  }
}

/**
 * 绘制文本，支持用 skew 变换模拟斜体，支持 letter-spacing 字符间距。
 * skew 绕坐标原点进行，故先把变换原点平移到基线 (x, y) 再倾斜，避免文字水平错位。
 *
 * @returns 返回绘制文本的总宽度（pt），包含 letter-spacing
 */
/**
 * 绘制文本，支持用 skew 变换模拟斜体，支持 letter-spacing 字符间距与两端对齐拉伸。
 * skew 绕坐标原点进行，故先把变换原点平移到基线 (x, y) 再倾斜，避免文字水平错位。
 *
 * @returns 返回绘制文本的总宽度（pt），包含 letter-spacing 与 justify 拉伸量
 */
function drawStyledText(page: PDFPage, text: string, opts: DrawTextOptions): number {
  const { x, y, italic, font, size, letterSpacing, justifySpacing, ...rest } = opts

  // 无字符间距 / 两端对齐拉伸时，走原有的整段绘制逻辑
  if ((!letterSpacing || letterSpacing === 0) && (!justifySpacing || justifySpacing === 0)) {
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

  // 有字符间距或两端对齐拉伸：逐字符绘制
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

    // 字符宽度 + letter-spacing（最后一个字符后不加间距）；
    // 两端对齐时在每个「拉伸机会」（空格或 CJK 字符）后追加 justifySpacing
    currentX += charWidth
    if (i < chars.length - 1) {
      if (letterSpacing) currentX += letterSpacing
    }
    if (justifySpacing && isJustifyOpportunity(char)) currentX += justifySpacing
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
  fontFamily: string // CSS font-family 候选链（用于选字体）
  fontWeight: string
  color: ReturnType<typeof parseColor>
  italic: boolean
  letterSpacing: number // pt
  textAlign: string
  textTransform: string // 'math-auto' 时把单字符标识符转数学斜体
}

/**
 * 从元素收集文本渲染所需的样式
 */
function collectTextStyles(styles: CSSStyleDeclaration): TextStyles {
  const fontSize = pxToPt(parseFloat(styles.fontSize))
  const fontFamily = styles.fontFamily
  const fontWeight = styles.fontWeight
  const color = parseColor(styles.color)
  const italic = styles.fontStyle === 'italic' || styles.fontStyle.startsWith('oblique')

  const letterSpacingPx = styles.letterSpacing
  const letterSpacing =
    letterSpacingPx && letterSpacingPx !== 'normal' ? pxToPt(parseFloat(letterSpacingPx)) : 0

  const textAlign = styles.textAlign || 'left'
  const textTransform = styles.textTransform || 'none'

  return { fontSize, fontFamily, fontWeight, color, italic, letterSpacing, textAlign, textTransform }
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
 * 渲染单行文本（支持字符映射和逐字形回退）
 */
function renderSingleLine(
  page: PDFPage,
  rawText: string,
  x: number,
  y: number,
  textStyles: TextStyles,
  ctx: RenderContext,
  styles: CSSStyleDeclaration,
  lineWidth: number,
): void {
  const { fontSize, fontFamily, fontWeight, color, italic, letterSpacing, textAlign, textTransform } =
    textStyles
  // 复刻 text-transform: math-auto（单字符标识符转数学斜体，如 X→𝑋）。
  // 浏览器已按转换后字形排版，故只改「我们实际绘制的字符」，行位置仍用实测值。
  const text = textTransform === 'math-auto' ? mathAutoTransform(rawText) : rawText
  // 存在字符映射或注册了多个字体家族时，需逐字符选字体/映射（逐字形回退）
  const needsFallback = ctx.hasCharMap || ctx.fonts.size > 1
  const defaultFont = selectFont(ctx, fontFamily, fontWeight)

  // 还原 text-align: justify 的两端对齐：浏览器把行内空白/字间拉伸以撑满整行，
  // 而我们按字体自然字距绘制会偏窄，导致行内元素（如 <math>）前出现空白。
  // 用「实测行宽 − 自然绘制宽度」的差值平摊到各「拉伸机会」上来补齐：
  // 拉丁文本按空格（词间）、CJK 文本按字符（字间），由 isJustifyOpportunity 判定。
  let justifySpacing = 0
  if (textAlign === 'justify') {
    const chars = Array.from(text)
    // 拉伸机会数：除最后一个字符外，所有空格 / CJK 字符（行尾不再拉伸）
    let opportunities = 0
    for (let i = 0; i < chars.length - 1; i++) {
      if (isJustifyOpportunity(chars[i])) opportunities++
    }
    if (opportunities > 0) {
      const naturalWidthPt =
        defaultFont.widthOfTextAtSize(text, fontSize) +
        (letterSpacing || 0) * Math.max(0, chars.length - 1)
      const extra = pxToPt(lineWidth) - naturalWidthPt
      if (extra > 0) justifySpacing = extra / opportunities
    }
  }

  try {
    if (needsFallback) {
      renderTextWithFallback(page, text, {
        x,
        y,
        size: fontSize,
        fontFamily,
        fontWeight,
        color: rgb(color.r, color.g, color.b),
        italic,
        letterSpacing,
        justifySpacing,
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
        justifySpacing,
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
      // 用去除首尾空白后的子区间测量 left / width：
      // 排除首尾空格，wordSpacing 平摊才准确；两端对齐块的最后一行天然偏窄，
      // 用实测 trimmed 宽度可自动令其 extra≤0（不再拉伸），与浏览器一致。
      const leadingSpaces = t.length - t.trimStart().length
      const trailingSpaces = t.length - t.trimEnd().length
      range.setStart(textNode, startOff + leadingSpaces)
      range.setEnd(textNode, endOff - trailingSpaces)
      const trimmedRect = range.getBoundingClientRect()

      lines.push({
        text: trimmed,
        left: trimmedRect.left,
        top: rect.top,
        width: trimmedRect.width,
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
  const { fontSize, fontFamily, fontWeight } = textStyles
  const lineHeight = resolveLineHeight(styles, fontSize)
  const defaultFont = selectFont(ctx, fontFamily, fontWeight)
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
  const { fontSize, fontFamily, fontWeight, textAlign } = textStyles
  const defaultFont = selectFont(ctx, fontFamily, fontWeight)

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
