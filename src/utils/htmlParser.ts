/**
 * HTML 样式提取与单位转换工具
 */

/**
 * CSS 像素转 PDF 点
 * 屏幕 DPI = 96, PDF DPI = 72
 * pt = px * (72 / 96) = px * 0.75
 */
export function pxToPt(px: number): number {
  return px * 0.75
}

/**
 * 解析颜色为 RGB（增强版，支持更多格式和透明度）
 */
export function parseColor(color: string): { r: number; g: number; b: number; a?: number } {
  if (!color) return { r: 0, g: 0, b: 0, a: 1 }

  // 处理 rgba 格式
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]) / 255,
      g: parseInt(rgbaMatch[2]) / 255,
      b: parseInt(rgbaMatch[3]) / 255,
      a: rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1
    }
  }

  // 处理十六进制格式 #RRGGBB
  const hexMatch = color.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16) / 255,
      g: parseInt(hexMatch[2], 16) / 255,
      b: parseInt(hexMatch[3], 16) / 255,
      a: 1
    }
  }

  // 处理短十六进制 #RGB
  const shortHexMatch = color.match(/#([0-9a-f])([0-9a-f])([0-9a-f])/i)
  if (shortHexMatch) {
    return {
      r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16) / 255,
      g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16) / 255,
      b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16) / 255,
      a: 1
    }
  }

  // 默认黑色
  return { r: 0, g: 0, b: 0, a: 1 }
}
