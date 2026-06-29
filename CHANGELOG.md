# 更新日志

本项目所有重要变更都记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.2.0] - 2026-06-29

### Added

- **字体加载超时可配置**：新增 `fontLoadTimeout` 选项（默认 30000ms），可根据网络环境调整超时时间。字体文件约 16-17MB，移动网络建议设置 45000-60000ms。
- **后备字体可配置**：新增 `fontFallback` 选项（默认 true），使用自定义字体时可选择是否加载思源黑体作为后备。设为 `false` 可加快加载速度，但缺失字符会显示为方块。
- **容器宽度设置指南**：README 新增详细的容器宽度设置说明，包括常用页面尺寸对应表（A4/A3/Letter）和最佳实践。

### Changed

- 字体加载超时从固定 15 秒延长到 30 秒，更适合大文件加载。

## [1.1.0] - 2026-06-29

### Changed

- **BREAKING**: 字体文件不再随 npm 包发布，需用户手动托管。将 `node_modules/@hmfw/html-to-pdf/public/fonts/` 中的字体复制到应用的 `public/fonts/` 目录，或通过 `options.fontPaths` 指定可访问路径。
- **BREAKING**: 移除字体 CDN 降级加载机制。默认只从 `/fonts/` 路径加载，加载失败会直接报错并提示解决方法。
- npm 包体积减小约 32-34MB（不再包含字体文件）。

### Fixed

- **修复后备字体渲染失效问题**：当使用自定义字体（如繁体字体）缺少某些字符时，即使加载了后备字体，渲染时仍使用主字体导致字符显示为方块。现在会逐字符判断，缺失字符自动使用后备字体渲染。
- 改进后备字体错误提示：明确说明需要同时托管思源黑体才能让后备机制生效。

### Added

- 真正的混合字体渲染：`renderTextWithFallback` 函数按字符动态选择主字体或后备字体，将相邻使用相同字体的字符合并为段，优化性能。
- 渲染上下文新增 `missingChars` 字段：记录主字体中缺失的字符集合，供渲染时判断。

## [1.0.3] - 2026-06-29

### Added

- **SVG 支持**：支持 `<img src="xxx.svg">` 和内联 `<svg>` 元素，自动转换为 PNG 后嵌入 PDF。

### Fixed

- 修复 SVG 图片导出错误："The input is not a PNG file!" —— 现在 SVG 会先转换为 PNG 再嵌入。

## [1.0.2] - 2026-06-29

### Added

- **后备字体机制**：当使用自定义字体（`options.fontPaths`）时，自动加载思源黑体作为后备字体。若自定义字体缺少某些字符，自动使用后备字体补充，避免显示方块。
- 字体缺失检测优化：改进警告信息，明确提示"将使用后备字体"而非"显示为方块"（仅当有后备字体时）。

### Fixed

- 修复图片加载失败时的 WinAnsi 编码错误：错误提示文本改用中文字体而非标准字体（Helvetica）。
- 修复自定义字体缺少字符时显示方块的问题：通过后备字体机制自动补充缺失字符。

### Changed

- `RenderContext` 新增 `fallbackFont` 和 `fallbackFontBold` 字段，用于后备字体。
- `createFontSubset` 返回值改为 `{ buffer, missingChars }`，便于跟踪缺失字符。

## [1.0.1] - 2026-06-29

### Added

- 字体子集化增强：子集化时检测字体中不存在的字符，并在控制台输出警告，帮助排查"方块字符"问题。
- 字体随 npm 包发布：构建时将思源黑体 Regular/Bold 复制到 `dist/fonts/`，安装即可用，无需手动放置字体。
- 字体多源降级加载（`fontLoader`）：按「本地 `/fonts/` → npmmirror → jsDelivr → unpkg」顺序自动降级，兼顾国内网络与离线/内网部署。
- 字体内容校验：通过魔数识别字体文件，避免 SPA 的 404 兜底页被误当字体嵌入。
- `debug` 选项：按需开启控制台性能报告，默认关闭。
- `browserslist` 字段与 README「浏览器支持」说明（Chrome 90 / Firefox 88 / Safari 14 / Edge 90，不支持 IE）。
- `prepublishOnly` 钩子：发布前自动执行 测试 → 构建 → 打包预演。
- README 新增「字体子集化说明」和「常见问题」章节，详细说明方块字符的诊断和解决方法。

### Changed

- `build` 脚本前置 `type-check`，类型错误时不再产出 dist。
- 相对导入补全 `.js` 扩展名，修复 `nodenext`/`node16` 消费者导入类型声明时的 TS2834 报错。
- 性能监控默认静默，不再无条件向使用方控制台输出日志。
- `fontSubset` 的子集化函数改为接收已加载的 `ArrayBuffer`，字体加载逻辑统一收敛到 `fontLoader`。

### Removed

- 移除指向不存在文件的 `./style.css` 导出声明（库本身无运行时 CSS）。
- 移除硬编码的默认字体路径常量 `DEFAULT_FONT_URLS`。

## [1.0.0]

### Added

- 框架无关的 `htmlToPdf(element, options)`：读取真实 DOM 布局，用 pdf-lib 生成可选中、可搜索的矢量 PDF。
- 默认内置思源黑体（Source Han Sans SC），自动字体子集化。
- 多页文档支持（`data-pdf-page` 手动分页）。
- 导出 `PDF_CONTAINER_ATTR` / `PDF_PAGE_ATTR` 常量。
- 常见 HTML/CSS 渲染支持：标题、段落、列表、表格、图片、Canvas、引用、代码块、粗体、斜体、颜色、背景、边框、圆角。
- 实验性支持 `::before` / `::after` 伪元素（仅背景色和边框）。
- 引入 Vitest，为框架无关的工具函数补充单元测试。
