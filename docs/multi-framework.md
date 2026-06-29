# 多框架使用指南

`@hmfw/html-to-pdf` 的核心是**框架无关**的：唯一的工具函数 `htmlToPdf` 只接收一个原生 DOM 元素，内部读取 DOM 的真实布局（`getBoundingClientRect` / `Range`）绘制矢量内容，不依赖任何 UI 框架。

包只有一个入口 `@hmfw/html-to-pdf`，导出：

| 导出 | 内容 |
| --- | --- |
| 工具函数 | `htmlToPdf` |
| 常量 | `PDF_CONTAINER_ATTR` / `PDF_PAGE_ATTR` |
| 类型 | `PdfExportOptions` / `PdfGenerateResult` / `ExportStatus` |

> 本库不依赖任何 UI 框架，Vue / React / 原生 JS 用法一致。

## 通用心智模型

无论哪个框架，导出流程都是两步：

1. 拿到要导出内容的**根 DOM 元素**（确保已渲染、可见、布局稳定）。
2. 调用 `htmlToPdf(element, options)`。它生成 PDF 后**自动触发浏览器下载**，并返回 `{ success, blob, error }`；如需自行处理（上传、预览等）可使用 `result.blob`。

### 分页（框架无关）

往 DOM 上加两个 data 属性即可分页，任何框架都一样：

- 导出根元素加 `data-pdf`
- 每个分页块加 `data-pdf-page`
- `data-pdf-page` 可以不是 `data-pdf` 的直接子元素，允许中间嵌套任意包装元素
- `data-pdf-page` 之间不可嵌套（一个 page 内部不能包含另一个 page）

也可以引入常量避免拼写错误：

```ts
import { PDF_CONTAINER_ATTR, PDF_PAGE_ATTR } from '@hmfw/html-to-pdf'
```

不加任何分页标记时，会按内容流**自动分页**：内容超过一页时自动切成多页，并尽量在段落、图片、表格行等不可分割元素的边界断页，避免半行被切断。内容放得下时仍是单页。页边距「所见即所得」——直接由容器自身的 CSS `padding` 推导（上下留白 = padding-top/bottom，左右 = padding-left/right），无需额外配置。需要精确控制分页位置时，改用 `data-pdf-page` 手动标记。

## 字体

字体加载与框架无关。**安装后需要手动配置字体路径**。

### 配置方法

从 `node_modules/@hmfw/html-to-pdf/public/fonts/` 复制字体到应用静态资源目录：

- Vite / CRA：放到 `public/fonts/`
- Next.js：放到 `public/fonts/`
- Vue CLI：放到 `public/fonts/`

确保以下文件可通过 `/fonts/` 路径访问：

- `Source_Han_Sans_SC_Regular.otf`（必需）
- `Source_Han_Sans_SC_Bold.otf`（必需）

