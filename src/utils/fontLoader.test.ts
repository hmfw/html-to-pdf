import { afterEach, describe, expect, it, vi } from 'vitest'
import { FONT_FILES, loadFontWithFallback } from './fontLoader.js'

// 构造一个最小的合法 OTF 头（'OTTO'），通过 assertLooksLikeFont 校验
function fakeFontBuffer(): ArrayBuffer {
  const buf = new ArrayBuffer(4)
  const view = new Uint8Array(buf)
  view.set([0x4f, 0x54, 0x54, 0x4f]) // 'OTTO'
  return buf
}

/** 捕获 fetch 实际请求的 URL，返回一个合法字体响应 */
function mockFetchCapture(): { urls: string[] } {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      return { ok: true, arrayBuffer: async () => fakeFontBuffer() } as Response
    }),
  )
  return { urls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadFontWithFallback - basePath', () => {
  it('默认 basePath 为根，路径为 /fonts/<file>', async () => {
    const { urls } = mockFetchCapture()
    await loadFontWithFallback('regular')
    expect(urls[0]).toBe(`/fonts/${FONT_FILES.regular}`)
  })

  it('子路径 basePath 自动带上前缀', async () => {
    const { urls } = mockFetchCapture()
    await loadFontWithFallback('bold', undefined, 30000, '/myapp/')
    expect(urls[0]).toBe(`/myapp/fonts/${FONT_FILES.bold}`)
  })

  it('basePath 不以 / 结尾时归一化，避免粘连', async () => {
    const { urls } = mockFetchCapture()
    await loadFontWithFallback('regular', undefined, 30000, '/myapp')
    expect(urls[0]).toBe(`/myapp/fonts/${FONT_FILES.regular}`)
  })

  it('显式 customUrl 优先，忽略 basePath', async () => {
    const { urls } = mockFetchCapture()
    await loadFontWithFallback('regular', 'https://cdn.example.com/a.otf', 30000, '/myapp/')
    expect(urls[0]).toBe('https://cdn.example.com/a.otf')
  })
})
