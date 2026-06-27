# 自定义字体路径

## 问题背景

默认情况下，库会自动加载随包发布的思源黑体，按以下顺序降级，**无需任何配置**：

```text
1. /fonts/Source_Han_Sans_SC_*.otf        （应用自托管的本地路径）
2. https://registry.npmmirror.com/...       （国内镜像）
3. https://cdn.jsdelivr.net/...             （jsDelivr）
4. https://unpkg.com/...                    （国际兜底）
```

但以下场景仍需通过 `fontPaths` 自定义：
- 使用其他中文字体（如微软雅黑、阿里巴巴普惠体）
- 字体托管在自有 CDN / 私有源
- 应用部署在子目录，本地路径不是 `/fonts/`

> 一旦显式提供某字重的 `fontPaths`，就只使用该地址，加载失败会直接报错，不会回退到思源黑体或上述 CDN。

---

## 解决方案

使用 `fontPaths` 选项自定义字体路径。

### 基本用法

```typescript
import { htmlToPdf } from '@hmfw/html-to-pdf'

await htmlToPdf(element, {
  filename: 'document',
  fontPaths: {
    regular: '/custom-fonts/MyFont-Regular.otf',
    bold: '/custom-fonts/MyFont-Bold.otf'
  }
})
```

### 只覆盖部分路径

```typescript
// 只改 Regular；Bold 未指定，仍走默认的「本地 → CDN」降级加载
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/CustomFont-Regular.otf'
  }
})
```

### 从 CDN 加载

```typescript
await htmlToPdf(element, {
  fontPaths: {
    regular: 'https://cdn.example.com/fonts/SourceHanSans-Regular.otf',
    bold: 'https://cdn.example.com/fonts/SourceHanSans-Bold.otf'
  }
})
```

### 部署在子目录

```typescript
// 应用部署在 /app/ 子目录
await htmlToPdf(element, {
  fontPaths: {
    regular: '/app/fonts/Source_Han_Sans_SC_Regular.otf',
    bold: '/app/fonts/Source_Han_Sans_SC_Bold.otf'
  }
})
```

---

## 常见场景

### 1. 使用其他中文字体

#### 微软雅黑

```typescript
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/msyh.ttf',
    bold: '/fonts/msyhbd.ttf'
  }
})
```

⚠️ **注意**：微软雅黑是商业字体，使用前请确认授权。

#### 阿里巴巴普惠体（免费商用）

```typescript
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/Alibaba-PuHuiTi-Regular.otf',
    bold: '/fonts/Alibaba-PuHuiTi-Bold.otf'
  }
})
```

