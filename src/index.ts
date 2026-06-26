import { htmlToPdf } from './utils/pdfGenerator'

// 导出类型
export type { PdfExportOptions, PdfGenerateResult, ExportStatus } from './types'

// 导出 DOM 标记约定常量（手动分页 / 标记导出容器时使用，框架无关）
export { PDF_CONTAINER_ATTR, PDF_PAGE_ATTR } from './constants'

// 导出工具函数（框架无关，可在任意框架中使用）
export { htmlToPdf }
