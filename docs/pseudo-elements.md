# 伪元素支持

从当前版本开始，`@hmfw/html-to-pdf` 支持渲染 `::before` 和 `::after` 伪元素的背景色和边框。

## 限制条件

**简化版实现**仅支持以下场景：

1. **display 类型**：只处理 `display: block` 或 `display: inline-block` 的伪元素
2. **绘制内容**：只绘制背景色（`background-color`）和边框（`border`），**不绘制 `content` 内容**
3. **尺寸要求**：必须显式设置 `width` 和 `height`（`auto` 高度会被跳过）
4. **定位方式**：假设伪元素使用默认定位（`position: static`）

## 使用示例

### 基础用法

```html
<div data-pdf>
  <div class="card">
    这是一个带装饰条的卡片
  </div>
</div>

<style>
.card {
  position: relative;
  padding: 20px;
  background: white;
  border: 1px solid #ddd;
}

/* ✅ 支持：block 显示，明确尺寸，有背景色 */
.card::before {
  content: '';
  display: block;
  width: 4px;
  height: 40px;
  background-color: #3b82f6;
  border-radius: 2px;
  position: absolute;
  top: 10px;
  left: 0;
}
</style>
```

### 支持的属性

```css
.element::before {
  content: '';              /* 必需（任意值，但不能是 'none'） */
  display: block;           /* ✅ 支持 block / inline-block */
  width: 100px;             /* ✅ 必需明确值 */
  height: 50px;             /* ✅ 必需明确值 */
  background-color: #f00;   /* ✅ 支持 */
  border: 2px solid #000;   /* ✅ 支持 */
  border-radius: 5px;       /* ✅ 支持 */
  padding-top: 10px;        /* ✅ 支持（影响定位） */
  padding-left: 10px;       /* ✅ 支持（影响定位） */
}
```

### 不支持的场景

```css
/* ❌ 不支持：inline 显示 */
.element::before {
  display: inline;
}

/* ❌ 不支持：auto 高度 */
.element::before {
  width: 100px;
  height: auto;
}

/* ❌ 不支持：content 内容不会被渲染 */
.element::before {
  content: '装饰文字';  /* 只会绘制盒子，不会显示文字 */
}

/* ❌ 不支持：背景图片 */
.element::before {
  background-image: url(...);
}

/* ❌ 不支持：复杂定位 */
.element::before {
  position: absolute;
  transform: rotate(45deg);
}
```

## 渲染顺序

- `::before` 在元素背景**之前**绘制（会被元素背景覆盖）
- `::after` 在所有子元素**之后**绘制（会覆盖在内容之上）

## 替代方案

如果需要更复杂的装饰效果（渲染 content 文本、背景图片、复杂定位等），建议使用**真实 DOM 元素**代替伪元素：

```vue
<template>
  <div class="card">
    <span class="decoration-bar"></span>
    这是一个带装饰条的卡片
  </div>
</template>

<style>
.decoration-bar {
  display: block;
  width: 4px;
  height: 40px;
  background-color: #3b82f6;
  /* 真实元素支持所有 CSS 属性 */
}
</style>
```

## 技术说明

伪元素在 DOM API 中不可直接访问，坐标需要手动估算。当前实现：

1. 通过 `window.getComputedStyle(element, '::before')` 读取伪元素样式
2. 基于父元素的 `getBoundingClientRect()` 和伪元素的尺寸/padding 估算位置
3. 调用现有的 `drawRectangle` 绘制背景和边框

由于坐标是估算而非浏览器的真实布局，复杂定位可能与实际渲染有偏差。
