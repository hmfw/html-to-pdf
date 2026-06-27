import * as opentype from 'opentype.js'

/**
 * 扫描 HTML 元素，提取所有使用的字符
 */
export function extractUsedCharacters(element: HTMLElement): Set<string> {
  const chars = new Set<string>()

  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''

      // 跳过纯空白的文本节点（只有换行符、缩进等）
      if (!text.trim()) return

      for (const char of text) {
        // 用 codePointAt 而非 charCodeAt：emoji 多在星空平面（U+1F300+），
        // charCodeAt(0) 只取高代理项（0xD83D 等），会漏判而无法过滤。
        const code = char.codePointAt(0) ?? 0

        // 过滤彩色 emoji（多在星空平面 U+1F000+，需彩色字体，PDF 嵌入会失败）。
        // 保留 BMP 常见符号（★☎✓©®™ 等 U+2000–U+2FFF），中文字体通常支持。
        const isColorEmoji =
          (code >= 0x1F300 && code <= 0x1F9FF) || // Misc Symbols and Pictographs / Emoticons / etc.
          (code >= 0x1F000 && code <= 0x1F02F) || // Mahjong/Domino Tiles
          (code >= 0x1FA00 && code <= 0x1FAFF) || // Extended-A (chess, symbols)
          (code >= 0xFE00 && code <= 0xFE0F) // Variation Selectors (emoji vs text presentation)

        // 保留所有字符，包括空格、中英文、标点等
        // 只排除彩色 emoji
        if (!isColorEmoji) {
          chars.add(char)
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (const child of node.childNodes) {
        traverse(child)
      }
    }
  }

  traverse(element)

  // 列表项的有序 marker（"1." "2." …）不是 DOM 文本节点，需额外纳入子集，
  // 否则导出时数字/点会因缺字形而绘制失败。圆点/方块 marker 用图形绘制，无需字形。
  const hasOrderedList =
    element.tagName === 'OL' ||
    element.tagName === 'LI' ||
    !!element.querySelector?.('ol, li')
  if (hasOrderedList) {
    for (const ch of '0123456789.') chars.add(ch)
  }

  return chars
}

/**
 * 创建字体子集
 *
 * @param fontBuffer 已加载的完整字体 ArrayBuffer（加载/降级逻辑见 fontLoader）
 * @param characters 需要保留的字符集合
 */
export async function createFontSubset(
  fontBuffer: ArrayBuffer,
  characters: Set<string>
): Promise<ArrayBuffer> {
  const font = opentype.parse(fontBuffer) as any

  // 获取字体元信息
  const familyName = font.names?.fontFamily?.en || font.names?.fullName?.en || 'Source Han Sans SC'
  const styleName = font.names?.fontSubfamily?.en || 'Regular'

  // 获取需要的字形 ID（始终包含 .notdef = glyph 0）
  const glyphIds = new Set<number>()
  glyphIds.add(0)

  for (const char of characters) {
    const glyph = font.charToGlyph(char)
    if (glyph && glyph.index !== undefined) {
      glyphIds.add(glyph.index)
    }
  }

  // 创建子集字体
  const glyphIdsArray = Array.from(glyphIds).sort((a, b) => a - b)
  const glyphs = glyphIdsArray.map((id: number) => font.glyphs.get(id))

  const subsetFont = new (opentype as any).Font({
    familyName,
    styleName,
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphs
  })

  return subsetFont.toArrayBuffer()
}

/**
 * 为 HTML 元素创建字体子集映射
 *
 * @param element 待扫描的元素
 * @param fontBuffers 各字重已加载的完整字体 ArrayBuffer（加载/降级见 fontLoader）
 */
export async function createFontSubsetsForElement(
  element: HTMLElement,
  fontBuffers: { regular?: ArrayBuffer; bold?: ArrayBuffer; medium?: ArrayBuffer }
): Promise<{
  regular?: ArrayBuffer
  bold?: ArrayBuffer
  medium?: ArrayBuffer
}> {
  const characters = extractUsedCharacters(element)

  const subsets: {
    regular?: ArrayBuffer
    bold?: ArrayBuffer
    medium?: ArrayBuffer
  } = {}

  // 并行创建所有字体子集
  const tasks: Promise<void>[] = []

  if (fontBuffers.regular) {
    tasks.push(
      createFontSubset(fontBuffers.regular, characters)
        .then(buffer => {
          subsets.regular = buffer
        })
        .catch(err => {
          console.warn('Regular 字体子集创建失败:', err)
        })
    )
  }

  if (fontBuffers.bold) {
    tasks.push(
      createFontSubset(fontBuffers.bold, characters)
        .then(buffer => {
          subsets.bold = buffer
        })
        .catch(err => {
          console.warn('Bold 字体子集创建失败:', err)
        })
    )
  }

  if (fontBuffers.medium) {
    tasks.push(
      createFontSubset(fontBuffers.medium, characters)
        .then(buffer => {
          subsets.medium = buffer
        })
        .catch(err => {
          console.warn('Medium 字体子集创建失败:', err)
        })
    )
  }

  await Promise.all(tasks)

  return subsets
}
