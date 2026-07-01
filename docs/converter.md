# 字符转换功能说明

## 概述

当使用繁体中文字库（如思源黑体繁体版）导出包含简体字的内容时，或使用简体字库导出包含繁体字的内容时，会因为字库缺失字符而导致：

1. 字符显示为方块（缺失字形）
2. 需要额外加载后备字体（增加文件大小和加载时间）

为解决这个问题，库集成了 `opencc-js` 进行字符转换。配置后，遇到字库中不存在的字符时，会自动按配置转换（如简体→繁体），使用转换后的字形渲染。

## 使用方法

### 基本用法

在调用 `htmlToPdf` 时，传递 `converterOptions` 配置对象。**推荐配置为简体→香港繁体**：

```typescript
import { htmlToPdf } from '@hmfw/html-to-pdf'

const element = document.querySelector('#content')

await htmlToPdf(element, {
  filename: '繁体文档',
  fontPaths: {
    regular: '/fonts/SourceHanSansHK-Regular.otf',  // 香港繁体字库
    bold: '/fonts/SourceHanSansHK-Bold.otf'
  },
  converterOptions: { from: 'cn', to: 'hk' },  // 简体→香港繁体
  fontFallback: false  // 可选：关闭后备字体，完全依赖转换
})
```

### 常用配置

| 配置 | 说明 | 适用场景 |
|------|------|----------|
| `{ from: 'cn', to: 'hk' }` | 简体→香港繁体 | 使用香港繁体字库（推荐） |
| `{ from: 'cn', to: 'tw' }` | 简体→台湾繁体 | 使用台湾繁体字库 |
| `{ from: 'cn', to: 'twp' }` | 简体→台湾繁体（含成语） | 台湾繁体，需要精确成语转换 |
| `{ from: 'cn', to: 't' }` | 简体→标准繁体 | 通用繁体字库 |
| `{ from: 'tw', to: 'cn' }` | 台湾繁体→简体 | 使用简体字库但内容是繁体 |
| `{ from: 'hk', to: 'cn' }` | 香港繁体→简体 | 使用简体字库但内容是香港繁体 |

详细文档请查看完整版本。
