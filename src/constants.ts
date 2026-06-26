/**
 * 框架无关的 DOM 标记约定。
 *
 * 渲染核心通过这些 data 属性识别「导出容器」和「分页」，
 * 不依赖任何框架组件。在 React / Vue2 / 原生 JS 中，
 * 只要把这些属性加到对应元素上即可获得与 <PdfDocument> / <PdfPage> 相同的行为。
 */

/** 导出容器标记：包裹要导出内容的根元素需带此属性 */
export const PDF_CONTAINER_ATTR = 'data-pdf'

/** 分页标记：容器的直接子元素带此属性即视为一个 PDF 页面 */
export const PDF_PAGE_ATTR = 'data-pdf-page'
