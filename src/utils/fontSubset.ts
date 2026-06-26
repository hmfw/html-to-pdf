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

        // 过滤 emoji 和不支持的符号
        // 保留中文字符（汉字、标点、符号等）
        const isEmoji = (code >= 0x1F300 && code <= 0x1F9FF) ||  // emoji 基本范围
                        (code >= 0x1F600 && code <= 0x1F64F) ||  // emoticons
                        (code >= 0x2600 && code <= 0x26FF) ||     // 其他符号
                        (code >= 0x2700 && code <= 0x27BF)        // 装饰符号

        // 保留所有字符，包括空格、中英文、标点等
        // 只排除 emoji 和特殊符号
        if (!isEmoji) {
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

  return chars
}

/**
 * 创建字体子集
 */
export async function createFontSubset(
  fontUrl: string,
  characters: Set<string>
): Promise<ArrayBuffer> {
  // 加载字体
  const fontResponse = await fetch(fontUrl)
  const fontBuffer = await fontResponse.arrayBuffer()
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
 */
export async function createFontSubsetsForElement(
  element: HTMLElement,
  fontUrls: { regular?: string; bold?: string; medium?: string }
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

  if (fontUrls.regular) {
    tasks.push(
      createFontSubset(fontUrls.regular, characters)
        .then(buffer => {
          subsets.regular = buffer
        })
        .catch(err => {
          console.warn('Regular 字体子集创建失败:', err)
        })
    )
  }

  if (fontUrls.bold) {
    tasks.push(
      createFontSubset(fontUrls.bold, characters)
        .then(buffer => {
          subsets.bold = buffer
        })
        .catch(err => {
          console.warn('Bold 字体子集创建失败:', err)
        })
    )
  }

  if (fontUrls.medium) {
    tasks.push(
      createFontSubset(fontUrls.medium, characters)
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
