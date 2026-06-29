# 更新日志

本项目所有重要变更都记录在此文件。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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
