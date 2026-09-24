# 自定义字体路径

## 问题背景

库需要字体文件才能渲染中文。**默认情况下，库会尝试从 `/fonts/` 路径加载思源黑体**：

```text
/fonts/Source_Han_Sans_SC_Regular.woff
/fonts/Source_Han_Sans_SC_Bold.woff
```

**你需要将字体文件放到应用的 `public/fonts/` 目录**，或通过 `fonts` 注册表（推荐）/ `fontPaths`（已废弃）指定其他路径。

以下场景需要自定义字体路径：
- 使用其他中文字体（如微软雅黑、阿里巴巴普惠体）
- 字体托管在 CDN 或自定义路径
- 应用部署在子目录，本地路径不是 `/fonts/`
- 按元素 CSS `font-family` 还原不同字体（见「按 font-family 选字体」）

> 提供路径后，只使用指定路径，加载失败会直接报错（默认字体家族除外，其加载失败会回退内置思源黑体）。

---

## 推荐方案：fonts 注册表

`fonts` 是一张「CSS 字体名 → 字体文件路径（含字重）」的注册表。渲染时按元素计算样式的
`font-family` 候选链匹配本表选字体（忽略大小写与引号），实现「所见即所得」：

```typescript
import { htmlToPdf } from '@hmfw/html-to-pdf'

await htmlToPdf(element, {
  fonts: {
    // 保留键 default：未匹配任何注册字体、或用到通用族（sans-serif 等）时使用。
    // 不提供 default 时回退到内置思源黑体（可配合 basePath）。
    default: { regular: '/fonts/Source_Han_Sans_SC_Regular.woff', bold: '/fonts/Source_Han_Sans_SC_Bold.woff' },
    // 元素 font-family: 'Roboto' 命中此项
    Roboto:  { regular: '/fonts/Roboto-Regular.woff', bold: '/fonts/Roboto-Bold.woff' },
  },
})
```

- 每个家族 `regular` 必需、`bold` 可选（缺失时粗体降级为 Regular）。
- 每个字体按页面实际用到的字符做子集化，注册多个字体不会显著增大产物。
- 任何注册字体都可为其它字体补齐缺失字形（见「逐字形回退」）。

> `fontPaths: { regular, bold }` 仍可用，等价于 `fonts: { default: { regular, bold } }`，但**已废弃**；同时提供 `fonts.default` 时以 `fonts.default` 为准。下文示例中的 `fontPaths` 均可直接替换为 `fonts.default`。

---

## 解决方案（fontPaths，已废弃）

以下 `fontPaths` 用法仍然有效，等价于 `fonts: { default: {...} }`。

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
// 只改 Regular；Bold 未指定，仍走默认的 /fonts/ 路径
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

应用部署在子路径（非域名根目录，如 `https://example.com/app/`）时，内置思源黑体的默认路径 `/fonts/...` 会被解析到**域名根**而非应用根，导致字体 404。

推荐用 `basePath` 选项一处解决，它会自动为默认主字体带上前缀：

```typescript
// 无需自定义字体，仅传入部署 base 即可
await htmlToPdf(element, {
  basePath: import.meta.env.BASE_URL, // Vite：根目录为 '/'，子路径（base: '/app/'）为 '/app/'
  // Webpack（CRA/Vue CLI）用 process.env.PUBLIC_URL
})
```

或仍可用 `fontPaths` 手动拼出完整路径（`fontPaths` 是完整 URL，不受 `basePath` 影响）：

```typescript
// 应用部署在 /app/ 子目录
await htmlToPdf(element, {
  fontPaths: {
    regular: '/app/fonts/Source_Han_Sans_SC_Regular.woff',
    bold: '/app/fonts/Source_Han_Sans_SC_Bold.woff'
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
    regular: `${FONT_BASE_URL}/Source_Han_Sans_SC_Regular.woff`,
    bold: `${FONT_BASE_URL}/Source_Han_Sans_SC_Bold.woff`
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
    regular: '/fonts/Source_Han_Sans_SC_Regular.woff',
    bold: '/fonts/Source_Han_Sans_SC_Bold.woff'
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

✅ `.otf`（OpenType Font）  
✅ `.ttf`（TrueType Font）  
✅ `.woff`（Web Open Font Format）— **推荐用于 Web**  
❌ `.woff2`（需转换为上述格式）

如果只有 `.woff2` 文件，需要转换为支持的格式：
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

### 5. 繁体字库与简体内容

当使用繁体字库（如思源黑体繁体版 `Source Han Sans TC/HK`）导出包含简体字的内容时，会遇到缺字问题（简体字在繁体字库中不存在）。

有以下解决方案：

**方案 1：启用字符转换（推荐）**

```typescript
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/SourceHanSansHK-Regular.woff',  // 香港繁体字库
    bold: '/fonts/SourceHanSansHK-Bold.woff'
  },
  converterOptions: { from: 'cn', to: 'hk' }  // 简体→香港繁体
})

