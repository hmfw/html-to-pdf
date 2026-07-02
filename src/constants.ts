/**
 * 框架无关的 DOM 标记约定。
 *
 * 渲染核心通过这些 data 属性识别「导出容器」和「分页」，
 * 不依赖任何框架组件。在 React / Vue2 / 原生 JS 中，
 * 只要把这些属性加到对应元素上即可获得与 <PdfDocument> / <PdfPage> 相同的行为。
 */

/** 导出容器标记：包裹要导出内容的根元素需带此属性 */
export const PDF_CONTAINER_ATTR = 'data-pdf'

/**
 * 分页标记：带此属性的元素视为一个 PDF 页面。
 * 可以不是容器的直接子元素，允许中间嵌套任意包装元素，但 data-pdf-page 之间不能嵌套。
 */
export const PDF_PAGE_ATTR = 'data-pdf-page'
