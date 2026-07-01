import { describe, it, expect } from 'vitest'
import { convertCharacters, convertText, type OpenCCConfig } from './textConverter'

describe('textConverter', () => {
  describe('convertCharacters', () => {
    it('应该保留原字符并添加转换后字符（默认 cn→hk）', () => {
      const input = new Set(['简', '体', '字'])
      const result = convertCharacters(input)

      // 应该包含原字符
      expect(result.has('简')).toBe(true)
      expect(result.has('体')).toBe(true)
      expect(result.has('字')).toBe(true)

      // 应该包含繁体字符
      expect(result.has('簡')).toBe(true)
      expect(result.has('體')).toBe(true)
    })

    it('应该支持指定转换配置（cn→tw）', () => {
      const input = new Set(['简', '体', '字'])
      const config: OpenCCConfig = { from: 'cn', to: 'tw' }
      const result = convertCharacters(input, config)

      expect(result.has('简')).toBe(true)
      expect(result.has('簡')).toBe(true)
    })

    it('应该支持指定转换配置（cn→hk）', () => {
      const input = new Set(['简', '体', '字'])
      const config: OpenCCConfig = { from: 'cn', to: 'hk' }
      const result = convertCharacters(input, config)

      expect(result.has('简')).toBe(true)
      expect(result.has('簡')).toBe(true)
    })

    it('应该支持反向转换（tw→cn）', () => {
      const input = new Set(['簡', '體', '字'])
      const config: OpenCCConfig = { from: 'tw', to: 'cn' }
      const result = convertCharacters(input, config)

      expect(result.has('簡')).toBe(true)
      expect(result.has('简')).toBe(true)
    })

    it('对于没有转换的字符应该保持不变', () => {
      const input = new Set(['a', 'b', '1', '2'])
      const result = convertCharacters(input)

      expect(result.size).toBe(input.size)
      expect(result.has('a')).toBe(true)
      expect(result.has('b')).toBe(true)
      expect(result.has('1')).toBe(true)
      expect(result.has('2')).toBe(true)
    })

    it('应该处理混合内容', () => {
      const input = new Set(['简', 'a', '1', '体'])
      const result = convertCharacters(input)

      expect(result.has('简')).toBe(true)
      expect(result.has('簡')).toBe(true)
      expect(result.has('a')).toBe(true)
      expect(result.has('1')).toBe(true)
      expect(result.has('体')).toBe(true)
      expect(result.has('體')).toBe(true)
    })
  })

  describe('convertText', () => {
    it('应该转换文本（默认 cn→hk）', () => {
      expect(convertText('简体字')).toBe('簡體字')
      expect(convertText('中国')).toBe('中國')
      expect(convertText('计算机')).toBe('計算機')
    })

    it('应该支持指定转换配置（cn→tw）', () => {
      const config: OpenCCConfig = { from: 'cn', to: 'tw' }
      expect(convertText('简体字', config)).toBe('簡體字')
    })

    it('应该支持指定转换配置（cn→hk）', () => {
      const config: OpenCCConfig = { from: 'cn', to: 'hk' }
      expect(convertText('简体字', config)).toBe('簡體字')
    })

    it('应该支持反向转换（tw→cn）', () => {
      const config: OpenCCConfig = { from: 'tw', to: 'cn' }
      expect(convertText('簡體字', config)).toBe('简体字')
    })

    it('对于已经是繁体的文本应该保持不变（使用 cn→hk）', () => {
      const traditionalText = '繁體字'
      expect(convertText(traditionalText)).toBe(traditionalText)
    })

    it('应该处理混合内容', () => {
      expect(convertText('这是简体中文 ABC 123')).toBe('這是簡體中文 ABC 123')
    })

    it('对于空字符串应该返回空字符串', () => {
      expect(convertText('')).toBe('')
    })
  })
})
