# PDF 渲染层级与顺序说明

## pdf-lib 的层级机制

pdf-lib **不支持 z-index**，完全依赖**绘制顺序**决定层级：

```
先绘制的内容 → 在底层
后绘制的内容 → 在顶层（会覆盖先绘制的）
```

这与 HTML Canvas 的绘制逻辑相同。

---

## CSS 标准的层叠顺序

根据 CSS 规范，一个元素的完整层叠顺序（由底到顶）：

```
1. 元素背景（background）
2. 元素边框（border）
3. ::before 伪元素
4. 子元素内容（包括文本、子元素、图片等）
5. ::after 伪元素
```

---

## 本库的实现

`src/utils/pdfRenderer.ts` 的 `renderHTML` 函数按照 CSS 规范的顺序绘制：

```typescript
export async function renderHTML(ctx: RenderContext, element: HTMLElement): Promise<void> {
  // ... 省略检查代码

  const box = resolveBox(ctx, element)
  if (box) {
    // 1. 绘制背景
    drawElementFill(element, box)

    // 2. 绘制边框
    drawElementBorders(element, box)

    // 3. 特殊处理：img/canvas
    if (tagName === 'img' || tagName === 'canvas') {
      // 图片/Canvas 绘制在边框之上
      await renderImage(...)
      // ::before 绘制在图片之上
      drawPseudoElement(ctx, element, '::before')
      return
    }

    // 4. 绘制 ::before 伪元素
    drawPseudoElement(ctx, element, '::before')
  }

  // 5. 递归绘制子元素（文本、子元素）
  for (const child of element.childNodes) {
    // ...
  }

  // 6. 绘制 ::after 伪元素
  if (box) {
    drawPseudoElement(ctx, element, '::after')
  }
}
```

### 关键点

1. **背景和边框最先绘制**，确保它们在底层
2. **`::before` 在边框之后、子元素之前绘制**，符合 CSS 规范
3. **`::after` 最后绘制**，确保它在所有内容之上
4. **图片/Canvas 的特殊处理**：先画图片，再画 `::before`，这样伪元素可以作为图片的装饰层

---

## 常见问题

### Q1: 为什么我的伪元素被边框遮挡了？

A: 检查渲染顺序是否正确。边框应该在 `::before` **之前**绘制。

**错误示例**：
```typescript
drawPseudoElement(ctx, element, '::before')  // 先画伪元素
drawElementBorders(element, box)             // 后画边框 ← 会覆盖伪元素
```

**正确做法**：
```typescript
drawElementBorders(element, box)             // 先画边框
drawPseudoElement(ctx, element, '::before')  // 后画伪元素 ← 不会被遮挡
```

---

### Q2: 可以让 `::before` 在背景之下吗？

A: 可以，但这**不符合 CSS 规范**。如果确实需要：

```typescript
// 修改 renderHTML 函数
drawPseudoElement(ctx, element, '::before')  // 先画伪元素（底层）
drawElementFill(element, box)                // 后画背景（覆盖伪元素）
```

但建议**使用独立元素代替伪元素**，而不是违反 CSS 规范。

---

### Q3: 如何让某个元素显示在所有内容之上？

A: pdf-lib 没有 z-index，只能通过**调整绘制顺序**：

**方案 A：延迟绘制**
```typescript
// 先绘制其他内容
await renderHTML(ctx, mainContent)

// 最后绘制需要置顶的元素
await renderHTML(ctx, topElement)
```

**方案 B：使用 `::after` 伪元素**
```typescript
// ::after 本身就在所有内容之上
<div class="container">
  <div class="content">内容</div>
  <!-- ::after 会显示在 .content 之上 -->
</div>
```

---

### Q4: 如何调试渲染顺序？

在 `renderHTML` 函数中添加 console.log：

```typescript
export async function renderHTML(ctx: RenderContext, element: HTMLElement): Promise<void> {
  const tagName = element.tagName.toLowerCase()
  const className = element.className

  console.log(`[渲染] ${tagName}.${className}`)

  if (box) {
    console.log('  → 背景')
    drawElementFill(element, box)

    console.log('  → 边框')
    drawElementBorders(element, box)

    console.log('  → ::before')
    drawPseudoElement(ctx, element, '::before')
  }

  // ... 递归子元素

  if (box) {
    console.log('  → ::after')
    drawPseudoElement(ctx, element, '::after')
  }
}
```

---

## 与 CSS z-index 的对比

| 特性 | CSS z-index | pdf-lib 绘制顺序 |
|------|-------------|------------------|
| 层级控制 | ✅ 数字越大越靠上 | ❌ 无法设置，完全依赖绘制顺序 |
| 负值层级 | ✅ 支持负值 | ❌ 没有负值概念 |
| 层叠上下文 | ✅ 复杂的层叠规则 | ❌ 简单的"后画覆盖先画" |
| 动态调整 | ✅ 可以随时修改 | ❌ 一旦绘制无法改变 |
| 性能 | 🔶 浏览器需要计算层叠顺序 | ✅ 简单直接，性能好 |

---

## 最佳实践

1. **遵循 CSS 规范的层叠顺序**
   - 背景 → 边框 → ::before → 子元素 → ::after
   - 不要随意调整顺序

2. **复杂层级使用真实 DOM**
   - 伪元素只适合简单装饰
   - 需要复杂层级控制时，用 `<div>` 代替伪元素

3. **避免依赖 z-index 思维**
   - pdf-lib 没有 z-index
   - 通过调整 HTML 结构和绘制顺序解决层级问题

4. **测试边界情况**
   - 边框与伪元素重叠
   - 透明背景 + 伪元素
   - 嵌套元素的层级关系

---

## 参考资料

- [CSS 层叠上下文 (MDN)](https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context)
- [pdf-lib 文档](https://pdf-lib.js.org/)
- CSS 2.1 规范 - Appendix E (详细的层叠规则)
