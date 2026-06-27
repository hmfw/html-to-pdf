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
   * 是否对字体进行子集化（默认 true）。
   * - true：仅嵌入页面实际用到的字形，PDF 体积小（推荐）。
   * - false：嵌入完整字体，文件显著增大（思源黑体每个字重约 16MB），
   *   但可避免子集化对个别字体/字形的兼容问题。
   */
  fontSubset?: boolean
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
