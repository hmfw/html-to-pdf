<template>
  <div id="app">
    <h1>HTML to PDF 工具函数示例</h1>
    <p class="intro">下面是一个多页文档，覆盖库支持的全部内容与样式特性。点击下方按钮即可导出 PDF。</p>

    <div class="demo-section">
      <div ref="pdfContainer" data-pdf class="pdf-document">
        <!-- 第 1 页：文本、颜色、字重、斜体 -->
        <div data-pdf-page class="pdf-page">
          <h2>第 1 页 · 文本与排版</h2>

          <h3>中英文混排</h3>
          <p>这是一段中文文本，使用思源黑体显示。</p>
          <p>This is English text content.</p>
          <p>中英文混排：Hello 世界！数字 12345。</p>

          <h3>颜色</h3>
          <p style="color: #e91e63">hex 颜色文本（#e91e63）</p>
          <p style="color: rgb(33, 150, 243)">rgb 颜色文本</p>
          <p style="color: rgba(76, 175, 80, 0.85)">rgba 颜色文本</p>

          <h3>字号</h3>
          <p style="font-size: 20px">大字号文本（20px）</p>
          <p style="font-size: 12px">小字号文本（12px）</p>

          <h3>字重与斜体</h3>
          <p>普通文本与 <strong>粗体文本</strong> 混排。</p>
          <p style="font-style: italic">斜体文本 italic（skew 模拟）</p>
          <p style="font-weight: 700; font-style: italic">粗体 + 斜体</p>
        </div>

        <!-- 第 2 页：背景、边框、列表、引用 -->
        <div data-pdf-page class="pdf-page">
          <h2>第 2 页 · 盒子样式与结构</h2>

          <h3>背景与透明度</h3>
          <div style="background-color: #fff3e0; padding: 12px; margin-bottom: 8px">纯色背景块（#fff3e0）</div>
          <div style="background-color: rgba(33, 150, 243, 0.2); padding: 12px">半透明背景块（rgba 透明度）</div>

          <h3>边框与圆角</h3>
          <div style="border: 2px solid #4caf50; border-radius: 8px; padding: 12px; margin-bottom: 8px">
            统一边框 + 圆角
          </div>
          <div style="border-left: 4px solid #e91e63; border-bottom: 2px solid #999999; padding: 12px">
            逐边不同的边框
          </div>

          <h3>列表</h3>
          <ul>
            <li>支持文本渲染（中英文）</li>
            <li>支持样式：<strong>粗体</strong>、<em>斜体</em></li>
            <li>支持表格、图片、Canvas</li>
          </ul>

          <h3>引用</h3>
          <blockquote>
            <p>这是一段引用文本。HTML to PDF 直接绘制矢量内容，文本可选中、可搜索。</p>
          </blockquote>

          <h3>伪元素装饰（实验性）</h3>
          <div class="card-with-bar">
            带装饰条的卡片（::before）
          </div>
          <div class="badge-box">
            带角标的盒子（::after）
          </div>
        </div>

        <!-- 第 3 页：表格、图片、Canvas、代码块 -->
        <div data-pdf-page class="pdf-page">
          <h2>第 3 页 · 表格 / 图片 / Canvas / 代码</h2>

          <h3>数据表格</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>年龄</th>
                <th>职位</th>
                <th>部门</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>张三</td>
                <td>28</td>
                <td>前端工程师</td>
                <td>技术部</td>
              </tr>
              <tr>
                <td>李四</td>
                <td>32</td>
                <td>后端工程师</td>
                <td>技术部</td>
              </tr>
              <tr>
                <td>王五</td>
                <td>25</td>
                <td>UI 设计师</td>
                <td>设计部</td>
              </tr>
            </tbody>
          </table>

          <h3>图片</h3>
          <div class="image-container">
            <img :src="iconImage" alt="示例图片" class="demo-image" />
          </div>

          <h3>Canvas 绘图</h3>
          <canvas ref="demoCanvas" width="300" height="150" class="demo-canvas"></canvas>

          <h3>代码块</h3>
          <pre><code>const result = await exportToPdf(element, {
  filename: 'document'
});</code></pre>
        </div>
      </div>
    </div>

    <button class="export-btn" @click="handleExport" :disabled="isExporting">
      {{ isExporting ? '生成中...' : '导出 PDF' }}
    </button>
    <div v-if="errorMessage" class="error-message">错误：{{ errorMessage }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { htmlToPdf } from './index'
import iconImage from './assets/icon_2.png'

const demoCanvas = ref<HTMLCanvasElement | null>(null)
const pdfContainer = ref<HTMLElement | null>(null)
const isExporting = ref(false)
const errorMessage = ref('')

// 初始化 Canvas
onMounted(() => {
  if (demoCanvas.value) {
    const ctx = demoCanvas.value.getContext('2d')
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 300, 150)
      gradient.addColorStop(0, '#4CAF50')
      gradient.addColorStop(1, '#2196F3')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 300, 150)

      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 24px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('Canvas 演示', 150, 75)

      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(75, 75, 30, 0, Math.PI * 2)
      ctx.stroke()

      ctx.beginPath()
      ctx.rect(200, 50, 50, 50)
      ctx.stroke()
    }
  }
})

