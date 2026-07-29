import { describe, it, expect } from 'vitest'
import { detectImageFormat, sniffImageFormat, canvasSourceToArrayBuffer } from './imageHelper'

describe('detectImageFormat', () => {
  it('识别 .png 扩展名', () => {
    expect(detectImageFormat('/images/logo.png')).toBe('png')
  })

  it('识别 .jpg / .jpeg 扩展名', () => {
    expect(detectImageFormat('photo.jpg')).toBe('jpg')
    expect(detectImageFormat('photo.JPEG')).toBe('jpg')
  })

  it('识别带 query / hash 的网络 URL 扩展名', () => {
    expect(detectImageFormat('https://cdn.example.com/a.jpg?imageMogr2/thumbnail/150x150')).toBe('jpg')
    expect(detectImageFormat('https://cdn.example.com/a.png?x=1#frag')).toBe('png')
    expect(detectImageFormat('/path/icon.svg?v=2')).toBe('svg')
  })

  it('识别 PNG data URL（按魔数）', () => {
    // iVBORw0KGgo= → PNG 魔数 89 50 4E 47 ...
    expect(detectImageFormat('data:image/png;base64,iVBORw0KGgo=')).toBe('png')
  })

  it('识别 JPEG data URL（按魔数）', () => {
    // /9j/4AAQ → JPEG 魔数 FF D8 FF
    expect(detectImageFormat('data:image/jpeg;base64,/9j/4AAQ')).toBe('jpg')
  })

  it('data URL MIME 与字节不符时按魔数纠正', () => {
    // MIME 写 png，实际是 JPEG 字节
    expect(detectImageFormat('data:image/png;base64,/9j/4AAQ')).toBe('jpg')
    // MIME 为 octet-stream，仍按魔数识别为 JPEG
    expect(detectImageFormat('data:application/octet-stream;base64,/9j/4AAQ')).toBe('jpg')
  })

  it('传入 ArrayBuffer 时按魔数纠正扩展名误判', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer
    expect(detectImageFormat('/images/logo.png', jpeg)).toBe('jpg')
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer
    expect(detectImageFormat('photo.jpg', png)).toBe('png')
  })

  it('大小写不敏感', () => {
    expect(detectImageFormat('/PATH/IMG.PNG')).toBe('png')
  })

  it('未知格式返回 unknown', () => {
    expect(detectImageFormat('/images/icon.gif')).toBe('unknown')
    expect(detectImageFormat('data:image/webp;base64,UklGR')).toBe('unknown')
  })
})

describe('sniffImageFormat', () => {
  it('识别 JPEG 魔数 FF D8 FF', () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).buffer
    expect(sniffImageFormat(buf)).toBe('jpg')
  })

  it('识别 PNG 魔数 89 50 4E 47', () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer
    expect(sniffImageFormat(buf)).toBe('png')
  })

  it('无法识别时返回 null', () => {
    const buf = new Uint8Array([0x00, 0x01, 0x02]).buffer
    expect(sniffImageFormat(buf)).toBeNull()
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