下载地址：[阿里巴巴普惠体](https://www.alibabafonts.com/)

#### 思源宋体

```typescript
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/SourceHanSerif-Regular.otf',
    bold: '/fonts/SourceHanSerif-Bold.otf'
  }
})
```

---

### 2. 使用环境变量

```typescript
const FONT_BASE_URL = import.meta.env.VITE_FONT_URL || '/fonts'

await htmlToPdf(element, {
  fontPaths: {
    regular: `${FONT_BASE_URL}/Source_Han_Sans_SC_Regular.otf`,
    bold: `${FONT_BASE_URL}/Source_Han_Sans_SC_Bold.otf`
  }
})
```

`.env` 文件：
```bash
# 开发环境
VITE_FONT_URL=/fonts

# 生产环境
VITE_FONT_URL=https://cdn.example.com/fonts
```

---

### 3. 动态切换字体

```typescript
const fontPresets = {
  sansSerif: {
    regular: '/fonts/Source_Han_Sans_SC_Regular.otf',
    bold: '/fonts/Source_Han_Sans_SC_Bold.otf'
  },
  serif: {
    regular: '/fonts/SourceHanSerif-Regular.otf',
    bold: '/fonts/SourceHanSerif-Bold.otf'
  },
  alibaba: {
    regular: '/fonts/Alibaba-PuHuiTi-Regular.otf',
    bold: '/fonts/Alibaba-PuHuiTi-Bold.otf'
  }
}

// 用户选择字体
const selectedFont = fontPresets[userPreference]

await htmlToPdf(element, {
  filename: 'document',
  fontPaths: selectedFont
})
```

---

## 字体文件要求

### 支持的格式

✅ `.otf`（OpenType Font）— **推荐**  
✅ `.ttf`（TrueType Font）  
❌ `.woff` / `.woff2`（Web 字体格式，不支持）

如果只有 `.woff2` 文件，需要转换为 `.otf` 或 `.ttf`：
- 在线转换：[CloudConvert](https://cloudconvert.com/woff2-to-otf)
- 本地转换：使用 [fonttools](https://github.com/fonttools/fonttools)

### 字体子集化

库**自动进行字体子集化**，只嵌入实际使用的字符，无需手动处理。

示例：
- 原始字体：16 MB
- 使用 500 个汉字后：约 200 KB

---

## 注意事项

### 1. 字体加载失败

如果自定义字体路径无效，会抛出错误：

```typescript
try {
  await htmlToPdf(element, {
    fontPaths: {
      regular: '/invalid-path/font.otf'
    }
  })
} catch (error) {
  console.error('字体加载失败:', error)
  // 回退到默认配置
}
```

**常见原因**：
- ❌ 路径拼写错误
- ❌ 文件不存在
- ❌ CORS 限制（跨域字体）
- ❌ 文件格式不支持（如 `.woff2`）

### 2. CORS 跨域问题

从 CDN 加载字体时，需要配置 CORS：

```nginx
# Nginx 配置
location /fonts/ {
    add_header Access-Control-Allow-Origin *;
}
```

或在 HTML 中使用 `crossorigin` 属性（对 `<link>` 标签有效，但本库直接 fetch 不需要）。

### 3. 字体授权

使用自定义字体前，请确认：
- ✅ 字体是免费商用（如思源黑体、阿里巴巴普惠体）
- ✅ 已购买商业授权（如方正字体）
- ❌ 不要使用未授权的商业字体（如微软雅黑、苹方）

**免费商用中文字体推荐**：
- [思源黑体](https://github.com/adobe-fonts/source-han-sans)（本库默认）
- [思源宋体](https://github.com/adobe-fonts/source-han-serif)
- [阿里巴巴普惠体](https://www.alibabafonts.com/)
- [站酷系列](https://www.zcool.com.cn/special/zcoolfonts/)
- [鸿蒙字体](https://developer.harmonyos.com/cn/design/resource)

### 4. 字重映射

库只使用 **Regular** 和 **Bold** 两个字重：
- `font-weight: 100-500` → Regular
- `font-weight: 600-900` → Bold

如果字体有更多字重（Light、Medium、Black），目前无法直接使用，需要修改源码。

---

## 高级用法（未来扩展）

### 支持更多字重

修改 `src/types.ts`：

```typescript
export interface PdfExportOptions {
  fontPaths?: {
    regular?: string
    bold?: string
    light?: string      // 新增
    medium?: string     // 新增
    black?: string      // 新增
  }
}
```

修改 `src/utils/pdfRenderer.ts` 的 `selectFont` 函数：

```typescript
function selectFont(ctx: RenderContext, hasChinese: boolean, fontWeight: string | number): PDFFont {
  if (!hasChinese) return ctx.latinFont

  let weight = typeof fontWeight === 'number' ? fontWeight : 400
  
  if (weight < 400 && ctx.chineseFontLight) return ctx.chineseFontLight
  if (weight >= 400 && weight < 600) return ctx.chineseFont ?? ctx.latinFont
  if (weight >= 600 && weight < 800 && ctx.chineseFontBold) return ctx.chineseFontBold
  if (weight >= 800 && ctx.chineseFontBlack) return ctx.chineseFontBlack
  
  return ctx.chineseFont ?? ctx.latinFont
}
```

### 从 ArrayBuffer 加载字体

适合字体已经通过其他方式加载（如 IndexedDB 缓存）：

```typescript
// 未来可能支持
export interface PdfExportOptions {
  fontPaths?: {
    regular?: string | ArrayBuffer
    bold?: string | ArrayBuffer
  }
}
```

---

## 示例项目配置

### Vite 项目

```typescript
// vite.config.ts
export default defineConfig({
  publicDir: 'public',  // 字体放在 public/fonts/
})

// 使用
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/MyFont-Regular.otf'
  }
})
```

### Next.js 项目

```typescript
// 字体放在 public/fonts/
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/MyFont-Regular.otf'
  }
})
```

### 相对路径

**不推荐使用相对路径**（如 `./fonts/xxx.otf`），因为：
- 在不同页面路由下，相对路径会改变
- 库内部使用 `fetch` 加载，相对路径基于当前页面 URL

**推荐使用绝对路径**（以 `/` 开头）或完整 URL。

---

## 总结

✅ 使用 `fontPaths` 选项自定义字体路径  
✅ 支持本地路径、CDN、子目录部署  
✅ 自动字体子集化，无需手动处理  
✅ 只覆盖需要改的路径，其余使用默认值  
⚠️ 注意字体授权和 CORS 问题  
⚠️ 仅支持 `.otf` 和 `.ttf` 格式

**API 设计原则**：
- 简洁：只需传递路径字符串
- 灵活：支持部分覆盖
- 兼容：不传则使用默认思源黑体
