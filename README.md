# @hmfw/html-to-pdf

一个框架无关的 HTML 转 PDF 库，基于 [pdf-lib](https://github.com/Hopding/pdf-lib)，默认支持中文（思源黑体）。

通过解析 DOM 的真实布局（`getBoundingClientRect` / `Range`）直接绘制 PDF 内容，**不依赖 html2canvas**，因此导出的是可选中、可搜索的矢量文本，而非位图截图。

> **核心是框架无关的。** 工具函数 `exportToPdf` / `downloadPdf` 只接收一个原生 DOM 元素，可在 React / Vue2 / 原生 JS 中直接使用。本包同时附带 Vue3 组件 `<PdfDocument>` / `<PdfPage>` 作为便捷封装。React / Vue2 / 原生用法详见 [多框架使用](#多框架使用)。

## 特性

- 框架无关：工具函数任意框架可用，另附 Vue3 组件封装
- 使用 pdf-lib 直接生成矢量 PDF（文本可选中、可搜索）
- 默认支持中文，内置思源黑体（Source Han Sans SC）
- **自动字体子集化**：只嵌入页面实际用到的字形，文件通常约 500KB
- 完整的 TypeScript 类型支持
- 支持多页文档（`<PdfPage>` 或 `data-pdf-page` 手动分页）
- 支持常见 HTML/CSS：标题、段落、列表、表格、图片、Canvas、引用、代码块、粗体、斜体、颜色、背景、边框、圆角
- **实验性支持** `::before` / `::after` 伪元素（仅背景色和边框，需明确尺寸）

## 安装

```bash
npm install @hmfw/html-to-pdf
# 或
yarn add @hmfw/html-to-pdf
# 或
pnpm add @hmfw/html-to-pdf
```

> `vue` 是**可选** peer dependency：仅在使用 Vue3 组件（`<PdfDocument>` / `<PdfPage>`）时需要 `vue@^3.3.0`。只用工具函数（React / Vue2 / 原生）时无需安装 Vue。

## 字体配置

本库需要思源黑体文件才能正确渲染中文。字体已随仓库提供，位于 `public/fonts/`，运行时通过以下路径加载，无需额外配置：

- `/fonts/Source_Han_Sans_SC_Regular.otf`（必需，Regular 字重）
- `/fonts/Source_Han_Sans_SC_Bold.otf`（可选，Bold 字重）

> 当前 PDF 生成只使用 Regular 和 Bold 两个字重。`src/styles/fonts.css` 中声明的其它字重仅用于网页预览。


## 快速开始

### 方式 1: 使用组件（推荐）

`PdfDocument` 不内置按钮，通过模板 ref 调用 `exportPdf()` 触发导出，并读取暴露的 `status` / `error`。

```vue
<template>
  <PdfDocument ref="docRef" :options="{ filename: 'my-document' }">
    <div>
      <h1>标题</h1>
      <p>这是一段中文内容</p>
      <p>测试粗体：<strong>粗体文本</strong></p>
    </div>
  </PdfDocument>
  <button @click="handleExport" :disabled="docRef?.status === 'processing'">
    {{ docRef?.status === 'processing' ? '生成中...' : '导出 PDF' }}
  </button>
</template>

<script setup>
import { ref } from 'vue'
import { PdfDocument } from '@hmfw/html-to-pdf'

const docRef = ref(null)

const handleExport = async () => {
  await docRef.value.exportPdf()
}
</script>
```

### 方式 2: 直接调用工具函数

适合不依赖组件、需要拿到 Blob 自行处理（上传、预览等）的场景。各框架都从同一入口引入。

```ts
import { exportToPdf, downloadPdf } from '@hmfw/html-to-pdf'

const result = await exportToPdf(element, { filename: 'document' })
if (result.success && result.blob) {
  downloadPdf(result.blob, 'document') // 或自行处理 result.blob
}
```

## 多框架使用

核心导出能力（`exportToPdf` / `downloadPdf`）只接收一个原生 DOM 元素，不依赖任何框架。React / Vue2 / 原生 JS 直接从 `@hmfw/html-to-pdf` 引入这两个函数即可（不引入组件就不会牵入 Vue）。

分页同样框架无关：给导出根元素加 `data-pdf`，给每个分页块加 `data-pdf-page`（值从 1 递增），效果等同 `<PdfDocument>` / `<PdfPage>`。属性名也以常量形式导出（`PDF_CONTAINER_ATTR` / `PDF_PAGE_ATTR`）。

完整示例见 [docs/multi-framework.md](docs/multi-framework.md)。最小用法：

```ts
// React / Vue2 / 原生 JS 通用
import { exportToPdf, downloadPdf } from '@hmfw/html-to-pdf'

async function handleExport(el: HTMLElement) {
  const result = await exportToPdf(el, { filename: 'document' })
  if (result.success && result.blob) downloadPdf(result.blob, 'document')
}
```

```jsx
// React 示例
import { useRef } from 'react'
import { exportToPdf, downloadPdf } from '@hmfw/html-to-pdf'

function Report() {
  const ref = useRef(null)
  const onExport = async () => {
    const { success, blob } = await exportToPdf(ref.current, { filename: 'report' })
    if (success && blob) downloadPdf(blob, 'report')
  }
  return (
    <>
      <div ref={ref} data-pdf>
        <h1>标题</h1>
        <p>这是一段中文内容</p>
      </div>
      <button onClick={onExport}>导出 PDF</button>
    </>
  )
}
```

> 字体仍需可访问 `/fonts/Source_Han_Sans_SC_*.otf`，与框架无关，详见 [字体配置](#字体配置)。

## 字体子集化说明

字体子集化**默认开启**，可通过 `fontSubset: false` 关闭：

- 自动扫描内容中实际使用的字符，只嵌入需要的字形
- 支持中英文、标点、数字等常用字符
- 文件大小通常约 **500KB**
- ⚠️ 不支持 emoji 等符号，会被自动过滤（不会嵌入也不会绘制）

设为 `fontSubset: false` 时嵌入完整字体（思源黑体每个字重约 16MB，PDF 会显著增大），适用于子集化对个别字体兼容异常的场景：

```typescript
await htmlToPdf(element, { fontSubset: false })
```

## API

### 组件

#### `<PdfDocument>`

包裹要导出的内容。组件不内置按钮，通过模板 ref 调用 `exportPdf()` 触发导出。

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `options` | `PdfExportOptions` | `{}` | 导出选项，见下文 |
| `width` | `number \| string` | `794` | 内容区宽度（数字按 px 处理） |

事件：

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `start` | — | 开始导出 |
| `success` | `(blob: Blob)` | 导出成功 |
| `error` | `(error: Error)` | 导出失败 |

插槽：

- 默认插槽：要导出的内容

通过模板 ref 暴露（`expose`）：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `exportPdf` | `() => Promise<Blob>` | 程序化触发导出（生成并下载），返回 Blob |
| `status` | `Ref<'idle' \| 'processing' \| 'success' \| 'error'>` | 当前导出状态 |
| `error` | `Ref<Error \| null>` | 最近一次错误 |
| `reset` | `() => void` | 重置状态 |
| `contentRef` | `Ref<HTMLElement \| null>` | 内容容器元素 |

#### `<PdfPage>`

多页文档的分页标记，详见 [多页文档](#多页文档)。Prop：`pageNumber?: number`。

### 入口与导出

包只有一个入口 `@hmfw/html-to-pdf`，导出内容：

| 导出 | 说明 | 适用 |
| --- | --- | --- |
| `exportToPdf`、`downloadPdf` | 工具函数 | 任意框架 |
| `PDF_CONTAINER_ATTR`、`PDF_PAGE_ATTR` | DOM 标记常量 | 任意框架 |
| `PdfExportOptions`、`PdfGenerateResult`、`ExportStatus` | 类型 | 任意框架 |
| `PdfDocument`、`PdfPage`、`install`（默认导出） | Vue3 组件与插件 | Vue3 |

> 只引入工具函数 / 常量 / 类型时，不会牵入 Vue 依赖（Vue 组件被 tree-shake 掉）。

### 工具函数

- `exportToPdf(element, options?): Promise<PdfGenerateResult>` — 生成 PDF，返回 `{ success, blob?, error? }`
- `downloadPdf(blob, filename?)` — 触发浏览器下载

### DOM 标记常量（框架无关分页）

- `PDF_CONTAINER_ATTR` = `'data-pdf'` — 标记导出根元素
- `PDF_PAGE_ATTR` = `'data-pdf-page'` — 标记分页块（值从 1 递增）

### 插件安装

```ts
import HtmlToPdf from '@hmfw/html-to-pdf'

app.use(HtmlToPdf) // 全局注册 PdfDocument / PdfPage
```

## 配置选项

### `PdfExportOptions`

```typescript
{
  filename?: string                                   // 文件名（不含扩展名），默认 'document'
  pageSize?: 'A4' | 'A3' | 'Letter'                   // 或自定义 { width, height }（单位 pt），默认 'A4'
  orientation?: 'portrait' | 'landscape'              // 页面方向，默认 'portrait'
  margin?: number | { top, right, bottom, left }      // 边距（pt），默认 40
  fontPaths?: {                                       // 自定义字体路径（可选）
    regular?: string                                  // Regular 字体 URL，默认 '/fonts/Source_Han_Sans_SC_Regular.otf'
    bold?: string                                     // Bold 字体 URL，默认 '/fonts/Source_Han_Sans_SC_Bold.otf'
  }
  fontSubset?: boolean                                // 是否子集化字体，默认 true（false 嵌入完整字体，文件显著增大）
  canvasResolver?: (canvas) => string | ArrayBuffer | null // 自定义 canvas 图片来源（高清图表用），返回 data URL/ArrayBuffer，null 走默认逻辑
  canvasPixelRatio?: number                           // ECharts 自动探测兜底的像素比，默认 Math.max(2, devicePixelRatio)
}
```

**高清图表（ECharts 等）示例**：

canvas 默认直接栅格化导出，对 ECharts 这类图表会偏模糊（放大已绘制的位图不会变清晰）。用 `canvasResolver` 在源头按高像素比重绘：

```typescript
import * as echarts from 'echarts'

await htmlToPdf(element, {
  canvasResolver: (canvas) => {
    // 用 canvas 反查它所属的 ECharts 实例（多个图表各触发一次回调）
    const dom = canvas.closest('[_echarts_instance_]')
    const inst = dom && echarts.getInstanceByDom(dom)
    // 命中则源头 3 倍重绘，未命中返回 null 走默认逻辑
    return inst ? inst.getDataURL({ type: 'png', pixelRatio: 3, backgroundColor: '#fff' }) : null
  },
})
```

> 若项目把 echarts 挂在全局（`window.echarts`，如 CDN 引入），库会自动探测并高清重绘，无需写 `canvasResolver`。`import` 方式打包通常未挂全局，需用上面的钩子手动反查。

**自定义字体示例**：
```typescript
await htmlToPdf(element, {
  fontPaths: {
    regular: '/custom-fonts/MyFont-Regular.otf',
    bold: 'https://cdn.example.com/fonts/MyFont-Bold.otf'
  }
})
```

详见 [自定义字体文档](./docs/custom-fonts.md)。

## 多页文档

使用 `<PdfPage>` 组件标记分页位置，每个 `<PdfPage>` 对应一个 PDF 页面：

```vue
<PdfDocument>
  <PdfPage :page-number="1">
    <div>第一页内容</div>
  </PdfPage>

  <PdfPage :page-number="2">
    <div>第二页内容</div>
  </PdfPage>

  <PdfPage :page-number="3">
    <div>第三页内容</div>
  </PdfPage>
</PdfDocument>
```

**注意：**

- `PdfPage` 可以不是 `PdfDocument` 的直接子元素，允许在中间嵌套任意包装元素
- `PdfPage` 之间不可嵌套（一个 page 内部不能包含另一个 page）
- 每个 `PdfPage` 内部可包含任意 HTML 结构
- 不使用 `PdfPage` 时，整个容器导出为单页

## 支持的 HTML / CSS

| 类别 | 支持情况 |
| --- | --- |
| 文本 | 中英文混排、字号、颜色（hex / rgb / rgba） |
| 字重 | Regular / Bold（`font-weight` ≥ 600 使用 Bold 字体） |
| 斜体 | `italic` / `oblique`（通过 skew 变换模拟，无内嵌斜体字体） |
| 图片 | `<img>`（PNG / JPG，支持 data URL）、`<canvas>`（转 PNG 嵌入） |
| 盒子样式 | 背景色、透明度、边框（逐边）、圆角 |
| 伪元素 | `::before` / `::after`（仅背景色和边框，需明确尺寸，[详见文档](docs/pseudo-elements.md)） |
| 结构 | 表格、列表、引用、`<pre>`/`<code>`（保留换行） |
| 不支持 | emoji、阴影、渐变背景、变换、复杂 flex/grid 重排（按 DOM 实际位置绘制） |

渲染基于元素在页面上的**实际位置**进行坐标换算（px → pt，比例 0.75），因此布局应在导出前已稳定渲染。

## 开发

```bash
# 安装依赖
npm install

# 开发模式（启动示例 src/App.vue）
npm run dev

# 构建库（生成 dist + 类型声明）
npm run build

# 类型检查
npm run type-check
```

构建产物：`dist/index.mjs`（ESM）、`dist/index.d.ts`（类型）。仅提供 ESM 格式。

## 注意事项

1. **字体加载**：默认从 `public/fonts/` 加载思源黑体，缺失字体会导致中文无法渲染
2. **字体子集化**：默认启用以减小文件体积，可用 `fontSubset: false` 关闭
3. **坐标渲染**：基于 DOM 实际布局绘制，元素需先完成渲染
4. **样式覆盖**：支持基础样式，复杂效果（阴影、渐变等）不会被渲染
5. **多页支持**：使用 `<PdfPage>` 标记实现精确分页控制

## License

MIT