或通过 `options.fontPaths` 指定 CDN 或自定义路径。详见 [字体配置](../README.md#字体配置)。

## React

利用 `useRef` 拿到 DOM 元素，调用工具函数即可：

```jsx
import { useRef, useState } from 'react'
import { htmlToPdf } from '@hmfw/html-to-pdf'

export function Report() {
  const contentRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | processing | success | error

  const handleExport = async () => {
    if (!contentRef.current) return
    setStatus('processing')
    const result = await htmlToPdf(contentRef.current, {
      filename: 'report',
      pageSize: 'A4',
      margin: 40
    })
    // PDF 已自动下载
    if (result.success) {
      setStatus('success')
    } else {
      console.error(result.error)
      setStatus('error')
    }
  }

  return (
    <div>
      <div ref={contentRef} data-pdf>
        <h1>标题</h1>
        <p>这是一段中文内容</p>
        <p>测试粗体：<strong>粗体文本</strong></p>
      </div>
      <button onClick={handleExport} disabled={status === 'processing'}>
        {status === 'processing' ? '生成中...' : '导出 PDF'}
      </button>
    </div>
  )
}
```

### React 多页

```jsx
<div ref={contentRef} data-pdf>
  <div data-pdf-page="1"><h1>第一页</h1></div>
  <div data-pdf-page="2"><h1>第二页</h1></div>
  <div data-pdf-page="3"><h1>第三页</h1></div>
</div>
```

## Vue2

直接调用工具函数，用 `ref` 拿元素：

```vue
<template>
  <div>
    <div ref="content" data-pdf>
      <h1>标题</h1>
      <p>这是一段中文内容</p>
    </div>
    <button :disabled="processing" @click="handleExport">
      {{ processing ? '生成中...' : '导出 PDF' }}
    </button>
  </div>
</template>

<script>
import { htmlToPdf } from '@hmfw/html-to-pdf'

export default {
  data() {
    return { processing: false }
  },
  methods: {
    async handleExport() {
      this.processing = true
      try {
        const result = await htmlToPdf(this.$refs.content, { filename: 'document' })
        // PDF 已自动下载
        if (!result.success) {
          console.error(result.error)
        }
      } finally {
        this.processing = false
      }
    }
  }
}
</script>
```

多页同 React：在 `data-pdf` 的后代元素中放置多个顶层的 `data-pdf-page="n"` 即可（不嵌套）。

## 原生 JS / 任意框架

```html
<div id="content" data-pdf>
  <h1>标题</h1>
  <p>这是一段中文内容</p>
</div>
<button id="export">导出 PDF</button>

<script type="module">
  import { htmlToPdf } from '@hmfw/html-to-pdf'

  document.getElementById('export').addEventListener('click', async () => {
    const el = document.getElementById('content')
    await htmlToPdf(el, { filename: 'document' })
    // PDF 已自动下载
  })
</script>
```

Angular、Svelte、Solid 等同理：拿到模板中的 DOM 元素引用（`@ViewChild` / `bind:this` / `ref` 等），传给 `htmlToPdf` 即可。

## 导出选项（`PdfExportOptions`）

所有框架共用同一套选项：

```ts
{
  filename?: string                                   // 文件名（不含扩展名），默认 'document'
  pageSize?: 'A4' | 'A3' | 'Letter'                   // 或自定义 { width, height }（单位 pt），默认 'A4'
  orientation?: 'portrait' | 'landscape'              // 页面方向，默认 'portrait'
  fontPaths?: { regular?, bold? }                     // 自定义字体路径（可选）
  fontFallback?: boolean                              // 使用自定义字体时，检测到缺字才按需加载后备字体（思源黑体），默认 true
  fontSubset?: boolean                                // 是否子集化字体，默认 true
  fontLoadTimeout?: number                            // 字体加载超时（毫秒），默认 30000（30 秒）。网络较慢时建议 45000-60000
  canvasResolver?: (canvas) => string | ArrayBuffer | null // 自定义 canvas 图片来源（高清图表），null 走默认逻辑
  canvasPixelRatio?: number                           // ECharts 自动探测兜底像素比，默认 Math.max(2, devicePixelRatio)
  debug?: boolean                                     // 是否输出性能报告，默认 false
}
```

返回值 `PdfGenerateResult`：`{ success: boolean; blob?: Blob; error?: Error }`。

## 注意事项

- 导出前内容必须**已完成布局且可见**（`display:none` / `visibility:hidden` 的元素会被跳过）。
- 字体子集化默认开启（可用 `fontSubset: false` 关闭），emoji 等符号会被过滤，不会嵌入也不会绘制。
- canvas 默认按当前像素栅格化；ECharts 等图表想要高清，用 `canvasResolver` 在源头 `getDataURL({ pixelRatio })` 重绘，或把 echarts 挂全局让库自动探测。
- 坐标按 DOM 实际位置换算（px → pt，比例 0.75），复杂效果（阴影、渐变、变换）不渲染。
- 支持的 HTML/CSS 范围详见根目录 README。
