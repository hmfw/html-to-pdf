import { describe, it, expect } from 'vitest'
import { detectImageFormat, canvasSourceToArrayBuffer } from './imageHelper'

describe('detectImageFormat', () => {
  it('识别 .png 扩展名', () => {
    expect(detectImageFormat('/images/logo.png')).toBe('png')
  })

  it('识别 .jpg / .jpeg 扩展名', () => {
    expect(detectImageFormat('photo.jpg')).toBe('jpg')
    expect(detectImageFormat('photo.JPEG')).toBe('jpg')
  })

  it('识别 PNG data URL', () => {
    expect(detectImageFormat('data:image/png;base64,iVBORw0KGgo=')).toBe('png')
  })

  it('识别 JPEG data URL', () => {
    expect(detectImageFormat('data:image/jpeg;base64,/9j/4AAQ')).toBe('jpg')
  })

  it('大小写不敏感', () => {
    expect(detectImageFormat('/PATH/IMG.PNG')).toBe('png')
  })

  it('未知格式返回 unknown', () => {
    expect(detectImageFormat('/images/icon.gif')).toBe('unknown')
    expect(detectImageFormat('data:image/webp;base64,UklGR')).toBe('unknown')
  })
})

describe('canvasSourceToArrayBuffer', () => {
  it('ArrayBuffer 原样返回', () => {
    const buf = new Uint8Array([1, 2, 3]).buffer
    expect(canvasSourceToArrayBuffer(buf)).toBe(buf)
  })

  it('data URL 字符串解码为对应字节', () => {
    // "ABC" → base64 "QUJD"
    const dataURL = 'data:application/octet-stream;base64,QUJD'
    const result = canvasSourceToArrayBuffer(dataURL)
    expect(Array.from(new Uint8Array(result))).toEqual([65, 66, 67])
  })
})
