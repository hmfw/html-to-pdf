/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require('./package.json')

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
      // 关闭 publicDir 自动拷贝：public/fonts 仅供开发时预览，不随 npm 包发布
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