// 或台湾繁体
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/SourceHanSansTC-Regular.woff',  // 台湾繁体字库
    bold: '/fonts/SourceHanSansTC-Bold.woff'
  },
  converterOptions: { from: 'cn', to: 'tw' }  // 简体→台湾繁体
})
```

常用配置：
- `{ from: 'cn', to: 'hk' }`：简体→香港繁体（推荐）
- `{ from: 'cn', to: 'tw' }`：简体→台湾繁体
- `{ from: 'cn', to: 'twp' }`：简体→台湾繁体（含成语）
- `{ from: 'tw', to: 'cn' }`：繁体→简体（反向转换）

简体字（如"简体字"）会自动转换为繁体（"簡體字"）并使用繁体字库渲染。转换失败的字符会显示为方块。详见 [转换文档](converter.md)。

**方案 2：使用通用字库**

使用同时包含简繁体的字体（如 Noto Sans CJK），避免缺字问题。

---

## 按 font-family 选字体

在 `fonts` 注册表里登记多个字体后，渲染时会读取每个元素计算样式的 `font-family`，
按候选链顺序匹配注册表选字体（忽略大小写与引号），从而忠实还原页面排版：

```typescript
await htmlToPdf(element, {
  fonts: {
    default:  { regular: '/fonts/SourceHanSans-Regular.woff', bold: '/fonts/SourceHanSans-Bold.woff' },
    Roboto:   { regular: '/fonts/Roboto-Regular.woff', bold: '/fonts/Roboto-Bold.woff' },
    Merriweather: { regular: '/fonts/Merriweather-Regular.ttf' },
  },
})
```

对应页面：

```html
<p style="font-family: Roboto, sans-serif">用 Roboto 渲染</p>
<p style="font-family: Merriweather, serif">用 Merriweather 渲染</p>
<p style="font-family: sans-serif">通用族 → 使用 default</p>
<p>未指定 → 使用 default</p>
```

- 具体字体名命中注册表即用；未注册的具体字体名忽略（靠 default + 逐字形回退兜底）。
- 通用族（`serif` / `sans-serif` / `monospace` / `system-ui` 等）统一用 `default`。
- 字重仍按元素 `font-weight` 在所选家族的 Regular / Bold 间取（600+ 视为粗体）。

---

## 逐字形回退

所选字体可能缺少某些字符，最常见的是数学符号（`ℝ`、`∈`、`×`）、生僻符号等。这类字符既无法通过 `converterOptions` 简繁转换解决，所选字库里也没有字形，默认会渲染成方块。

只需把补充字形的字体也注册进 `fonts`——所选字体缺某字形时，会自动扫描注册表内**其它字体**补齐（镜像浏览器的 per-glyph fallback）：

```typescript
await htmlToPdf(element, {
  fonts: {
    // 纯符号兜底字体：不必被任何元素的 font-family 引用
    'Noto Sans Math': { regular: '/fonts/NotoSansMath-Regular.otf' },
    'STIX Two Math':  { regular: '/fonts/STIXTwoMath-Regular.otf' },
  },
})
```

工作方式：

- 仅对**所选字体缺失的字符**生效，已有字符仍用所选字体渲染。
- 按注册表顺序查找，取第一个包含该字符的字体；子集化只保留实际用到的字形，不会因兜底字体体积大而拖累产物。
- 兜底字符按其所在字体**自身的字重**渲染。符号字体通常只有一个字重，因此即使处于粗体上下文也不会额外加粗；如需粗体兜底，请直接提供粗体的字体文件。
- 可与 `converterOptions` 同时使用：转换优先，转换后仍缺失的字符再走逐字形回退。
- 若某字符在**所有**注册字体中都不存在，仍显示为方块，并在控制台输出一次汇总警告。

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

✅ 使用 `fonts` 注册表自定义字体（`fontPaths` 已废弃，仍兼容）  
✅ 按元素 CSS `font-family` 选字体，逐字形回退补齐缺失字形  
✅ 支持本地路径、CDN、子目录部署  
✅ 自动字体子集化，无需手动处理  
⚠️ 注意字体授权和 CORS 问题  
⚠️ 支持 `.otf`、`.ttf`、`.woff` 格式

**API 设计原则**：
- 所见即所得：按 `font-family` 还原页面字体
- 灵活：任意注册字体互为逐字形回退
- 兼容：不传则使用默认思源黑体
