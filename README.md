# @hmfw/html-to-pdf

一个框架无关的 HTML 转 PDF 库，基于 [pdf-lib](https://github.com/Hopding/pdf-lib)，默认支持中文（思源黑体）。

通过解析 DOM 的真实布局（`getBoundingClientRect` / `Range`）直接绘制 PDF 内容，**不依赖 html2canvas**，因此导出的是可选中、可搜索的矢量文本，而非位图截图。

> **框架无关。** 包只导出一个工具函数 `htmlToPdf`，它只接收一个原生 DOM 元素，可在 Vue / React / 原生 JS 中直接使用。

## 特性

- 框架无关：单个工具函数，任意框架可用，不牵入任何 UI 框架依赖
- 使用 pdf-lib 直接生成矢量 PDF（文本可选中、可搜索）
- 默认支持中文，内置思源黑体（Source Han Sans SC）
- **自动字体子集化**：只嵌入页面实际用到的字形，文件通常约 500KB
- 完整的 TypeScript 类型支持
- 支持多页文档（内容流**自动分页**，或 `data-pdf-page` 手动分页）
- 支持常见 HTML/CSS：标题、段落、列表、表格、图片、Canvas、引用、代码块、粗体、斜体、颜色、背景、边框、圆角、字符间距、文本对齐
- **实验性支持** `::before` / `::after` 伪元素（仅背景色和边框，需明确尺寸）

## 安装

```bash
npm install @hmfw/html-to-pdf
# 或
yarn add @hmfw/html-to-pdf
# 或
pnpm add @hmfw/html-to-pdf
```

> 本库不依赖任何 UI 框架，在 Vue / React / 原生 JS 中用法相同。

## 快速开始

### 1. 配置字体

从 [GitHub 仓库](https://github.com/hmfw/html-to-pdf/tree/main/public/fonts) 下载字体文件到 `public/fonts/` 目录：

```bash
# 需要的文件：
# - Source_Han_Sans_SC_Regular.woff
# - Source_Han_Sans_SC_Bold.woff
```

确保字体可通过 `/fonts/Source_Han_Sans_SC_Regular.woff` 和 `/fonts/Source_Han_Sans_SC_Bold.woff` 访问。

> 💡 字体文件较大（每个约 13-14MB），不随 npm 包发布。由于字体子集化功能默认开启，PDF 最终只嵌入实际使用的字形（通常约 500KB）。

或使用 CDN / 自定义路径。通过 `fonts` 注册表按元素的 CSS `font-family` 选字体（含字重）：

```ts
await htmlToPdf(element, {
  fonts: {
    // 保留键 default：未匹配任何注册字体或用到通用族（sans-serif 等）时使用
    default: {
      regular: 'https://your-cdn.com/fonts/Source_Han_Sans_SC_Regular.woff',
      bold: 'https://your-cdn.com/fonts/Source_Han_Sans_SC_Bold.woff',
    },
    // 元素 font-family: 'Roboto' 命中此项（忽略大小写与引号）
    Roboto: { regular: '/fonts/Roboto-Regular.woff', bold: '/fonts/Roboto-Bold.woff' },
  },
})
```

> `fontPaths: { regular, bold }` 仍可用（等价于 `fonts: { default: { regular, bold } }`），但已废弃，建议改用 `fonts`。

详见 [自定义字体文档](docs/custom-fonts.md)。

### 2. 使用

```ts
import { htmlToPdf } from '@hmfw/html-to-pdf'

const result = await htmlToPdf(element, { filename: 'document' })
// PDF 已自动下载
if (result.success && result.blob) {
  // 如需自行处理，可使用 result.blob（上传、预览等）
}
```

**Vue 3 示例**：

```vue
<template>
  <div ref="pdfContainer" data-pdf>
    <h1>标题</h1>
    <p>这是一段中文内容</p>
    <p>测试粗体：<strong>粗体文本</strong></p>
  </div>
  <button @click="handleExport" :disabled="exporting">
    {{ exporting ? '生成中...' : '导出 PDF' }}
  </button>
</template>

<script setup>
import { ref } from 'vue'
import { htmlToPdf } from '@hmfw/html-to-pdf'

const pdfContainer = ref(null)
const exporting = ref(false)

const handleExport = async () => {
  exporting.value = true
  try {
    await htmlToPdf(pdfContainer.value, { filename: 'my-document' })
  } finally {
    exporting.value = false
  }
}
</script>
```

**React / 原生 JS 示例**：见 [多框架使用文档](docs/multi-framework.md)。

## 处理缺字问题

当使用自定义字体时，如果字体中缺少某些字符，这些字符会显示为 ⛝ (U+26DD)。

**推荐方案：使用字符转换**

当使用繁体字库导出包含简体字的内容时（或反之），可以配置 OpenCC 进行字符转换：

```ts
await htmlToPdf(element, {
  fonts: {
    default: { regular: '/fonts/SourceHanSansHK-Regular.otf', bold: '/fonts/SourceHanSansHK-Bold.otf' },  // 香港繁体字库
  },
  converterOptions: { from: 'cn', to: 'hk' }  // 简体→香港繁体
})
```

常用配置：
- `{ from: 'cn', to: 'hk' }`：简体→香港繁体（推荐）
- `{ from: 'cn', to: 'tw' }`：简体→台湾繁体
- `{ from: 'tw', to: 'cn' }`：繁体→简体

详见 [字符转换文档](docs/converter.md) 和 [常见问题](docs/faq.md#pdf-中出现--字符)。

**补充方案：逐字形回退**

当缺失的是所选字体无法覆盖、也无法通过转换解决的字符（如数学符号 `ℝ`、`∈`、特殊符号）时，只需把补充字形的字体也注册进 `fonts`——所选字体缺某字形时会自动扫描注册表内其它字体补齐（镜像浏览器 per-glyph fallback）：

```ts
await htmlToPdf(element, {
  fonts: {
    // 纯符号兜底字体：不必被任何元素的 font-family 引用
    'Noto Sans Math': { regular: '/fonts/NotoSansMath-Regular.otf' },
    'STIX Two Math': { regular: '/fonts/STIXTwoMath-Regular.otf' },
  },
})
```

- 任何已注册字体都可为其它字体补齐缺失字形，不影响已存在的字符
- 兜底字符按其所在字体自身字重渲染（多数符号字体只有一个字重），粗体上下文不会额外加粗
- 每个字体按页面实际用到的字符子集化，注册多个字体不会显著增大产物
- 与 `converterOptions` 可同时使用：转换优先，转换失败的字符再走逐字形回退
- 若某字符在所有注册字体中都不存在，会显示为方块并输出一次汇总警告

详见 [自定义字体文档](docs/custom-fonts.md#逐字形回退)。

## API

### htmlToPdf(element, options?)

读取元素真实布局生成 PDF，**自动触发浏览器下载**，并返回 `{ success, blob?, error? }`。

### PdfExportOptions

```typescript
{
  filename?: string                                   // 文件名（不含扩展名），默认 'document'
  pageSize?: 'A4' | 'A3' | 'Letter'                   // 或自定义 { width, height }（单位 pt），默认 'A4'
  orientation?: 'portrait' | 'landscape'              // 页面方向，默认 'portrait'
  fonts?: Record<string, {                            // 字体注册表：CSS 字体名 → 路径（推荐）
    regular: string                                   // Regular 字体 URL（必需）
    bold?: string                                     // Bold 字体 URL（可选）
  }>                                                  // 保留键 'default' 为兜底；按元素 font-family 选字体，缺字形逐字回退
  fontPaths?: {                                       // @deprecated 请改用 fonts；等价于 fonts.default
    regular?: string                                  // Regular 字体 URL
    bold?: string                                     // Bold 字体 URL
  }
  basePath?: string                                   // 部署基础路径，默认 '/'
  fontSubset?: boolean                                // 是否子集化字体，默认 true
  converterOptions?: { from: string; to: string }     // OpenCC 字符转换配置
  fontLoadTimeout?: number                            // 字体加载超时（毫秒），默认 30000
  canvasResolver?: (canvas) => string | ArrayBuffer | null // 自定义 canvas 图片来源
  canvasPixelRatio?: number                           // ECharts 自动探测兜底的像素比
  debug?: boolean                                     // 是否在控制台输出性能报告（默认 false）
}
```

**ECharts 高清图表示例**：

```typescript
import * as echarts from 'echarts'

await htmlToPdf(element, {
  canvasResolver: (canvas) => {
    const dom = canvas.closest('[_echarts_instance_]')
    const inst = dom && echarts.getInstanceByDom(dom)
    return inst ? inst.getDataURL({ type: 'png', pixelRatio: 3, backgroundColor: '#fff' }) : null
  },
})
```

### DOM 标记常量

- `PDF_CONTAINER_ATTR` = `'data-pdf'` — 标记导出根元素
- `PDF_PAGE_ATTR` = `'data-pdf-page'` — 标记分页块

## 多页文档

### 自动分页（默认）

不加任何分页标记时，内容超过一页会**按内容流自动分页**，切页时尽量落在段落、标题、图片、表格行等不可分割元素的边界上：

```html
<div data-pdf style="max-width: 794px; padding: 40px;">
  <h1>很长的报告</h1>
  <p>第一段……</p>
  <!-- 内容超过一页时自动续到下一页 -->
  <table>...</table>
</div>
```

- 页边距「所见即所得」：直接由容器的 CSS `padding` 控制
- 内容放得下时仍输出单页

### 手动分页

给导出根元素加 `data-pdf`，每个 `data-pdf-page` 标记一个 PDF 页面：

```html
<div data-pdf>
  <div data-pdf-page>
    <div>第一页内容</div>
  </div>
  <div data-pdf-page>
    <div>第二页内容</div>
  </div>
</div>
```

**注意**：
- `data-pdf-page` 可以不是 `data-pdf` 的直接子元素，允许嵌套包装元素
- `data-pdf-page` 之间不可嵌套

## 容器宽度设置

为确保内容正确适配 PDF 页面，建议设置 `data-pdf` 容器的宽度与目标 PDF 页面宽度一致：

| 页面尺寸 | 推荐容器宽度 | CSS 设置 |
|---------|-------------|---------|
| A4 纵向 | 794px | `max-width: 794px` |
| A4 横向 | 1123px | `max-width: 1123px` |
| Letter | 816px | `max-width: 816px` |

```css
.pdf-document {
  max-width: 794px;  /* A4 纸张宽度 */
  margin: 0 auto;
  padding: 40px;     /* 页边距（自动分页时生效） */
  background: white;
  box-sizing: border-box;
}
```

详见 [常见问题 - 容器宽度设置](docs/faq.md#容器宽度设置)。

## 支持的 HTML / CSS

| 类别 | 支持情况 |
| --- | --- |
| 文本 | 中英文混排、字号、颜色（hex / rgb / rgba） |
| 字重 | Regular / Bold（`font-weight` ≥ 600 使用 Bold） |
| 斜体 | `italic` / `oblique`（通过 skew 变换模拟） |
| 图片 | `<img>`（PNG / JPG / SVG）、`<canvas>`、内联 `<svg>` |
| 盒子样式 | 背景色、透明度、边框（逐边）、圆角 |
| 伪元素 | `::before` / `::after`（仅背景色和边框，需明确尺寸，[详见文档](docs/pseudo-elements.md)） |
| 结构 | 表格、列表、引用、`<pre>`/`<code>`（保留换行） |
| 间距 / 对齐 | `letter-spacing`、`text-align` |
| 不支持 | emoji、阴影、渐变背景、变换、复杂 flex/grid 重排 |

完整特性列表见 [常见问题 - 支持的特性](docs/faq.md#支持的-html--css-特性)。

## 浏览器支持

仅支持现代浏览器，**不支持 IE**：

| 浏览器 | 最低版本 |
|--------|---------|
| Chrome | 90 |
| Firefox | 88 |
| Safari | 14 |
| Edge | 90 |

## 开发

```bash
npm install           # 安装依赖
npm run dev           # 开发模式（启动示例 src/App.vue）
npm run build         # 构建库（生成 dist + 类型声明）
npm run type-check    # 类型检查
npm test              # 运行单元测试
```

构建产物：`dist/index.mjs`（ESM）、`dist/index.cjs`（CJS）、`dist/index.d.ts`（类型）。

## 文档

- [多框架使用指南](docs/multi-framework.md) - Vue / React / 原生 JS 完整示例
- [自定义字体](docs/custom-fonts.md) - 字体路径配置、繁体字库、授权说明
- [字符转换](docs/converter.md) - OpenCC 简繁转换配置
- [常见问题](docs/faq.md) - 缺字、字体加载失败、容器宽度、已知限制
- [伪元素支持](docs/pseudo-elements.md) - `::before` / `::after` 使用说明

## License

MIT
