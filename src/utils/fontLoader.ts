/**
 * 字体加载器
 *
 * 浏览器运行时无法直接读取 node_modules 里的文件，必须通过 HTTP URL 加载。
 * 用户需在应用中托管字体文件（如放到 public/fonts/），或通过 fontPaths 选项
 * 指定可访问的 URL（本地路径或 CDN）。
 *
 * 加载优先级：
 *   1. 用户自定义路径（customUrl）——命中即用，失败直接抛错，绝不静默换字体；
 *   2. `/fonts/<file>`——约定路径，用户需将字体文件放到应用的 public/fonts/ 目录。
 */

/** 字体文件名（与 public/fonts、dist/fonts 保持一致） */
export const FONT_FILES = {
  regular: 'Source_Han_Sans_SC_Regular.otf',
  bold: 'Source_Han_Sans_SC_Bold.otf',
} as const

export type FontWeight = keyof typeof FONT_FILES

/**
 * 为某个字重生成约定路径。
 */
function buildDefaultUrl(weight: FontWeight): string {
  const file = FONT_FILES[weight]
  return `/fonts/${file}`
}

/** 带超时的 fetch，返回 ArrayBuffer */
async function fetchArrayBuffer(url: string, timeout: number): Promise<ArrayBuffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const buf = await res.arrayBuffer()
    assertLooksLikeFont(buf, url)
    return buf
  } catch (err) {
    throw new Error(`加载失败: ${(err as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 校验返回内容确实是字体文件，而非 SPA 的 index.html 404 兜底页。
 * 思源黑体为 OpenType/CFF（`OTTO`）；同时容忍 TrueType（`\x00\x01\x00\x00`）、
 * WOFF（`wOFF`）、WOFF2（`wOF2`），避免误伤自定义字体。
 */
function assertLooksLikeFont(buf: ArrayBuffer, url: string): void {
  if (buf.byteLength < 4) {
    throw new Error(`内容过短，疑似非字体文件: ${url}`)
  }
  const sig = new Uint8Array(buf, 0, 4)
  const tag = String.fromCharCode(sig[0], sig[1], sig[2], sig[3])
  const isOTTO = tag === 'OTTO'
  const isWoff = tag === 'wOFF'
  const isWoff2 = tag === 'wOF2'
  const isTrueType = sig[0] === 0x00 && sig[1] === 0x01 && sig[2] === 0x00 && sig[3] === 0x00
  const isTtcf = tag === 'ttcf'
  const isTrueTag = tag === 'true' // 老式 macOS TrueType
  if (!(isOTTO || isWoff || isWoff2 || isTrueType || isTtcf || isTrueTag)) {
    throw new Error(`返回内容不是字体文件（可能是 404 页面）: ${url}`)
  }
}

/**
 * 加载指定字重的字体。
 *
 * @param weight 字重
 * @param customUrl 用户自定义路径；提供时只尝试它，失败直接抛错（不静默换字体）
 * @param timeout 超时时间（毫秒），默认 30000（30 秒）
 * @returns 字体文件的 ArrayBuffer
 */
export async function loadFontWithFallback(
  weight: FontWeight,
  customUrl?: string,
  timeout: number = 30000,
): Promise<ArrayBuffer> {
  const url = customUrl || buildDefaultUrl(weight)

  try {
    return await fetchArrayBuffer(url, timeout)
  } catch (err) {
    const errorMsg = customUrl
      ? `字体加载失败（${weight}）：\n${url} → ${(err as Error).message}`
      : `字体加载失败（${weight}）：\n${url} → ${(err as Error).message}\n\n` +
        `请确保字体文件已放置在应用的 public/fonts/ 目录，或通过 options.fontPaths.${weight} 指定可访问的 URL。\n` +
        `需要的字体文件可从 node_modules/@hmfw/html-to-pdf/public/fonts/ 复制。`

    throw new Error(errorMsg)
  }
}
