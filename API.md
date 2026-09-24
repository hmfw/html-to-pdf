# API 使用说明

## 唯一函数：`htmlToPdf`

将 HTML 元素转换为 PDF 并自动下载。

```typescript
import { htmlToPdf } from '@hmfw/html-to-pdf'

// 生成 PDF 并自动下载
await htmlToPdf(element, {
  filename: 'my-document'
})

// 也可以获取返回的 blob（已自动下载）
const result = await htmlToPdf(element, {
  filename: 'my-document'
})

if (result.success && result.blob) {
  // 可以用 blob 做其他事情，比如上传到服务器
  const formData = new FormData()
  formData.append('pdf', result.blob, 'document.pdf')
  await fetch('/api/upload', { method: 'POST', body: formData })
}
```

## 完整选项

```typescript
interface PdfExportOptions {
  /** PDF 文件名（不含扩展名），默认 'document' */
  filename?: string
  
  /** 页面尺寸，默认 'A4' */
  pageSize?: 'A4' | 'A3' | 'Letter' | { width: number; height: number }
  
  /** 页面方向，默认 'portrait' */
  orientation?: 'portrait' | 'landscape'
  
  /**
   * 字体注册表：CSS 字体名 → 字体文件路径（含字重）。
   *
   * 渲染时按元素计算样式的 font-family 候选链匹配本表选字体（忽略大小写与引号），
   * 实现「所见即所得」的字体还原；通用族（serif/sans-serif/monospace 等）用 default。
   *
   * 逐字形回退：所选字体缺某字形时，自动扫描注册表内其它字体补齐（镜像浏览器
   * per-glyph fallback）。把数学/符号字体也注册进来即可充当兜底（哪怕无元素引用它）。
   *
   * 保留键 'default'：未匹配任何注册字体、或用到通用族时使用；不提供 'default'
   * 时回退到内置思源黑体（可配合 basePath）。
   */
  fonts?: Record<string, { regular: string; bold?: string }>

  /**
   * @deprecated 请改用 fonts。等价于 fonts: { default: { regular, bold } }。
   * 自定义默认字体路径（可选，默认尝试 /fonts/ 路径）。同时提供 fonts.default 时被忽略。
   */
  fontPaths?: {
    regular?: string  // 默认 '/fonts/Source_Han_Sans_SC_Regular.woff'
    bold?: string     // 默认 '/fonts/Source_Han_Sans_SC_Bold.woff'
  }

  /**
   * 部署基础路径，默认 '/'。
   *
   * 应用部署在子路径（非域名根目录）时，传入应用 base（如 Vite 的
   * import.meta.env.BASE_URL），默认字体路径 /fonts/... 会自动带上该前缀，
   * 避免被解析到域名根而 404。作用于未指定路径时加载的内置默认字体；
   * 显式提供的 fonts / fontPaths 路径是完整 URL，不受影响。
   */
  basePath?: string
  
  /** 是否子集化字体，默认 true。false 时嵌入完整字体（文件显著增大） */
  fontSubset?: boolean
  
  /**
   * 字体加载超时时间（毫秒），默认 30000（30 秒）
   * 
   * 字体文件较大（思源黑体约 16-17MB），在网络较慢时需要更长加载时间：
   * - 桌面宽带用户：30000（30 秒）已足够
   * - 移动网络用户：建议 45000-60000（45-60 秒）
   */
  fontLoadTimeout?: number
  
  /**
   * 自定义 <canvas> 的图片数据来源（用于高清图表导出）
   * 
   * 返回 data URL 字符串或 ArrayBuffer（PNG/JPEG 数据）替换默认栅格，
   * 返回 null/undefined 则回退到内部逻辑。
   */
  canvasResolver?: (canvas: HTMLCanvasElement) => 
    string | ArrayBuffer | null | undefined | Promise<string | ArrayBuffer | null | undefined>
  
  /**
   * 内部 ECharts 自动探测兜底时使用的像素比
   * 默认 Math.max(2, devicePixelRatio)
   */
  canvasPixelRatio?: number
  
  /**
   * 是否在控制台输出性能报告（默认 false）
   */
  debug?: boolean
}
```

## HTML 标记

用 `data-pdf` 标记导出容器。分页有两种模式，按容器内是否含 `data-pdf-page` 自动选择：

- **自动分页**（容器内无 `data-pdf-page`）：内容超过一页时按内容流自动切页，尽量在段落/图片/表格行边界断页；页边距由容器自身的 CSS `padding` 推导（所见即所得）。
- **手动分页**（含 `data-pdf-page`）：每个 `data-pdf-page` 对应一个 PDF 页面，精确可控。

```html
<!-- 自动分页：只标记容器，内容超长自动续页 -->
<div data-pdf>
  <h1>长文档</h1>
  <p>内容...</p>
</div>

<!-- 手动分页：每个 data-pdf-page 一页 -->
<div data-pdf>
  <!-- 第 1 页 -->
  <div data-pdf-page>
    <h1>页面 1</h1>
    <p>内容...</p>
  </div>
  
  <!-- 第 2 页 -->
  <div data-pdf-page>
    <h1>页面 2</h1>
    <p>内容...</p>
  </div>
</div>
```

也可以导入常量：

```typescript
import { PDF_CONTAINER_ATTR, PDF_PAGE_ATTR } from '@hmfw/html-to-pdf'

// PDF_CONTAINER_ATTR === 'data-pdf'
// PDF_PAGE_ATTR === 'data-pdf-page'
```

## 框架使用示例

### Vue 3
```vue
<template>
  <div>
    <div ref="pdfContainer" data-pdf>
      <div data-pdf-page>
        <h1>我的文档</h1>
        <p>内容...</p>
      </div>
    </div>
    <button @click="handleExport">导出 PDF</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { htmlToPdf } from '@hmfw/html-to-pdf'

const pdfContainer = ref(null)

async function handleExport() {
  await htmlToPdf(pdfContainer.value, {
    filename: 'my-document'
  })
}
</script>
```

### React
```jsx
import { useRef } from 'react'
import { htmlToPdf } from '@hmfw/html-to-pdf'

function App() {
  const pdfContainerRef = useRef(null)
  
  const handleExport = async () => {
    await htmlToPdf(pdfContainerRef.current, {
      filename: 'my-document'
    })
  }
  
  return (
    <div>
      <div ref={pdfContainerRef} data-pdf>
        <div data-pdf-page>
          <h1>我的文档</h1>
          <p>内容...</p>
        </div>
      </div>
      <button onClick={handleExport}>导出 PDF</button>
    </div>
  )
}
```

### 原生 JavaScript
```html
<div id="pdf-container" data-pdf>
  <div data-pdf-page>
    <h1>我的文档</h1>
    <p>内容...</p>
  </div>
</div>
<button id="export-btn">导出 PDF</button>

<script type="module">
import { htmlToPdf } from '@hmfw/html-to-pdf'

document.getElementById('export-btn').addEventListener('click', async () => {
  const element = document.getElementById('pdf-container')
  await htmlToPdf(element, {
    filename: 'my-document'
  })
})
</script>
```
