# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在本仓库工作时提供指引。请使用中文回复。

## 项目概述

`@hmfw/html-to-pdf` 是一个**框架无关**的 HTML 导出 PDF 的库，基于 [pdf-lib](https://github.com/Hopding/pdf-lib)（实际依赖 `@pdfme/pdf-lib`），默认支持中文（思源黑体）。

**核心框架无关**：真正生成 PDF 的逻辑（`utils/*`、`types.ts`、`constants.ts`）不依赖任何框架。包只有**单一入口** `src/index.ts`，导出：

- 工具函数 `htmlToPdf`（唯一 API）
- DOM 标记常量 `PDF_CONTAINER_ATTR` / `PDF_PAGE_ATTR`
- 类型 `PdfExportOptions` / `PdfGenerateResult` / `ExportStatus`

Vue / React / 原生 JS 用法一致，都是拿到 DOM 元素后调用 `htmlToPdf`。`htmlToPdf` 生成 PDF 后**自动触发浏览器下载**，并返回 `{ success, blob?, error? }`。构建产出 ESM（`dist/index.mjs`）和 CJS（`dist/index.cjs`）双格式，通过 `package.json` 的 `exports` 字段自动选择。多框架用法见 `docs/multi-framework.md`。

核心特点：**不使用 html2canvas**。通过读取 DOM 的真实布局（`getBoundingClientRect` / `Range`）逐元素计算坐标，再用 pdf-lib 直接绘制文本、矩形和图片。因此导出的是矢量、可选中、可搜索的 PDF，而非位图截图。

## 常用命令

```bash
npm install            # 安装依赖
npm run dev            # 开发模式，启动示例 src/App.vue
npm run build          # 构建库：vite build（ESM + CJS）+ tsc 生成类型声明（用 tsconfig.build.json）
npm run type-check     # 仅类型检查（tsc --noEmit）
npm test               # 运行单元测试（vitest，jsdom 环境）
npm run test:watch     # 监听模式
```

测试用 **Vitest**（jsdom 环境），覆盖 `src/utils/` 下框架无关的纯函数（`htmlParser` / `imageHelper` / `fontSubset`）。主流程 `htmlToPdf` 依赖真实布局、canvas 与字体 fetch，无法在 jsdom 有意义地测试，靠 `npm run dev` 手动查看示例导出效果验证。测试文件为 `src/**/*.test.ts`。

## 架构

数据流（一次导出）：

```
调用方 → htmlToPdf(element, options)  [utils/pdfGenerator.ts]
  ├─ 扫描字符 + 生成字体子集            [utils/fontSubset.ts]
  ├─ 嵌入字体、计算页面尺寸/边距/分页
  ├─ renderHTML(ctx, element)          [utils/pdfRenderer.ts]
  │    └─ 递归遍历 DOM，按实际坐标绘制文本/盒子/图片
  └─ 生成 blob 并自动触发浏览器下载
```

### 关键文件

- `src/index.ts` — **唯一入口**。导出框架无关的工具函数 `htmlToPdf`、DOM 标记常量与类型。
- `src/constants.ts` — DOM 标记约定常量 `PDF_CONTAINER_ATTR`（`'data-pdf'`）/ `PDF_PAGE_ATTR`（`'data-pdf-page'`），是 `data-pdf*` 属性名的唯一真相来源，渲染核心引用它。
- `src/types.ts` — 公共类型：`PdfExportOptions`、`PdfGenerateResult`、`ExportStatus`。**这是 API 的唯一真相来源**。
- `src/utils/pdfGenerator.ts` — 导出主流程 `htmlToPdf`。负责字体嵌入、页面创建（`computePages` 手动分页 / `computeAutoPages` 自动分页）、坐标系初始化，最后自动触发浏览器下载。
- `src/utils/autoPaginate.ts` — 自动分页（无 `data-pdf-page` 时）。`collectBreakUnits` 采集叶子块，`packIntoPages`（纯函数，有单测）贪心打包出每页断点。
- `src/utils/pdfRenderer.ts` — 渲染核心。递归遍历 DOM，`resolveBox` 做 px→pt 坐标换算（含 PDF 的 Y 轴翻转），`renderTextNode` 用 `Range` 精确定位文本，并处理字重、斜体（skew 模拟）、`<pre>` 换行。
- `src/utils/fontSubset.ts` — 用 `opentype.js` 扫描元素字符、过滤 emoji、生成字体子集。
- `src/utils/htmlParser.ts` — `pxToPt`（比例 0.75）和 `parseColor`（hex/短 hex/rgba）。
- `src/utils/imageHelper.ts` — 图片加载、Canvas 转 PNG、格式检测。
- `src/App.vue` — 开发示例（覆盖库支持的全部内容与样式特性），通过模板 ref 拿到容器后调用 `htmlToPdf`。仅供 `npm run dev` 预览，不打进库产物。

### 坐标与渲染要点

- 屏幕 96 DPI → PDF 72 DPI，换算比例 **0.75**（`pxToPt`）。
- PDF 坐标原点在左下角，Y 轴向上，因此 `y = pageHeight - pxToPt(相对顶部 + 高度)`。
- 文本宽度按 `rect.width * 1.5` 作为 `maxWidth`，给 pdf-lib 的宽度估算留余量，避免提前换行。
- 渲染依赖元素**已完成布局**，导出前 DOM 必须可见且稳定（`display:none` / `visibility:hidden` 会跳过）。

### 分页机制

存在两种互斥模式，由容器内是否有 `data-pdf-page` 标记自动选择：

**手动分页（data-pdf-page）**
- 通过 `data-pdf-page` 属性标记。`computePages` 为每个分页元素计算 DOM 区域并创建对应 PDF 页。
- `data-pdf-page` 可以不是容器（带 `data-pdf`）的直接子元素，允许中间嵌套任意层级的包装元素。
- **`data-pdf-page` 之间不能嵌套**（即一个 `data-pdf-page` 元素内部不能包含另一个 `data-pdf-page`）。

**自动分页（无 data-pdf-page 时）**
- `computeAutoPages`（`pdfGenerator.ts`）+ `autoPaginate.ts`：按内容流自动切页。
- `collectBreakUnits` 收集「叶子块」（段落/标题/图片/表格行等不可分割单元），`packIntoPages`（纯函数，有单测）贪心打包到每页，超过每页内容高度就在该块顶部断页，使块整体落到下一页，避免被切成半行。
- 页边距「所见即所得」：直接由容器自身的 CSS `padding` 推导，**没有独立的 `margin` 选项**。上下留白 = `padding-top`/`padding-bottom`（每页内容高度 = 页高px - 上下 padding）；左右留白由 `resolveBox` 的 `rect.left - containerRect.left`（天然含 `padding-left`）带出，无需特殊处理。
- 产生两套坐标：`autoBands`（原始视口 Y 边界，content-box 区间，供 `findPageIndex` 按元素 top 归页）与 `pageRects`（top 上移 `paddingTop`，供绘制坐标换算）。
- 已知限制：跨页的容器背景/边框只画在起始页；单个块高于一页内容区时溢出底部不再细分；表头不在每页重复。
- 内容放得下（或上下 padding 之和超过页高）时回退单页。

## 字体

- 运行时需从可访问的 URL 加载字体。用户需将 `public/fonts/` 中的字体文件复制到应用的静态资源目录，或通过 `options.fontPaths` 指定 CDN 等可访问路径。
- 默认尝试从 `/fonts/` 路径加载（由 `fontLoader.ts` 的 `buildDefaultUrl` 定义）：
  - `Source_Han_Sans_SC_Regular.otf`（必需）
  - `Source_Han_Sans_SC_Bold.otf`（必需）
- PDF 生成只用 Regular / Bold 两个字重；`src/styles/fonts.css` 里的其它字重仅供网页预览。
- **字体子集化默认开启**，可通过 `options.fontSubset = false` 关闭（关闭时嵌入完整字体，文件显著增大）。emoji 等符号会被 `fontSubset.ts` 过滤掉。
- 字体文件较大（每个约 16–17MB），保存在 `public/fonts/`，仅供开发时使用和用户复制，**不随 npm 包发布**。子集化后 PDF 文件仅包含实际使用的字符。
- 用户可通过 `options.fontPaths = { regular, bold }` 自定义字体路径（本地路径或 CDN URL），详见 `docs/custom-fonts.md`。

## 修改时的约定

- **修改 API 时同步更新 `src/types.ts`、`README.md`、`API.md`、`docs/multi-framework.md` 和 `src/App.vue` 示例**，容易不一致（曾出现过文档描述了代码中不存在的组件/选项）。
- **改导出时**：所有公共能力都在 `src/index.ts` 一处导出；新增公共导出需同步更新 `package.json` 的 `exports`（目前只有 `.` 和 `./style.css`）。
- `data-pdf-*` 属性名改动只改 `src/constants.ts` 一处，core 引用常量，勿再硬编码字符串。
- 代码注释和文案使用中文，与现有风格保持一致。
- 默认值集中在源文件：导出选项默认值在 `pdfGenerator.ts` 的 `normalizeMargin`/`getPageSize`。
