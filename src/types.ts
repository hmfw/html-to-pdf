/** OpenCC 转换器配置 */
export interface ConverterOptions {
  from: string
  to: string
}

export interface PdfExportOptions {
  /** PDF 文件名（不含扩展名） */
  filename?: string
  /** 页面尺寸 */
  pageSize?: 'A4' | 'A3' | 'Letter' | { width: number; height: number }
  /** 页面方向 */
  orientation?: 'portrait' | 'landscape'
  /**
   * 自定义字体路径（覆盖默认的思源黑体）。
   *
   * 不传时，库会按「`/fonts/<文件名>` → npmmirror → jsDelivr → unpkg」的顺序
   * 自动降级加载随包发布的思源黑体，无需配置即可在国内外使用。
   *
   * 一旦显式提供某字重的路径，则只使用该路径，加载失败会直接报错
   * （不会静默回退到默认字体）。
   *
   * @example
   * ```typescript
   * {
   *   regular: '/fonts/MyFont-Regular.otf',
   *   bold: '/fonts/MyFont-Bold.otf'
   * }
   * ```
   */
  fontPaths?: {
    /** 中文 Regular 字体 URL（默认自动从本地/CDN 加载思源黑体 Regular） */
    regular?: string
    /** 中文 Bold 字体 URL（默认自动从本地/CDN 加载思源黑体 Bold） */
    bold?: string
  }
  /**
   * 部署基础路径（默认 `'/'`）。
   *
   * 用于解决应用**部署在子路径**（非域名根目录）时，内置思源黑体的默认路径
   * `/fonts/<文件名>` 被解析到域名根而非应用根、导致字体 404 的问题。
   *
   * 传入应用的 base 后，默认字体路径会自动带上该前缀。它同时作用于：
   * - 未指定 `fontPaths` 时加载的默认主字体；
   * - 使用自定义字体时、按需加载的思源黑体**后备字体**。
   *
   * 显式提供的 `fontPaths` 是完整 URL，不受 `basePath` 影响。
   *
   * @example
   * ```typescript
   * // Vite：根目录部署时为 '/'，子路径部署（base: '/myapp/'）时为 '/myapp/'
   * { basePath: import.meta.env.BASE_URL }
   * // Webpack（CRA/Vue CLI）
   * { basePath: process.env.PUBLIC_URL }
   * ```
   */
  basePath?: string
  /**
   * 使用自定义字体时，是否在检测到缺字时加载思源黑体作为后备字体（默认 true）。
   *
   * 后备字体用于渲染自定义字体中缺失的字符（如繁体字体缺少的简体字）。
   * 采用**按需加载**：只有扫描内容发现主字体确实缺字时才会下载后备字体，
   * 自定义字体完整覆盖所用字符时不会产生额外的字体请求。
   *
   * - true：检测到缺字时自动加载思源黑体补充缺失字符（需要托管思源黑体文件）
   * - false：从不加载后备字体，缺失的字符会显示为方块
   *
   * 仅在提供了 `fontPaths` 时生效。未使用自定义字体时此选项无效。
   * 注意：关闭子集化（`fontSubset: false`）时无法预知缺字，此时若 `fontFallback` 为
   * true 会预先加载完整后备字体。
   */
  fontFallback?: boolean
  /**
   * 是否对字体进行子集化（默认 true）。
   * - true：仅嵌入页面实际用到的字形，PDF 体积小（推荐）。
   * - false：嵌入完整字体，文件显著增大（思源黑体每个字重约 16MB），
   *   但可避免子集化对个别字体/字形的兼容问题。
   */
  fontSubset?: boolean
  /**
   * OpenCC 字符转换配置（默认 undefined，不转换）。
   *
   * 当使用繁体字库遇到简体字时，或使用简体字库遇到繁体字时，
   * 可以配置 OpenCC 进行字符转换，避免因字库缺失字符而需要加载后备字体。
   *
   * 推荐配置（简体→香港繁体）：`{ from: 'cn', to: 'hk' }`
   *
   * 常用配置：
   * - `{ from: 'cn', to: 'hk' }`：简体→香港繁体（推荐）
   * - `{ from: 'cn', to: 'tw' }`：简体→台湾繁体
   * - `{ from: 'cn', to: 'twp' }`：简体→台湾繁体（含成语）
   * - `{ from: 'cn', to: 't' }`：简体→标准繁体
   * - `{ from: 'tw', to: 'cn' }`：台湾繁体→简体
   * - `{ from: 'hk', to: 'cn' }`：香港繁体→简体
   *
   * 注意：仅在字库缺失字符时才会转换，已存在的字符不受影响。
   *
   * @example
   * ```typescript
   * // 简体→香港繁体（推荐）
   * { converterOptions: { from: 'cn', to: 'hk' } }
   *
   * // 简体→台湾繁体
   * { converterOptions: { from: 'cn', to: 'tw' } }
   *
   * // 繁体→简体（反向转换）
   * { converterOptions: { from: 'tw', to: 'cn' } }
   * ```
   */
  converterOptions?: ConverterOptions
  /**
   * 字体加载超时时间（毫秒，默认 30000，即 30 秒）。
   *
   * 字体文件较大（思源黑体约 16-17MB），在网络较慢时需要更长加载时间：
   * - 光纤宽带（100 Mbps）：2-3 秒
   * - 家庭宽带（50 Mbps）：4-5 秒
   * - 4G 良好（20 Mbps）：10-13 秒
   * - 4G 一般（10 Mbps）：20-26 秒
   * - 4G 较差（5 Mbps）：40-52 秒
   *
   * 根据目标用户的网络环境调整：
   * - 桌面宽带用户：30000（30 秒）已足够
   * - 移动网络用户：建议 45000-60000（45-60 秒）
   */
  fontLoadTimeout?: number
  /**
   * 自定义 <canvas> 的图片数据来源。每个 <canvas> 渲染时调用一次。
   *
   * 默认情况下，canvas 会按其当前像素直接栅格化为 PNG。对 ECharts 这类
   * 图表，直接读取已绘制的位图无法变清晰；此钩子允许在**源头**重新生成
   * 高清数据（如 ECharts 的 `getDataURL({ pixelRatio })`）。
   *
   * - 返回 data URL 字符串或 ArrayBuffer（PNG/JPEG 数据）→ 用它替换默认栅格。
   * - 返回 `null` / `undefined` → 回退到内部逻辑（ECharts 自动探测 → 默认栅格）。
   * - 可返回 Promise（兼容异步图表库）。
   *
   * 多个图表时，回调对每个 canvas 各触发一次，用 canvas 参数反查对应实例即可。
   *
   * @example
   * ```typescript
   * import * as echarts from 'echarts'
   * exportToPdf(el, {
   *   canvasResolver: (canvas) => {
   *     const dom = canvas.closest('[_echarts_instance_]') as HTMLElement | null
   *     const inst = dom && echarts.getInstanceByDom(dom)
   *     return inst ? inst.getDataURL({ type: 'png', pixelRatio: 3, backgroundColor: '#fff' }) : null
   *   },
   * })
   * ```
   */
  canvasResolver?: (
    canvas: HTMLCanvasElement,
  ) => string | ArrayBuffer | null | undefined | Promise<string | ArrayBuffer | null | undefined>
  /**
   * 内部 ECharts 自动探测兜底时使用的像素比（默认 `Math.max(2, devicePixelRatio)`）。
   * 仅当 canvas 命中全局 `window.echarts` 实例、且未被 `canvasResolver` 处理时生效。
   */
  canvasPixelRatio?: number
  /**
   * 是否在控制台输出各阶段耗时的性能报告（默认 `false`）。
   * 仅用于本地调试；默认关闭，避免污染使用方的控制台。
   */
  debug?: boolean
}

export interface PdfGenerateResult {
  success: boolean
  blob?: Blob
  error?: Error
}

export type ExportStatus = 'idle' | 'processing' | 'success' | 'error'