async function handleExport() {
  if (!pdfContainer.value) {
    errorMessage.value = '未找到导出容器'
    return
  }

  isExporting.value = true
  errorMessage.value = ''

  try {
    const result = await htmlToPdf(pdfContainer.value, {
      filename: 'comprehensive-demo',
    })

    if (result.success) {
      console.log('导出成功!')
    } else {
      throw result.error || new Error('PDF 生成失败')
    }
  } catch (error) {
    console.error('导出失败:', error)
    errorMessage.value = error instanceof Error ? error.message : '未知错误'
  } finally {
    isExporting.value = false
  }
}
</script>

<style>
#app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

h1 {
  color: #333;
  text-align: center;
}

.intro {
  text-align: center;
  color: #888;
  margin-bottom: 24px;
}

.demo-section {
  margin: 30px 0;
  padding: 20px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #f9f9f9;
}

/* PDF 文档容器：限制宽度以匹配 A4 纸张尺寸 */
.pdf-document {
  max-width: 794px; /* A4 宽度 (595.28pt / 0.75 = 794px) */
  margin: 0 auto;
  background: white;
  box-sizing: border-box;
}

.pdf-page {
  padding: 20px;
  box-sizing: border-box;
}

.content-box h3 {
  margin-top: 24px;
  color: #1890ff;
}

.content-box p {
  line-height: 1.6;
  color: #333;
}

.content-box ul {
  padding-left: 20px;
}

.content-box li {
  margin: 8px 0;
}

button {
  padding: 8px 16px;
  background-color: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-family: 'Source Han Sans SC', sans-serif;
}

button:hover:not(:disabled) {
  background-color: #40a9ff;
}

button:disabled {
  background-color: #d9d9d9;
  cursor: not-allowed;
}

.error-message {
  margin-top: 12px;
  padding: 8px 12px;
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 4px;
  color: #ff4d4f;
}

/* 表格样式 */
.data-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.data-table th,
.data-table td {
  border: 1px solid #ddd;
  padding: 12px;
  text-align: left;
}

.data-table th {
  background-color: #4caf50;
  color: white;
  font-weight: bold;
}

.data-table tr:nth-child(even) {
  background-color: #f9f9f9;
}

/* 图片样式 */
.image-container {
  margin: 16px 0;
  text-align: center;
}

.demo-image {
  max-width: 300px;
  height: auto;
  border: 2px solid #ddd;
  border-radius: 8px;
}

/* Canvas 样式 */
.demo-canvas {
  border: 2px solid #ddd;
  border-radius: 8px;
  margin: 16px 0;
  display: block;
}

/* 引用样式 */
blockquote {
  margin: 16px 0;
  padding: 12px 20px;
  border-left: 4px solid #4caf50;
  background-color: #f9f9f9;
  font-style: italic;
}

blockquote p {
  margin: 0;
}

/* 代码块样式 */
pre {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 16px;
  overflow-x: auto;
  margin: 16px 0;
}

code {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #333;
}

/* 伪元素测试样式 */
.card-with-bar {
  position: relative;
  padding: 16px;
  padding-left: 24px;
  margin-bottom: 16px;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  line-height: 24px;
}

.card-with-bar::before {
  content: '';
  display: block;
  width: 4px;
  height: 40px;
  background-color: #3b82f6;
  border-radius: 2px;
  position: absolute;
  top: 8px;
  left: 8px;
}

.badge-box {
  position: relative;
  padding: 16px;
  background-color: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.badge-box::after {
  content: '';
  display: block;
  width: 16px;
  height: 16px;
  background-color: #ef4444;
  border: 2px solid #fff;
  border-radius: 50%;
  position: absolute;
  top: -8px;
  right: -8px;
}
</style>
