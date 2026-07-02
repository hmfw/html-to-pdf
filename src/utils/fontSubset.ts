import * as opentype from 'opentype.js'
import { convertCharacters, type OpenCCConfig } from './textConverter'

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

        // 过滤控制字符（包括换行符、制表符等，U+0000-U+001F 和 U+007F-U+009F）
        if (code <= 0x1F || (code >= 0x7F && code <= 0x9F)) {
          continue
        }

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
 * @param warnMissing 是否对缺失字符输出警告（主字体为 true）
 * @param conversionConfig OpenCC 转换配置（如 { from: 'cn', to: 'hk' }），undefined 表示不转换
 * @returns 子集字体 ArrayBuffer 和字符映射表（原始→转换后）
 */
export async function createFontSubset(
  fontBuffer: ArrayBuffer,
  characters: Set<string>,
  warnMissing: boolean = true,
  conversionConfig?: OpenCCConfig
): Promise<{
  buffer: ArrayBuffer
  charMap?: Map<string, string>  // 原始字符→转换后字符映射
}> {
  const font = opentype.parse(fontBuffer) as any

  // 获取字体元信息
  const familyName = font.names?.fontFamily?.en || font.names?.fullName?.en || 'Source Han Sans SC'
  const styleName = font.names?.fontSubfamily?.en || 'Regular'

  // 获取需要的字形 ID（始终包含 .notdef = glyph 0）
  const glyphIds = new Set<number>()
  glyphIds.add(0)

  const convertFailedChars: string[] = []  // 转换失败的字符（用于警告）
  const charMap = new Map<string, string>()  // 原始字符→转换后字符映射

  for (const char of characters) {
    const glyph = font.charToGlyph(char)
    if (glyph && glyph.index !== undefined && glyph.index !== 0) {
      // glyph.index = 0 表示映射到 .notdef，即字体中不存在该字符
      glyphIds.add(glyph.index)
    } else if (!glyph || glyph.index === 0) {
      // 字符在字体中不存在，尝试转换
      let resolved = false
      let hasConversion = false  // 是否发生了转换（转换后与原字符不同）

      if (conversionConfig) {
        const convertedChars = convertCharacters(new Set([char]), conversionConfig)

        // 尝试转换后的字符
        for (const cChar of convertedChars) {
          if (cChar !== char) {  // 转换后有变化
            hasConversion = true
            const cGlyph = font.charToGlyph(cChar)
            if (cGlyph && cGlyph.index !== undefined && cGlyph.index !== 0) {
              // 转换后字符存在，使用转换后字形并记录映射
              glyphIds.add(cGlyph.index)
              charMap.set(char, cChar)
              resolved = true
              break
            }
          }
        }
      }

      // 如果转换未解决，记录为转换失败（用于警告）
      if (!resolved) {
        // 只有"尝试转换但失败"的字符才记录为转换失败
        // 如果配置了转换但字符无需转换（如特殊符号），不打印警告
        if (!conversionConfig || hasConversion) {
          convertFailedChars.push(char)
        }
      }
    }
  }

  // 只对转换失败的字符打印警告（不包括无需转换的特殊符号）
  if (warnMissing && convertFailedChars.length > 0) {
    const displayChars = convertFailedChars.slice(0, 20).map((ch) => {
      const code = ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')
      return `'${ch}' (U+${code})`
    })
    const configInfo = conversionConfig ? `（已尝试转换 ${conversionConfig.from} → ${conversionConfig.to}）` : ''
    console.warn(
      `[html-to-pdf] 以下 ${convertFailedChars.length} 个字符在字体 ${familyName} ${styleName} 中不存在${configInfo}，将显示为方块\n` +
        displayChars.join(', ') +
        (convertFailedChars.length > 20 ? `\n... 及其他 ${convertFailedChars.length - 20} 个字符` : '')
    )
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

  // 如果配置了转换且有成功的映射，打印信息
  if (warnMissing && conversionConfig && charMap.size > 0) {
    console.info(
      `[html-to-pdf] 成功转换 ${charMap.size} 个字符（${conversionConfig.from} → ${conversionConfig.to}）`
    )
  }

  return {
    buffer: subsetFont.toArrayBuffer(),
    charMap: charMap.size > 0 ? charMap : undefined
  }
}

/**
 * 为 HTML 元素创建字体子集映射
 *
 * @param element 待扫描的元素
 * @param fontBuffers 各字重已加载的完整字体 ArrayBuffer（加载/降级见 fontLoader）
 * @param conversionConfig OpenCC 转换配置（如 { from: 'cn', to: 'hk' }），undefined 表示不转换
 */
export async function createFontSubsetsForElement(
  element: HTMLElement,
  fontBuffers: {
    regular?: ArrayBuffer
    bold?: ArrayBuffer
    medium?: ArrayBuffer
  },
  conversionConfig?: OpenCCConfig
): Promise<{
  regular?: ArrayBuffer
  bold?: ArrayBuffer
  medium?: ArrayBuffer
  charMapRegular?: Map<string, string>  // Regular 字体简繁映射
  charMapBold?: Map<string, string>  // Bold 字体简繁映射
}> {
  const characters = extractUsedCharacters(element)

  const subsets: {
    regular?: ArrayBuffer
    bold?: ArrayBuffer
    medium?: ArrayBuffer
    charMapRegular?: Map<string, string>
    charMapBold?: Map<string, string>
  } = {}

  // 并行创建所有字体子集
  const tasks: Promise<void>[] = []

  if (fontBuffers.regular) {
    tasks.push(
      createFontSubset(fontBuffers.regular, characters, true, conversionConfig)
        .then(({ buffer, charMap }) => {
          subsets.regular = buffer
          subsets.charMapRegular = charMap
        })
        .catch((err) => {
          console.warn('Regular 字体子集创建失败:', err)
        })
    )
  }

  if (fontBuffers.bold) {
    tasks.push(
      createFontSubset(fontBuffers.bold, characters, true, conversionConfig)
        .then(({ buffer, charMap }) => {
          subsets.bold = buffer
          subsets.charMapBold = charMap
        })
        .catch((err) => {
          console.warn('Bold 字体子集创建失败:', err)
        })
    )
  }

  if (fontBuffers.medium) {
    tasks.push(
      createFontSubset(fontBuffers.medium, characters, true, conversionConfig)
        .then(({ buffer }) => {
          subsets.medium = buffer
        })
        .catch((err) => {
          console.warn('Medium 字体子集创建失败:', err)
        })
    )
  }

  await Promise.all(tasks)

  return subsets
}
