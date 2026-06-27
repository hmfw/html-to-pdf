/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { createRequire } from 'module'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require('./package.json')

/** 随包发布的字体文件名（与 src/utils/fontLoader.ts 的 FONT_FILES 保持一致） */
const FONT_FILES = [
  'Source_Han_Sans_SC_Regular.otf',
  'Source_Han_Sans_SC_Bold.otf',
]

/**
 * 构建后将 public/fonts 复制到 dist/fonts，使字体随 npm 包发布，
 * 供 npmmirror / jsDelivr / unpkg 等 CDN 按版本号镜像。
 */
function copyFontsPlugin() {
  return {
    name: 'copy-fonts',
    closeBundle() {
      const srcDir = resolve(__dirname, 'public/fonts')
      const destDir = resolve(__dirname, 'dist/fonts')
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true })
      }
      for (const file of FONT_FILES) {
        const src = resolve(srcDir, file)
        if (!existsSync(src)) {
          throw new Error(`[copy-fonts] 缺少字体文件: ${src}`)
        }
        copyFileSync(src, resolve(destDir, file))
      }
      console.log(`✓ 已复制 ${FONT_FILES.length} 个字体文件到 dist/fonts/`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // 单元测试：纯工具函数，运行在 jsdom 环境（部分函数需要 DOM）
  const test = {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
  }

  // 把包版本注入到产物，供 fontLoader 拼接 CDN 路径
  const define = {
    __PKG_VERSION__: JSON.stringify(pkg.version),
  }

  if (command === 'build') {
    // 构建库：纯工具函数，不依赖框架
    return {
      define,
      // 关闭 publicDir 自动拷贝：public/fonts 里含 Medium/Normal 等仅供网页预览的字重，
      // 不应进入 npm 包。改由 copyFontsPlugin 精确复制 PDF 实际使用的 Regular/Bold。
      publicDir: false,
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'HtmlToPdf',
          formats: ['es', 'cjs'],
          fileName: (format) => format === 'es' ? 'index.mjs' : 'index.cjs'
        },
        rollupOptions: {
          // 不将任何依赖打包进去
          external: ['@pdfme/pdf-lib', 'fontkit', 'opentype.js']
        }
      },
      plugins: [copyFontsPlugin()],
      test,
    }
  } else {
    // 开发模式：需要 Vue 插件来运行 App.vue 示例
    return {
      define,
      plugins: [vue()],
      test,
    }
  }
})
