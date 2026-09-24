/** OpenCC 转换器配置 */
export interface ConverterOptions {
  from: string
  to: string
}

/** 单个字体家族的文件路径（含字重） */
export interface FontFacePaths {
  /** Regular 字重字体 URL（必需） */
  regular: string
  /** Bold 字重字体 URL（可选，缺失时粗体降级为 Regular） */
  bold?: string
}

export interface PdfExportOptions {
  /** PDF 文件名（不含扩展名） */
  filename?: string
  /** 页面尺寸 */
  pageSize?: 'A4' | 'A3' | 'Letter' | { width: number; height: number }
  /** 页面方向 */
  orientation?: 'portrait' | 'landscape'
  /**
   * 字体注册表：CSS 字体名 → 字体文件路径（含字重）。
   *
   * 渲染时按元素**计算样式的 `font-family` 候选链**匹配本表选字体
   * （匹配忽略大小写与引号），实现「所见即所得」的字体还原：
   * - 元素 `font-family: 'Roboto', sans-serif` → 命中注册表里的 `Roboto`；
   * - 通用族（`serif` / `sans-serif` / `monospace` 等）→ 使用 `default`。
   *
   * **逐字形回退**：所选字体缺某个字形时（如正文字体没有数学符号 `ℝ`），
   * 自动扫描注册表内**其它字体**补齐该字形，镜像浏览器自身的 per-glyph fallback。
   * 因此把数学/符号字体也注册进来（哪怕没有元素显式使用它）即可充当兜底。
   *
   * **保留键 `'default'`**：未匹配任何注册字体、或用到通用族时使用；
   * 不提供 `'default'` 时回退到内置思源黑体（可配合 `basePath`）。
   *
   * 注意：
   * - 每个字体按页面实际用到的字符做子集化，注册多个字体不会显著增大产物。
   * - 缺失字形按其所在字体自身字重渲染（多数符号字体只有一个字重），
   *   粗体上下文中的兜底字符不会额外加粗——如需粗体请提供粗体文件。
   * - 若某字符在所有注册字体中都不存在，会显示为方块并输出一次汇总警告。
   *
   * @example
   * ```typescript
   * {
   *   fonts: {
   *     default: { regular: '/fonts/SourceHanSans-R.woff', bold: '/fonts/SourceHanSans-B.woff' },
   *     Roboto:  { regular: '/fonts/Roboto-R.woff', bold: '/fonts/Roboto-B.woff' },
   *     // 纯符号兜底字体（不必被任何元素的 font-family 引用）
   *     'Noto Sans Math': { regular: '/fonts/NotoSansMath-Regular.woff2' },
   *   }
   * }
   * ```
   */
  fonts?: Record<string, FontFacePaths>
  /**
   * @deprecated 请改用 `fonts`。等价于 `fonts: { default: { regular, bold } }`。
   *
   * 自定义默认字体路径（覆盖内置思源黑体）。当同时提供 `fonts.default` 时，
   * 以 `fonts.default` 为准，本字段被忽略。
   */
  fontPaths?: {
    /** 中文 Regular 字体 URL（默认自动从 /fonts/ 加载思源黑体 Regular） */
    regular?: string
    /** 中文 Bold 字体 URL（默认自动从 /fonts/ 加载思源黑体 Bold） */
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
   * 是否对字体进行子集化（默认 true）。
   * - true：仅嵌入页面实际用到的字形，PDF 体积小（推荐）。
   * - false：嵌入完整字体，文件显著增大（思源黑体每个字重约 16MB），
   *   但可避免子集化对个别字体/字形的兼容问题。
   */
  fontSubset?: boolean
  /**
   * OpenCC 字符转换配置（默认 undefined，不转换）。
   *
   * 当主字体缺少某些字符时，可以配置 OpenCC 进行字符转换来解决缺字问题。
   * 例如使用繁体字库时遇到简体字，或使用简体字库时遇到繁体字。
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
   * 转换失败的字符将显示为方块。
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
