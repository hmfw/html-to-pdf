/**
 * 字体多源降级加载器
 *
 * 默认思源黑体随 npm 包发布（构建时复制到 `dist/fonts/`，见 vite.config.ts），
 * 但浏览器运行时无法直接读取 node_modules 里的文件，必须通过 URL 加载。
 * 因此采用「本地约定路径 → 国内 CDN → 国际 CDN」的顺序逐个尝试，
 * 任一成功即返回，兼顾国内网络与离线/内网部署。
 *
 * 加载优先级：
 *   1. 用户自定义路径（customUrl）——命中即用，失败直接抛错，绝不静默换字体；
 *   2. `/fonts/<file>`——沿用 public 目录约定，应用自行托管时零网络请求；
 *   3. npmmirror（国内镜像，淘宝）；
 *   4. jsDelivr（国内有节点）；
 *   5. unpkg（国际兜底）。
 */

/** 当前包版本，构建时由 vite 的 define 注入；开发态回退到 latest */
declare const __PKG_VERSION__: string
const PKG_VERSION: string = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : 'latest'

/** npm 包名，用于拼接 CDN 路径 */
const PKG_NAME = '@hmfw/html-to-pdf'

/** 字体文件名（与 public/fonts、dist/fonts 保持一致） */
export const FONT_FILES = {
  regular: 'Source_Han_Sans_SC_Regular.otf',
  bold: 'Source_Han_Sans_SC_Bold.otf',
} as const

export type FontWeight = keyof typeof FONT_FILES

/**
 * 为某个字重生成按优先级排序的候选 URL 列表。
 * 不含用户自定义路径（customUrl 单独优先处理）。
 */
function buildCandidateUrls(weight: FontWeight): string[] {
  const file = FONT_FILES[weight]
  const v = PKG_VERSION
  return [
    // 应用自托管的本地约定路径（离线 / 内网首选）
    `/fonts/${file}`,
    // 国内镜像
    `https://registry.npmmirror.com/${PKG_NAME}/${v}/files/dist/fonts/${file}`,
    // jsDelivr（国内有 CDN 节点）
    `https://cdn.jsdelivr.net/npm/${PKG_NAME}@${v}/dist/fonts/${file}`,
    // 国际兜底
    `https://unpkg.com/${PKG_NAME}@${v}/dist/fonts/${file}`,
  ]
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
 * 加载指定字重的字体，按优先级在多个源之间自动降级。
 *
 * @param weight 字重
 * @param customUrl 用户自定义路径；提供时只尝试它，失败直接抛错（不静默换字体）
 * @returns 字体文件的 ArrayBuffer
 */
export async function loadFontWithFallback(
  weight: FontWeight,
  customUrl?: string,
): Promise<ArrayBuffer> {
  // 用户显式指定路径：只用它，失败即抛错，避免「换了字体却不自知」
  if (customUrl) {
    return fetchArrayBuffer(customUrl, 15000)
  }

  const candidates = buildCandidateUrls(weight)
  const errors: string[] = []

  for (let i = 0; i < candidates.length; i++) {
    const url = candidates[i]
    // 本地约定路径给较短超时，CDN 给较长超时
    const timeout = i === 0 ? 8000 : 15000
    try {
      return await fetchArrayBuffer(url, timeout)
    } catch (err) {
      errors.push(`${url} → ${(err as Error).message}`)
    }
  }

  throw new Error(
    `字体加载失败（${weight}），已尝试以下来源：\n${errors.join('\n')}\n` +
      `可通过 options.fontPaths.${weight} 指定可用的字体地址。`,
  )
}
