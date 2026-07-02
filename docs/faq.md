# 常见问题

## PDF 中出现 ⛝ 字符

如果导出的 PDF 中某些字符显示为 ⛝ (U+26DD)，通常是因为这些字符在字体中不存在。

### 检查问题

查看浏览器控制台是否有类似警告：
```
[html-to-pdf] 以下 N 个字符在字体 Source Han Sans SC Regular 中不存在，将显示为 ⛝ (U+26DD)：
'某' (U+67D0), '些' (U+4E9B)
```

### 解决方法

#### 1. 使用字符转换（推荐）

如果是简繁体混用问题，配置 `converterOptions` 进行字符转换：

```ts
await htmlToPdf(element, {
  fontPaths: {
    regular: '/fonts/SourceHanSansHK-Regular.otf',
    bold: '/fonts/SourceHanSansHK-Bold.otf',
  },
  converterOptions: { from: 'cn', to: 'hk' }  // 简体→繁体
})
```

常用配置：
- `{ from: 'cn', to: 'hk' }`：简体→香港繁体（推荐）
- `{ from: 'cn', to: 'tw' }`：简体→台湾繁体
- `{ from: 'tw', to: 'cn' }`：繁体→简体

详见 [字符转换文档](converter.md)。

#### 2. 使用完整字体

使用包含所需全部字符的字体（如 Noto Sans CJK）。

#### 3. 清理特殊字符

检查是否有不可见的特殊字符（零宽空格、变音符号等），清理或替换它们。

常见隐藏字符：
- 零宽空格 (U+200B)
- 零宽不连字 (U+200C)
- 零宽连字 (U+200D)
- 字节顺序标记 (U+FEFF)

#### 4. 替换生僻字

如果是生僻字或私有区字符（U+E000-U+F8FF），考虑：
- 替换为常用字
- 使用包含该字的自定义字体

#### 5. 关闭子集化（临时方案）

临时使用 `fontSubset: false` 嵌入完整字体（会增大文件约 13-14MB）：

```ts
await htmlToPdf(element, { fontSubset: false })
```

## 字体加载失败

### 错误信息

```
字体加载失败（regular）：
/fonts/Source_Han_Sans_SC_Regular.woff → HTTP 404
```

### 常见原因

