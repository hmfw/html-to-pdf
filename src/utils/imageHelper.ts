/**
 * 图片处理工具
 */

/**
 * 加载图片并转换为 ArrayBuffer
 */
export async function loadImageAsArrayBuffer(src: string): Promise<ArrayBuffer> {
  // 如果是 data URL，直接解析
  if (src.startsWith('data:')) {
    return dataURLToArrayBuffer(src)
  }

  // 如果是相对路径或绝对路径，使用 fetch
  try {
    const response = await fetch(src)
    if (!response.ok) {
      throw new Error(`Failed to load image: ${response.statusText}`)
    }
    return await response.arrayBuffer()
  } catch (error) {
    console.error('Failed to load image:', src, error)
    throw error
  }
}

/**
 * 将 data URL 转换为 ArrayBuffer
 */
function dataURLToArrayBuffer(dataURL: string): ArrayBuffer {
  const base64 = dataURL.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * 将 Canvas 转换为 PNG ArrayBuffer。
 *
 * 注意：不再对已绘制的位图做软件放大——`drawImage` 拿到的是 canvas 已经
 * 栅格化的像素，放大只是插值，不会变清晰反而更糊。这里直接读取 canvas 的
 * backing store（高 DPR 屏上 `canvas.width` 已含 devicePixelRatio）。
 * 真正的高清应在源头重绘，见 `canvasResolver` 与 `tryEChartsHighRes`。
 * @param canvas - 原始 Canvas 元素
 */
export async function canvasToArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to blob'))
          return
        }
        resolve(await blob.arrayBuffer())
      },
      'image/png',
      // PNG 不支持 quality 参数，省略第三个参数
    )
  })
}

/**
 * 自动探测兜底：如果该 canvas 属于一个挂在全局 `window.echarts` 的 ECharts 实例，
 * 用实例的 `getDataURL` 在源头按 `pixelRatio` 高清重绘，返回 data URL；否则返回 null。
 *
 * 不 import echarts，只看运行时全局变量，因此不会给本库引入 echarts 依赖。
 * 项目用 `import` 方式且未挂全局时探测会失效（返回 null），属预期行为——
 * 这种场景应使用 `canvasResolver` 手动反查实例。
 */
export function tryEChartsHighRes(canvas: HTMLCanvasElement, pixelRatio: number): string | null {
  const ec = (window as unknown as { echarts?: any }).echarts
  if (!ec?.getInstanceByDom) return null

  // ECharts 在 init 容器上写入 `_echarts_instance_` 属性，向上查找该容器
  const dom = canvas.closest('[_echarts_instance_]') as HTMLElement | null
  if (!dom) return null

  const inst = ec.getInstanceByDom(dom)
  if (!inst) return null

  try {
    return inst.getDataURL({ type: 'png', pixelRatio, backgroundColor: '#fff' })
  } catch (error) {
    console.warn('ECharts getDataURL failed, fallback to canvas rasterization:', error)
    return null
  }
}

/**
 * 将 canvasResolver / 自动探测产出的结果（data URL 或 ArrayBuffer）归一化为 ArrayBuffer。
 */
export function canvasSourceToArrayBuffer(source: string | ArrayBuffer): ArrayBuffer {
  if (typeof source === 'string') {
    // 期望是 data URL（image/png 或 image/jpeg）
    return dataURLToArrayBuffer(source)
  }
  return source
}

/**
 * 检测图片格式
 */
export function detectImageFormat(src: string): 'png' | 'jpg' | 'unknown' {
  const lower = src.toLowerCase()
  if (lower.includes('data:image/png') || lower.endsWith('.png')) {
    return 'png'
  }
  if (lower.includes('data:image/jpeg') || lower.includes('data:image/jpg') ||
      lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'jpg'
  }
  return 'unknown'
}
