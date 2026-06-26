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
  
  /** 边距（pt），默认 40 */
  margin?: number | { top: number; right: number; bottom: number; left: number }
  
  /** 自定义字体路径（可选，覆盖默认思源黑体） */
  fontPaths?: {
    regular?: string
    bold?: string
  }
  
  /** 是否子集化字体，默认 true。false 时嵌入完整字体（文件显著增大） */
  fontSubset?: boolean
}
```

## HTML 标记

使用 `data-pdf` 和 `data-pdf-page` 属性标记导出内容：

```html
<!-- 标记整个导出容器 -->
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
