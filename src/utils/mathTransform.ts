/**
 * CSS `text-transform: math-auto` 的字符转换。
 *
 * 浏览器（MathML Core）默认给 `<mi>` 等元素加 `text-transform: math-auto`：
 * 当元素文本为**单个字符**时，把拉丁 / 希腊字母渲染为对应的「数学斜体」
 * 字母（Unicode Mathematical Alphanumeric Symbols，如 X→𝑋、α→𝛼）；
 * 多字符（如 sin）保持原样。本库读取的是文本节点原始码点（X），需据此
 * 复刻该转换，否则导出与网页显示不一致（字形与宽度都会差）。
 */

/**
 * 把单个字符转为数学斜体码点；非字母或多字符原样返回。
 * 小写 h 无独立斜体码位，按 Unicode 规范用普朗克常数 ℎ（U+210E）替代。
 */
function toMathItalic(ch: string): string {
  const cp = ch.codePointAt(0)
  if (cp === undefined) return ch
  // 拉丁大写 A-Z → U+1D434..
  if (cp >= 0x41 && cp <= 0x5a) return String.fromCodePoint(0x1d434 + (cp - 0x41))
  // 拉丁小写 a-z → U+1D44E..（h 例外）
  if (cp >= 0x61 && cp <= 0x7a) {
    if (cp === 0x68) return 'ℎ' // ℎ
    return String.fromCodePoint(0x1d44e + (cp - 0x61))
  }
  // 希腊大写 Α-Ω → U+1D6E2..
  if (cp >= 0x391 && cp <= 0x3a9) return String.fromCodePoint(0x1d6e2 + (cp - 0x391))
  // 希腊小写 α-ω → U+1D6FC..
  if (cp >= 0x3b1 && cp <= 0x3c9) return String.fromCodePoint(0x1d6fc + (cp - 0x3b1))
  return ch
}

/**
 * 复刻 `text-transform: math-auto`：仅当整段文本为单个码点时才转数学斜体，
 * 否则原样返回（与 MathML「单字符 mi 才斜体」的规则一致）。
 */
export function mathAutoTransform(text: string): string {
  const cps = Array.from(text)
  if (cps.length !== 1) return text
  return toMathItalic(cps[0])
}
