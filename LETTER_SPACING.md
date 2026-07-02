# Letter Spacing 实现说明

## 概述

已为 `@hmfw/html-to-pdf` 添加 CSS `letter-spacing` 属性支持。

## 实现细节

### 1. 修改的文件

- `src/utils/render/text.ts`

### 2. 实现方式

#### 类型定义更新

- `DrawTextOptions` 接口新增 `letterSpacing?: number` 字段
- `RenderWithFallbackOptions` 接口新增 `letterSpacing?: number` 字段

#### 核心函数修改

**`drawStyledText` 函数**

- 现在返回绘制文本的总宽度（包含字符间距）
- 当 `letterSpacing` 存在且非零时：
  - 逐字符绘制文本
  - 每个字符后移 `charWidth + letterSpacing`
  - 最后一个字符后不添加间距
- 当没有 `letterSpacing` 时，保持原有的整段绘制逻辑（性能优化）
- 支持与斜体（italic）共存，每个字符都会应用 skew 变换

**`renderTextWithFallback` 函数**

- 接收 `letterSpacing` 参数并传递给 `drawStyledText`
- 使用 `drawStyledText` 返回的实际宽度更新 `currentX`
- 不再使用 `font.widthOfTextAtSize` 计算段宽度

**`renderTextNode` 函数**

- 从元素的 computed styles 读取 `letterSpacing` 值
- 将 CSS 像素值（px）转换为 PDF 点（pt）单位
- `normal` 值转换为 0
- 将 `letterSpacing` 传递给所有文本渲染调用

### 3. 支持场景

✅ 正常文本（无后备字体）  
✅ 带后备字体的文本（逐字符渲染）  
✅ 带字符映射的文本（简繁转换）  
✅ 粗体文本  
✅ 斜体文本  
✅ 粗体 + 斜体组合  
✅ `<pre>` 标签内的多行文本  
✅ 正字符间距（2px、5px 等）  
✅ 负字符间距（-1px 等）  
✅ 中英文混排  

### 4. 性能考虑

- 当 `letterSpacing` 为 0 或 `normal` 时，使用原有的整段绘制逻辑，避免不必要的逐字符绘制
- 只有明确设置了非零 `letter-spacing` 的元素才会触发逐字符渲染
- 在需要后备字体或字符映射时，本来就是逐字符处理，添加 `letter-spacing` 不会额外影响性能

### 5. 测试

示例中第 7 页（`.page-7`）已应用 `letter-spacing: 3px`，包含：
- 常见生僻字
- 古文与异体字
- 繁体字
- 姓氏生僻字
- 地名与专有名词
- 诗词常见字

可通过 `npm run dev` 查看并导出 PDF 验证效果。

### 6. 文档更新

- ✅ `README.md` 更新特性列表，添加"字符间距（letter-spacing）"
- ✅ `CLAUDE.md` 已在架构说明中提到渲染核心支持样式特性

## 使用示例

```html
<div data-pdf>
  <div data-pdf-page>
    <!-- 普通间距 -->
    <p>正常文本</p>
    
    <!-- 2px 字符间距 -->
    <p style="letter-spacing: 2px">宽松的字符间距</p>
    
    <!-- 5px 字符间距 -->
    <p style="letter-spacing: 5px">更宽松的间距</p>
    
    <!-- 负间距 -->
    <p style="letter-spacing: -1px">紧凑的间距</p>
    
    <!-- 组合使用 -->
    <p style="letter-spacing: 3px; font-weight: bold; font-style: italic">
      粗斜体 + 字符间距
    </p>
  </div>
</div>
```

## 技术细节

### 坐标计算

```typescript
// 字符宽度 + letter-spacing（最后一个字符后不加间距）
currentX += charWidth
if (i < chars.length - 1) {
  currentX += letterSpacing
}
```

### 单位转换

```typescript
// CSS px → PDF pt (比例 0.75)
const letterSpacing = letterSpacingPx && letterSpacingPx !== 'normal'
  ? pxToPt(parseFloat(letterSpacingPx))
  : 0
```

### 斜体变换

当同时存在 `italic` 和 `letterSpacing` 时，每个字符都会应用独立的 skew 变换：

```typescript
page.pushOperators(
  pushGraphicsState(),
  concatTransformationMatrix(1, 0, 0, 1, currentX, y),
  concatTransformationMatrix(1, 0, tan, 1, 0, 0),
  concatTransformationMatrix(1, 0, 0, 1, -currentX, -y),
)
page.drawText(char, { x: currentX, y, font, size, ...rest })
page.pushOperators(popGraphicsState())
```

## 已知限制

- 由于采用逐字符绘制，设置了非零 `letter-spacing` 的文本会产生更多 PDF 操作符
- PDF 文件大小会略有增加（每个字符独立定位）
- 对于非常大的文本块，建议只在需要时使用 `letter-spacing`

## Bug 修复

### 前导空格导致的偏移问题

在实现 `letter-spacing` 时发现并修复了一个已存在的问题：

**问题描述**：当文本节点包含前导空格时，`measureVisualLines` 函数返回的 `left` 坐标是浏览器测量的实际文字左边界（已跳过前导空格），但 `text` 字段仍包含前导空格。在逐字符渲染时，会先绘制前导空格，导致实际文字向右偏移。

**解决方案**：
1. 在 `flush` 函数中 trim 文本
2. 测量前导空格的宽度并调整 `left` 坐标
3. 只存储 trimmed 后的文本和调整后的坐标

这确保了文本起始位置准确，无论是否有 `letter-spacing`。
