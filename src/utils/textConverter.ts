import OpenCC from 'opencc-js'
import type { ConverterOptions } from '../types.js'

// 重新导出 ConverterOptions 类型，方便外部使用
export type { ConverterOptions }

/** OpenCC 转换配置（别名，向后兼容） */
export type OpenCCConfig = ConverterOptions

/** 默认转换配置：简体→香港繁体 */
const DEFAULT_CONFIG: OpenCCConfig = { from: 'cn', to: 'hk' }

/**
 * 简繁转换器缓存（按配置缓存，惰性初始化）
 * 使用 JSON.stringify 作为缓存 key
 */
const converterCache = new Map<string, ReturnType<typeof OpenCC.Converter>>()

/**
 * 获取简繁转换器（单例，按配置缓存）
 * @param config OpenCC 转换配置 { from, to }
 *   常用配置：
 *   - { from: 'cn', to: 'hk' }: 简体→香港繁体（默认）
 *   - { from: 'cn', to: 'tw' }: 简体→台湾繁体
 *   - { from: 'cn', to: 'twp' }: 简体→台湾繁体（含成语）
 *   - { from: 'cn', to: 't' }: 简体→标准繁体
 *   - { from: 'tw', to: 'cn' }: 台湾繁体→简体（反向转换）
 */
function getConverter(config: OpenCCConfig = DEFAULT_CONFIG): ReturnType<typeof OpenCC.Converter> {
  const cacheKey = JSON.stringify(config)
  let converter = converterCache.get(cacheKey)
  if (!converter) {
    converter = OpenCC.Converter(config)
    converterCache.set(cacheKey, converter)
  }
  return converter
}

/**
 * 将字符集合按配置进行转换
 * @param chars 字符集合
 * @param config OpenCC 转换配置（默认简体→香港繁体）
 * @returns 转换后的字符集合（包含原字符和转换后的字符）
 */
export function convertCharacters(
  chars: Set<string>,
  config: OpenCCConfig = DEFAULT_CONFIG
): Set<string> {
  const converter = getConverter(config)
  const result = new Set<string>()

  for (const char of chars) {
    // 保留原字符
    result.add(char)

    // 转换字符
    const converted = converter(char)

    // 如果转换后不同，添加转换后的版本
    if (converted !== char) {
      result.add(converted)
    }
  }

  return result
}

/**
 * 将文本按配置进行转换
 * @param text 源文本
 * @param config OpenCC 转换配置（默认简体→香港繁体）
 * @returns 转换后的文本
 */
export function convertText(text: string, config: OpenCCConfig = DEFAULT_CONFIG): string {
  const converter = getConverter(config)
  return converter(text)
}

// 向后兼容的别名
export const convertSimplifiedToTraditional = convertCharacters
export const textS2T = convertText