1. **字体文件未托管**
   - 从 [GitHub 仓库](https://github.com/hmfw/html-to-pdf/tree/main/public/fonts) 下载字体文件
   - 放到应用的 `public/fonts/` 目录

2. **路径错误**
   - 检查字体文件路径是否正确
   - 使用浏览器开发者工具查看实际请求的 URL

3. **部署在子路径**
   - 应用部署在子路径（如 `/app/`）时，使用 `basePath` 选项：
   ```ts
   await htmlToPdf(element, {
     basePath: import.meta.env.BASE_URL  // Vite
   })
   ```

4. **CORS 跨域问题**
   - 从 CDN 加载字体时，确保 CDN 配置了 CORS 头
   - 检查 Network 面板是否有 CORS 错误

详见 [自定义字体文档](custom-fonts.md)。

## 容器宽度设置

### 为什么需要设置宽度？

库会读取元素的真实布局（`getBoundingClientRect`）并按 1:1 映射到 PDF 坐标：
- 容器宽度过宽（如 1200px）→ 内容超出 A4 页面右侧边界被裁剪
- 容器宽度过窄 → 浪费 PDF 页面空间
- 设置 `max-width` 而非 `width` → 小屏幕设备上容器会自适应收缩

### 常用页面尺寸对应的容器宽度

基于 px → pt 换算比例 0.75：

| 页面尺寸 | PDF 宽度 (pt) | 推荐容器宽度 (px) | CSS 设置 |
|---------|--------------|-----------------|---------|
| A4 纵向 | 595.28 | 794 | `max-width: 794px` |
| A4 横向 | 841.89 | 1123 | `max-width: 1123px` |
| A3 纵向 | 841.89 | 1123 | `max-width: 1123px` |
| Letter | 612 | 816 | `max-width: 816px` |

### 示例

```css
.pdf-document {
  max-width: 794px;  /* A4 纸张宽度 */
  margin: 0 auto;    /* 居中显示 */
  padding: 40px;     /* 页边距（自动分页时生效） */
  background: white;
  box-sizing: border-box;
}
```

```html
<div data-pdf class="pdf-document">
  <h1>标题</h1>
  <p>内容会按 794px 宽度布局，导出后完美适配 A4 纸张</p>
</div>
```

## 字体子集化说明

### 什么是字体子集化？

字体子集化是指只嵌入页面实际使用的字符，而不是整个字体文件。

### 效果对比

- 原始字体：约 13-14 MB
- 子集化后：通常约 **500KB**（500 个常用汉字）

### 默认行为

字体子集化**默认开启**（`fontSubset: true`）：
- 自动扫描内容中实际使用的字符
- 只嵌入需要的字形
- 支持中英文、标点、数字等常用字符
- ⚠️ 不支持 emoji 等符号，会被自动过滤（不会嵌入也不会绘制）
- ⚠️ 如果某些字符在思源黑体中不存在，会显示为 ⛝ (U+26DD) 并在控制台输出警告

### 关闭子集化

设为 `fontSubset: false` 时嵌入完整字体（思源黑体每个字重约 13-14MB，PDF 会显著增大）：

```typescript
await htmlToPdf(element, { fontSubset: false })
```

**何时关闭子集化？**
- 字体子集化对个别字体/字形有兼容问题
- 需要 PDF 支持动态内容修改（如表单填写）
- 文件大小不敏感

## 部署到生产环境

### 检查清单

- [ ] 字体文件已托管到静态资源目录
- [ ] 字体路径可通过浏览器访问（测试 `/fonts/Source_Han_Sans_SC_Regular.woff`）
- [ ] 子路径部署时配置了 `basePath`
- [ ] CDN 加载字体时配置了 CORS
- [ ] 测试导出功能正常

### 性能优化

1. **使用 CDN 托管字体**
   ```ts
   await htmlToPdf(element, {
     fontPaths: {
       regular: 'https://cdn.example.com/fonts/Source_Han_Sans_SC_Regular.woff',
       bold: 'https://cdn.example.com/fonts/Source_Han_Sans_SC_Bold.woff',
     }
   })
   ```

2. **启用 HTTP/2**
   - 多个字体文件可并行加载

3. **增加字体加载超时**（移动网络环境）
   ```ts
   await htmlToPdf(element, {
     fontLoadTimeout: 60000  // 60 秒（默认 30 秒）
   })
   ```

## 浏览器兼容性

本库仅支持现代浏览器，**不支持 IE**：

| 浏览器 | 最低版本 | 备注 |
|--------|---------|------|
| Chrome | 90 | ✅ 完全支持 |
| Firefox | 88 | ✅ 完全支持 |
| Safari | 14 | ✅ 完全支持 |
| Edge | 90 | ✅ 完全支持 |
| IE | ❌ | 不支持 |

**依赖的现代特性**：
- `Range` API（精确定位文本）
- `getBoundingClientRect`（获取真实布局）
- `fetch` + `AbortController`（字体加载）
- 可选链操作符 (`?.`)
- ES2020+ 特性

## 支持的 HTML / CSS 特性

### 完全支持

| 特性 | 说明 |
|------|------|
| 文本 | 中英文混排、字号、颜色（hex / rgb / rgba） |
| 字重 | Regular / Bold（`font-weight` ≥ 600 使用 Bold） |
| 斜体 | `italic` / `oblique`（通过 skew 变换模拟） |
| 图片 | `<img>`（PNG / JPG / SVG）、`<canvas>`、内联 `<svg>` |
| 盒子 | 背景色、透明度、边框（逐边）、圆角 |
| 结构 | 表格、列表、引用、`<pre>`/`<code>`（保留换行） |
| 间距 | `letter-spacing`（字符间距） |
| 对齐 | `text-align`（left / center / right） |

### 实验性支持

| 特性 | 说明 | 限制 |
|------|------|------|
| `::before` / `::after` | 伪元素 | 仅背景色和边框，需明确尺寸 |

详见 [伪元素文档](pseudo-elements.md)。

### 不支持

- Emoji（会被过滤）
- 阴影 (`box-shadow` / `text-shadow`)
- 渐变背景 (`linear-gradient` / `radial-gradient`)
- CSS 变换 (`transform`)
- 复杂 flex/grid 重排（按 DOM 实际位置绘制）
- 动画 / 过渡效果

## 多页文档已知限制

### 自动分页限制

- 跨页的容器背景/边框只绘制在起始页
- 单个块高于一页内容区时会溢出底部（不再细分）
- 表头不会在每页重复

**建议**：
- 背景放在会被分页的叶子元素上，而非大包装容器
- 避免单个块（段落、图片等）过高
- 需要重复表头时使用手动分页

### 手动分页注意事项

- `data-pdf-page` 之间不能嵌套
- 每个 page 的内容应完整适配一页（不会自动截断）

## 获取帮助

- **文档**：[docs/](https://github.com/hmfw/html-to-pdf/tree/main/docs)
- **Issues**：[GitHub Issues](https://github.com/hmfw/html-to-pdf/issues)
- **示例**：运行 `npm run dev` 查看完整示例
