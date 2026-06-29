# @hmfw/html-to-pdf

一个框架无关的 HTML 转 PDF 库，基于 [pdf-lib](https://github.com/Hopding/pdf-lib)，默认支持中文（思源黑体）。

通过解析 DOM 的真实布局（`getBoundingClientRect` / `Range`）直接绘制 PDF 内容，**不依赖 html2canvas**，因此导出的是可选中、可搜索的矢量文本，而非位图截图。

> **框架无关。** 包只导出一个工具函数 `htmlToPdf`，它只接收一个原生 DOM 元素，可在 Vue / React / 原生 JS 中直接使用。React / Vue2 / 原生用法详见 [多框架使用](#多框架使用)。

## 特性

- 框架无关：单个工具函数，任意框架可用，不牵入任何 UI 框架依赖
- 使用 pdf-lib 直接生成矢量 PDF（文本可选中、可搜索）
- 默认支持中文，内置思源黑体（Source Han Sans SC）
- **自动字体子集化**：只嵌入页面实际用到的字形，文件通常约 500KB
- 完整的 TypeScript 类型支持
- 支持多页文档（内容流**自动分页**，或 `data-pdf-page` 手动分页）
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

> 本库不依赖任何 UI 框架，在 Vue / React / 原生 JS 中用法相同。

## 浏览器支持

本库在浏览器端运行，依赖现代 DOM 与网络 API（`Range`、`getBoundingClientRect`、`AbortController`、可选链等），仅支持现代浏览器，**不支持 IE**：

| 浏览器 | 最低版本 |
|--------|---------|
| Chrome | 90 |
| Firefox | 88 |
| Safari | 14 |
| Edge | 90 |

## 字体配置

本库需要思源黑体文件才能正确渲染中文。字体随 npm 包一起发布（构建时复制到 `dist/fonts/`），**默认无需任何配置**。

运行时按以下顺序自动降级加载，兼顾国内网络与离线/内网部署，任一来源成功即停止：

1. `/fonts/Source_Han_Sans_SC_Regular.otf`（应用自托管的本地路径，离线/内网首选）
2. `https://registry.npmmirror.com/...`（国内镜像，淘宝）
3. `https://cdn.jsdelivr.net/...`（jsDelivr，国内有节点）
4. `https://unpkg.com/...`（国际兜底）

> 想完全离线 / 内网部署：把 `dist/fonts/` 下的两个 otf 放到你站点的 `/fonts/` 目录即可命中第 1 步，不再发起任何外部请求。

### 自定义字体

通过 `options.fontPaths` 指定自己的字体地址（本地路径或 CDN URL）。一旦指定，就只使用该地址，加载失败会直接报错，不会静默回退到思源黑体：

```ts
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/MyFont-Regular.otf',
    bold: '/fonts/MyFont-Bold.otf',
  },
})
```

> 当前 PDF 生成只使用 Regular 和 Bold 两个字重。`src/styles/fonts.css` 中声明的其它字重仅用于网页预览。


## 快速开始

包只导出一个函数 `htmlToPdf(element, options)`。它读取元素当前的真实布局生成 PDF，**生成后自动触发浏览器下载**，并返回 `{ success, blob? }` 方便你进一步处理（上传、预览等）。

```ts
import { htmlToPdf } from '@hmfw/html-to-pdf'

const result = await htmlToPdf(element, { filename: 'document' })
// 此时 PDF 已自动下载
if (result.success && result.blob) {
  // 如需自行处理，可使用 result.blob（上传、预览等）
}
```

Vue3 中拿到容器元素的 ref 后调用即可：

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

## 多框架使用

`htmlToPdf` 只接收一个原生 DOM 元素，不依赖任何框架。Vue / React / 原生 JS 都从同一入口引入这一个函数即可。

分页同样框架无关：给导出根元素加 `data-pdf`，给每个分页块加 `data-pdf-page`。属性名也以常量形式导出（`PDF_CONTAINER_ATTR` / `PDF_PAGE_ATTR`）。

完整示例见 [docs/multi-framework.md](docs/multi-framework.md)。最小用法：

```ts
// Vue / React / 原生 JS 通用
import { htmlToPdf } from '@hmfw/html-to-pdf'

async function handleExport(el: HTMLElement) {
  await htmlToPdf(el, { filename: 'document' })
}
```

```jsx
// React 示例
import { useRef } from 'react'
import { htmlToPdf } from '@hmfw/html-to-pdf'

function Report() {
  const ref = useRef(null)
  const onExport = () => htmlToPdf(ref.current, { filename: 'report' })
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
- ⚠️ 如果某些字符在思源黑体中不存在，会显示为方块并在控制台输出警告

设为 `fontSubset: false` 时嵌入完整字体（思源黑体每个字重约 16MB，PDF 会显著增大）：

```typescript
await htmlToPdf(element, { fontSubset: false })
```

**字符缺失问题**：如果 PDF 中出现方块字符，检查浏览器控制台是否有类似警告：

```
[html-to-pdf] 以下 3 个字符在字体 Source Han Sans SC Regular 中不存在，将显示为方块：
'某' (U+67D0), '些' (U+4E9B), '字' (U+5B57)
```

解决方法：
1. 确认这些字符是否真的需要（可能是隐藏的特殊字符）
2. 更换包含这些字符的自定义字体（通过 `options.fontPaths`）
3. 如果是罕见字或私有区字符，考虑替换为常用字

## API

### 入口与导出

包只有一个入口 `@hmfw/html-to-pdf`，导出内容：

| 导出 | 说明 |
| --- | --- |
| `htmlToPdf` | 唯一工具函数，框架无关 |
| `PDF_CONTAINER_ATTR`、`PDF_PAGE_ATTR` | DOM 标记常量 |
| `PdfExportOptions`、`PdfGenerateResult`、`ExportStatus` | TypeScript 类型 |

### 工具函数

- `htmlToPdf(element, options?): Promise<PdfGenerateResult>` — 读取元素真实布局生成 PDF，**自动触发浏览器下载**，并返回 `{ success, blob?, error? }`。

### DOM 标记常量（框架无关分页）

- `PDF_CONTAINER_ATTR` = `'data-pdf'` — 标记导出根元素
- `PDF_PAGE_ATTR` = `'data-pdf-page'` — 标记分页块

## 配置选项

### `PdfExportOptions`

```typescript
{
  filename?: string                                   // 文件名（不含扩展名），默认 'document'
  pageSize?: 'A4' | 'A3' | 'Letter'                   // 或自定义 { width, height }（单位 pt），默认 'A4'
  orientation?: 'portrait' | 'landscape'              // 页面方向，默认 'portrait'
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

库提供两种分页模式，按容器内是否有 `data-pdf-page` 标记**自动选择**。

### 自动分页（默认，无需标记）

不加任何分页标记时，内容超过一页会**按内容流自动分页**。切页时尽量落在段落、标题、图片、表格行等不可分割元素的边界上，避免文字被切成半行：

```html
<div data-pdf>
  <h1>很长的报告</h1>
  <p>第一段……</p>
  <!-- 内容超过一页时自动续到下一页 -->
  <table>...</table>
</div>
```

- 页边距「所见即所得」：直接由 `data-pdf` 容器自身的 CSS `padding` 推导。上下留白 = `padding-top` / `padding-bottom`，左右留白 = `padding-left` / `padding-right`。给容器设 `padding: 40px` 即可让四边都留白，浏览器预览与 PDF 一致，无需额外配置。
- 内容放得下时仍输出单页。
- 已知限制：跨页的容器背景/边框只绘制在起始页；单个元素本身高于一页内容区时会溢出页底（不再细分）；表头不会在每页重复。背景建议放在会被分页的叶子元素上而非大包装容器。

### 手动分页（data-pdf-page）

需要精确控制每页内容时，给导出根元素加 `data-pdf`，每个 `data-pdf-page` 标记一个 PDF 页面：

```html
<div data-pdf>
  <div data-pdf-page>
    <div>第一页内容</div>
  </div>

  <div data-pdf-page>
    <div>第二页内容</div>
  </div>

  <div data-pdf-page>
    <div>第三页内容</div>
  </div>
</div>
```

**注意：**

- 只要容器内存在任一 `data-pdf-page`，即进入手动分页模式（不再自动分页）
- `data-pdf-page` 可以不是 `data-pdf` 容器的直接子元素，允许在中间嵌套任意包装元素
- `data-pdf-page` 之间不可嵌套（一个 page 内部不能包含另一个 page）
- 每个 `data-pdf-page` 内部可包含任意 HTML 结构

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

构建产物：`dist/index.mjs`（ESM）、`dist/index.cjs`（CJS）、`dist/index.d.ts`（类型）。通过 `package.json` 的 `exports` 字段自动选择格式。

## 注意事项

1. **字体加载**：默认从 `public/fonts/` 加载思源黑体，缺失字体会导致中文无法渲染
2. **字体子集化**：默认启用以减小文件体积，可用 `fontSubset: false` 关闭
3. **坐标渲染**：基于 DOM 实际布局绘制，元素需先完成渲染
4. **样式覆盖**：支持基础样式,复杂效果（阴影、渐变等）不会被渲染
5. **多页支持**：默认按内容流自动分页；需要精确控制时用 `data-pdf-page` 标记手动分页

## 常见问题

### PDF 中出现方块字符

如果导出的 PDF 中某些字符显示为方块，通常是因为这些字符在思源黑体中不存在。

**诊断方法**：
1. 打开浏览器控制台，查看是否有类似警告：
```
[html-to-pdf] 以下字符在字体 Source Han Sans SC Regular 中不存在，将显示为方块：
'某' (U+67D0), '些' (U+4E9B)
```

**解决方法**：
1. **隐藏字符**：检查是否有不可见的特殊字符（零宽空格、变音符号等），清理或替换它们
2. **罕见字**：如果是生僻字或私有区字符（U+E000-U+F8FF），考虑替换为常用字或使用包含该字的自定义字体
3. **自定义字体**：通过 `options.fontPaths` 指定包含这些字符的字体文件
4. **关闭子集化**：临时使用 `fontSubset: false` 嵌入完整字体（会增大文件约 16MB）

```ts
// 使用自定义字体
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/MyFont-Regular.otf',
    bold: '/fonts/MyFont-Bold.otf',
  },
})
```

## License

MIT
