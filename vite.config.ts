import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  if (command === 'build') {
    // 构建库：纯工具函数，不依赖框架
    return {
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
      }
    }
  } else {
    // 开发模式：需要 Vue 插件来运行 App.vue 示例
    return {
      plugins: [vue()]
    }
  }
})
