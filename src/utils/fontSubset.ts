import * as opentype from 'opentype.js'
import { convertCharacters, type OpenCCConfig } from './textConverter'
import { mathAutoTransform } from './mathTransform'

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
        if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
          continue
        }

        // 过滤彩色 emoji（多在星空平面 U+1F000+，需彩色字体，PDF 嵌入会失败）。
        // 保留 BMP 常见符号（★☎✓©®™ 等 U+2000–U+2FFF），中文字体通常支持。
        const isColorEmoji =
          (code >= 0x1f300 && code <= 0x1f9ff) || // Misc Symbols and Pictographs / Emoticons / etc.
          (code >= 0x1f000 && code <= 0x1f02f) || // Mahjong/Domino Tiles
          (code >= 0x1fa00 && code <= 0x1faff) || // Extended-A (chess, symbols)
          (code >= 0xfe00 && code <= 0xfe0f) // Variation Selectors (emoji vs text presentation)

        // 保留所有字符，包括空格、中英文、标点等
        // 只排除彩色 emoji
        if (!isColorEmoji) {
          chars.add(char)
        }
      }

      // text-transform: math-auto（MathML <mi> 默认）会把单字符标识符渲染为
      // 数学斜体（X→𝑋、α→𝛼），码点与原字符不同。需把转换后的码点也纳入子集，
      // 否则导出时该字形缺失、与网页显示不一致。
      const parent = node.parentElement
      if (parent && getComputedStyle(parent).textTransform === 'math-auto') {
        const transformed = mathAutoTransform(text.trim())
        for (const ch of transformed) {
          const code = ch.codePointAt(0) ?? 0
          if (code > 0x1f && !(code >= 0x7f && code <= 0x9f)) chars.add(ch)
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
    element.tagName === 'OL' || element.tagName === 'LI' || !!element.querySelector?.('ol, li')
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
 * @param buildSubset 是否构建子集字体；false 时只扫描字形覆盖情况、返回原始 buffer
 *   （用于非子集化模式仍需计算 coverage / charMap）
 * @returns 子集字体 ArrayBuffer、字符映射表（原始→转换后）和缺失字符集合
 */
export async function createFontSubset(
  fontBuffer: ArrayBuffer,
  characters: Set<string>,
  warnMissing: boolean = true,
  conversionConfig?: OpenCCConfig,
  buildSubset: boolean = true,
): Promise<{
  buffer: ArrayBuffer
  charMap?: Map<string, string> // 原始字符→转换后字符映射
  missingChars: Set<string> // 该字体中缺失的字符
}> {
  const font = opentype.parse(fontBuffer) as any

  // 获取字体元信息。opentype.js 顶层 names.* 只读某一平台（常为 windows/unicode），
  // 有些字体（如 Latin Modern Math）名字只写在 macintosh 记录里，需跨平台回退，
  // 否则会误落到下面的硬编码兜底名，导致子集字体名张冠李戴。
  const readName = (field: string): string | undefined =>
    font.names?.[field]?.en ||
    font.names?.windows?.[field]?.en ||
    font.names?.macintosh?.[field]?.en ||
    font.names?.unicode?.[field]?.en
  const familyName = readName('fontFamily') || readName('fullName') || 'Source Han Sans SC'
  const styleName = readName('fontSubfamily') || 'Regular'

  // 获取需要的字形 ID（始终包含 .notdef = glyph 0）
  const glyphIds = new Set<number>()
  glyphIds.add(0)

  const convertFailedChars: string[] = [] // 转换失败的字符（用于警告）
  const missingChars = new Set<string>() // 该字体中缺失的字符
  const charMap = new Map<string, string>() // 原始字符→转换后字符映射

  for (const char of characters) {
    const glyph = font.charToGlyph(char)
    if (glyph && glyph.index !== undefined && glyph.index !== 0) {
      // glyph.index = 0 表示映射到 .notdef，即字体中不存在该字符
      glyphIds.add(glyph.index)
    } else if (!glyph || glyph.index === 0) {
      // 字符在字体中不存在，尝试转换
      let resolved = false

      if (conversionConfig) {
        const convertedChars = convertCharacters(new Set([char]), conversionConfig)

        // 尝试转换后的字符
        for (const cChar of convertedChars) {
          if (cChar !== char) {
            // 转换后有变化
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

      // 如果转换未解决，记录为缺失字符
      if (!resolved) {
        missingChars.add(char)
        convertFailedChars.push(char)
      }
    }
  }

  // 只对转换失败的字符打印警告（不包括无需转换的特殊符号）
  if (warnMissing && convertFailedChars.length > 0) {
    const displayChars = convertFailedChars.slice(0, 20).map((ch) => {
      const code = ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')
      return `'${ch}' (U+${code})`
    })
    const configInfo = conversionConfig
      ? `（已尝试转换 ${conversionConfig.from} → ${conversionConfig.to}）`
      : ''
    console.warn(
      `[html-to-pdf] 以下 ${convertFailedChars.length} 个字符在字体 ${familyName} ${styleName} 中不存在${configInfo}，将显示为方块\n` +
        displayChars.join(', ') +
        (convertFailedChars.length > 20
          ? `\n... 及其他 ${convertFailedChars.length - 20} 个字符`
          : ''),
    )
  }

  // 创建子集字体（buildSubset=false 时跳过，直接返回原始字体，仅取 coverage/charMap）
  let outBuffer = fontBuffer
  if (buildSubset) {
    const glyphIdsArray = Array.from(glyphIds).sort((a, b) => a - b)
    const glyphs = glyphIdsArray.map((id: number) => font.glyphs.get(id))

    const subsetFont = new (opentype as any).Font({
      familyName,
      styleName,
      unitsPerEm: font.unitsPerEm,
      ascender: font.ascender,
      descender: font.descender,
      glyphs,
    })
    outBuffer = subsetFont.toArrayBuffer()
  }

  // 如果配置了转换且有成功的映射，打印信息
  if (warnMissing && conversionConfig && charMap.size > 0) {
    console.info(
      `[html-to-pdf] 成功转换 ${charMap.size} 个字符（${conversionConfig.from} → ${conversionConfig.to}）`,
    )
  }

  return {
    buffer: outBuffer,
    charMap: charMap.size > 0 ? charMap : undefined,
    missingChars,
  }
}

/** 一个字体家族已加载的完整字体 buffer（含字重） */
export interface FamilyFontBuffers {
  key: string // 小写字体名
  regular?: ArrayBuffer
  bold?: ArrayBuffer
}

/** 一个字体家族子集化后的产物 */
export interface FamilySubset {
  key: string
  regular?: ArrayBuffer
  bold?: ArrayBuffer
  coveredRegular: Set<string> // Regular 覆盖的字符（含 OpenCC 转换后可渲染的原字符）
  coveredBold?: Set<string> // Bold 覆盖的字符；无 Bold 时为 undefined
  charMapRegular?: Map<string, string>
  charMapBold?: Map<string, string>
}

/**
 * 为 HTML 元素创建**多字体注册表**的子集。
 *
 * 对每个已加载的字体家族分别子集化 Regular / Bold，计算各自的字形覆盖集
 * （coverage = 使用到的字符 − 缺失字符，含 OpenCC 转换后可渲染的原字符），
 * 供渲染时做 font-family 选择与逐字形回退。
 *
 * @param element 待扫描的元素
 * @param families 各字体家族已加载的完整 buffer
 * @param conversionConfig OpenCC 转换配置，undefined 表示不转换
 * @param buildSubset 是否真正子集化（false = 非子集化模式，只算 coverage 并保留完整字体）
 * @returns 每个家族的子集产物，以及在所有家族中都缺失的字符集合（用于汇总警告）
 */
export async function createFontRegistrySubsets(
  element: HTMLElement,
  families: FamilyFontBuffers[],
  conversionConfig?: OpenCCConfig,
  buildSubset: boolean = true,
): Promise<{ subsets: FamilySubset[]; missingEverywhere: Set<string> }> {
  const characters = extractUsedCharacters(element)
  const subsets: FamilySubset[] = []

  for (const family of families) {
    if (!family.regular) continue

    const result: FamilySubset = {
      key: family.key,
      coveredRegular: new Set(),
    }

    // Regular（必需）
    try {
      const reg = await createFontSubset(
        family.regular,
        characters,
        false,
        conversionConfig,
        buildSubset,
      )
      result.regular = reg.buffer
      result.charMapRegular = reg.charMap
      result.coveredRegular = diff(characters, reg.missingChars)
    } catch (err) {
      console.warn(`[html-to-pdf] 字体 "${family.key}" Regular 子集创建失败:`, err)
      continue
    }

    // Bold（可选）
    if (family.bold) {
      try {
        const bd = await createFontSubset(
          family.bold,
          characters,
          false,
          conversionConfig,
          buildSubset,
        )
        result.bold = bd.buffer
        result.charMapBold = bd.charMap
        result.coveredBold = diff(characters, bd.missingChars)
      } catch (err) {
        console.warn(`[html-to-pdf] 字体 "${family.key}" Bold 子集创建失败，将降级为 Regular:`, err)
      }
    }

    subsets.push(result)
  }

  // 计算在「所有家族」中都无法渲染的字符（Regular / Bold 任一覆盖即视为可渲染）
  const missingEverywhere = new Set<string>()
  for (const char of characters) {
    const availableSomewhere = subsets.some(
      (s) => s.coveredRegular.has(char) || s.coveredBold?.has(char),
    )
    if (!availableSomewhere) missingEverywhere.add(char)
  }

  if (missingEverywhere.size > 0) {
    const displayChars = [...missingEverywhere].slice(0, 20).map((ch) => {
      const code = ch.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')
      return `'${ch}' (U+${code})`
    })
    console.warn(
      `[html-to-pdf] 以下 ${missingEverywhere.size} 个字符在所有已注册字体中都不存在，将显示为方块\n` +
        displayChars.join(', ') +
        (missingEverywhere.size > 20
          ? `\n... 及其他 ${missingEverywhere.size - 20} 个字符`
          : ''),
    )
  }

  return { subsets, missingEverywhere }
}

/** 集合差：a − b */
function diff(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const x of a) if (!b.has(x)) out.add(x)
  return out
}
