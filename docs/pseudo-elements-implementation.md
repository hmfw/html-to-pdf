# 伪元素支持实现总结

## 实现内容

为 `@hmfw/html-to-pdf` 添加了 **简化版** `::before` 和 `::after` 伪元素支持。

## 修改的文件

### 核心实现

1. **[src/utils/pdfRenderer.ts](../src/utils/pdfRenderer.ts)**
   - 新增函数 `drawPseudoElement()` - 检测并绘制伪元素的背景色和边框
   - 修改 `renderHTML()` - 在元素前后调用伪元素绘制
   - 渲染顺序：`::before` → 元素背景 → 元素边框 → 子元素 → `::after`

### 文档

2. **[docs/pseudo-elements.md](../docs/pseudo-elements.md)** - 详细的使用文档
   - 支持的属性列表
   - 使用示例
   - 限制说明
   - 替代方案

3. **[README.md](../README.md)** - 添加特性说明
   - 在"特性"列表中添加伪元素支持
   - 在"支持的 HTML / CSS"表格中添加伪元素行

### 示例

4. **[src/App.vue](../src/App.vue)** - 添加伪元素演示
   - 装饰条卡片（`::before`）
   - 角标盒子（`::after`）

5. **[examples/pseudo-elements.html](../examples/pseudo-elements.html)** - 独立测试页面
   - 多种伪元素装饰效果演示

## 功能特性

### ✅ 支持

- `display: block` / `inline-block` 的伪元素
- 背景色（`background-color`）
- 边框（`border`、`border-width`、`border-color`、`border-style`）
- 圆角（`border-radius`）
- 明确的 `width` 和 `height`
- `padding-top` 和 `padding-left`（影响定位）

### ❌ 限制

- 不绘制 `content` 文本内容
- 不支持 `display: inline`
- 不支持 `height: auto`
- 不支持背景图片
- 不支持复杂定位（`position: absolute` + `transform`）
- 坐标通过估算而非真实布局

## 技术要点

### 坐标估算逻辑

```typescript
// ::before - 在元素顶部
pseudoX = element.left + paddingLeft
pseudoY = element.top + paddingTop

// ::after - 在元素底部
pseudoX = element.left + paddingLeft
pseudoY = element.top + element.height + paddingTop
```

### 检测逻辑

```typescript
const styles = window.getComputedStyle(element, '::before')
// 检查 content !== 'none' && display !== 'none'
// 检查 width 和 height 是否明确设置
```

### 渲染顺序

1. `::before` 伪元素（背景 + 边框）
2. 元素自身背景
3. 元素自身边框
4. 子元素（递归）
5. `::after` 伪元素（背景 + 边框）

## 使用示例

```vue
<template>
  <PdfDocument ref="pdfRef">
    <div class="card">内容</div>
  </PdfDocument>
</template>

<style>
.card::before {
  content: '';
  display: block;
  width: 4px;
  height: 40px;
  background-color: #3b82f6;
  border-radius: 2px;
}
</style>
```

## 验证

- ✅ 类型检查通过（`npm run type-check`）
- ✅ 添加了文档和示例
- ✅ 在 App.vue 中添加了测试用例

## 后续改进建议

1. **支持 content 文本渲染**：解析 `content: "文本"`，调用 `renderTextNode` 绘制
2. **支持更多 display 类型**：`inline`、`flex` 等
3. **改进坐标估算**：处理 `position: absolute`、`transform` 等
4. **支持背景图片**：`background-image` 的渲染
5. **自动计算 auto 尺寸**：根据 content 内容推算高度

## 注意事项

- 伪元素支持标记为 **实验性**
- 坐标是估算值，可能与浏览器实际渲染有偏差
- 建议复杂装饰使用真实 DOM 元素代替伪元素
