<template>
  <div id="app">
    <h1>HTML to PDF 工具函数示例</h1>
    <p class="intro">
      下面是一个多页文档，覆盖库支持的内容与样式特性，并包含若干边界用例。点击下方按钮即可导出 PDF。
    </p>

    <div class="demo-section">
      <div ref="pdfContainer" data-pdf class="pdf-document">
        <!-- 第 1 页：文本、颜色、字重、斜体 -->
        <div data-pdf-page class="pdf-page">
          <h2 style="margin-top: 0;">第 1 页 · 文本与排版</h2>

          <h3>中英文混排</h3>
          <p>这是一段中文文本，使用思源黑体显示。</p>
          <p>This is English text content.</p>
          <p>中英文混排：Hello 世界！数字 12345。</p>
          <p><strong>1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ</strong></p>

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
          <div style="background-color: #fff3e0; padding: 12px; margin-bottom: 8px">
            纯色背景块（#fff3e0）
          </div>
          <div style="background-color: rgba(33, 150, 243, 0.2); padding: 12px">
            半透明背景块（rgba 透明度）
          </div>

          <h3>边框与圆角</h3>
          <div
            style="border: 2px solid #4caf50; border-radius: 8px; padding: 12px; margin-bottom: 8px"
          >
            统一边框 + 圆角
          </div>
          <div
            style="border-left: 4px solid #e91e63; border-bottom: 2px solid #999999; padding: 12px"
          >
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
          <div class="card-with-bar">带装饰条的卡片（::before）</div>
          <div class="badge-box">带角标的盒子（::after）</div>
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
          <pre><code>const result = await htmlToPdf(element, {
  filename: 'document'
});</code></pre>
        </div>

        <!-- 第 4 页：列表 / 长文本换行 / 行内混排 -->
        <div data-pdf-page class="pdf-page">
          <h2>第 4 页 · 列表与长文本</h2>

          <h3>有序列表（ol）</h3>
          <ol>
            <li>第一步：准备 DOM 元素</li>
            <li>第二步：调用 htmlToPdf</li>
            <li>第三步：保存返回的 Blob</li>
          </ol>

          <h3>嵌套列表</h3>
          <ul>
            <li>
              前端框架
              <ul>
                <li>Vue</li>
                <li>React</li>
              </ul>
            </li>
            <li>
              构建工具
              <ul>
                <li>Vite</li>
                <li>Webpack</li>
              </ul>
            </li>
          </ul>

          <h3>长段落自动换行</h3>
          <p class="long-text">
            这是一段较长的中文段落，用于测试文本在容器宽度内的自动换行行为。HTML to PDF 通过解析真实
            DOM 布局来定位每一个文本节点，因此换行结果应当与浏览器中看到的一致。This paragraph also
            mixes English words to verify that Latin and CJK text wrap correctly within the same
            line box when the content exceeds the available width.
          </p>

          <h3>行内混排（多色 / 字重）</h3>
          <p>
            <span style="color: #e91e63">红色</span>、<span style="color: #2196f3">蓝色</span
            >、<span style="color: #4caf50; font-weight: 700">绿色加粗</span>，以及
            <span style="font-style: italic">斜体片段</span> 在同一行内混排。
          </p>

          <h3>不支持的样式（应优雅降级）</h3>
          <p style="text-decoration: underline">下划线文本（当前不绘制下划线，文字仍应正常显示）</p>
          <p style="text-decoration: line-through">删除线文本（同上，仅文字渲染）</p>
          <p>
            含表情符号与特殊字符：★ ☎ ✓ © ® — 应正常显示；🚀😀 等星空平面 emoji 会被子集化过滤。
          </p>
        </div>

        <!-- 第 5 页：嵌套盒子 / 较大表格 -->
        <div data-pdf-page class="pdf-page">
          <h2>第 5 页 · 嵌套结构与大表格</h2>

          <h3>多层嵌套背景盒子</h3>
          <div style="background-color: #e3f2fd; padding: 16px; border-radius: 8px">
            外层（浅蓝）
            <div
              style="background-color: #fff3e0; padding: 16px; border-radius: 6px; margin-top: 8px"
            >
              中层（浅橙）
              <div
                style="
                  background-color: #e8f5e9;
                  padding: 16px;
                  border-radius: 4px;
                  margin-top: 8px;
                "
              >
                内层（浅绿）— 测试嵌套背景与圆角的层叠绘制
              </div>
            </div>
          </div>
          <h3>较多行的表格（测试单页内排版）</h3>
          <table class="data-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>名称</th>
                <th>状态</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.id">
                <td>{{ row.id }}</td>
                <td>{{ row.name }}</td>
                <td>{{ row.status }}</td>
                <td>{{ row.note }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div data-pdf-page class="pdf-page">
          <h3>合并单元格（colspan / rowspan）</h3>
          <p class="hint">提示：合并单元格建议显式设置背景色，避免下层行条纹透出。</p>
          <table class="data-table merge-table">
            <thead>
              <tr>
                <th colspan="3">2024 年度考核（跨 3 列表头）</th>
              </tr>
              <tr>
                <th>季度</th>
                <th>指标</th>
                <th>评分</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowspan="2" class="span-cell">上半年</td>
                <td>交付质量</td>
                <td>A</td>
              </tr>
              <tr>
                <td>响应速度</td>
                <td>B+</td>
              </tr>
              <tr>
                <td rowspan="2" class="span-cell">下半年</td>
                <td>交付质量</td>
                <td>A+</td>
              </tr>
              <tr>
                <td>响应速度</td>
                <td>A</td>
              </tr>
              <tr>
                <td colspan="2" class="span-cell">全年综合</td>
                <td>A</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <button class="export-btn" @click="handleExport" :disabled="isExporting">
      {{ isExporting ? '生成中...' : '导出 PDF' }}
    </button>
    <div v-if="errorMessage" class="error-message">错误：{{ errorMessage }}</div>

    <h1 style="margin-top: 48px">自动分页示例（无 data-pdf-page）</h1>
    <p class="intro">
      下面的容器只标了 <code>data-pdf</code>，没有任何 <code>data-pdf-page</code>。内容超过一页时会按内容流自动分页，
      并尽量在段落 / 图片 / 表格行边界断页。
    </p>

    <div class="demo-section">
      <div ref="autoContainer" data-pdf class="pdf-document auto-doc">
        <h2 style="margin-top: 0;">自动分页长文档</h2>
        <p v-for="n in 24" :key="'p' + n">
          第 {{ n }} 段：这是一段用于演示自动分页的长文本。库会遍历段落、标题、图片、表格行等不可分割的「叶子块」，
          累计高度超过一页可用区域时，在下一个块的顶部断页，使其整体落到下一页，从而避免文字被切成半行。
          中英文混排示例 Auto pagination keeps each block intact across page boundaries.
        </p>
        <table class="data-table">
          <thead>
            <tr><th>序号</th><th>任务</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="n in 30" :key="'r' + n">
              <td>{{ n }}</td>
              <td>自动分页表格行 {{ n }}</td>
              <td>{{ n % 3 === 0 ? '已完成' : '进行中' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <button class="export-btn" @click="handleExportAuto" :disabled="isExportingAuto">
      {{ isExportingAuto ? '生成中...' : '导出自动分页 PDF' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { htmlToPdf } from './index'
import iconImage from './assets/icon_2.png'

const demoCanvas = ref<HTMLCanvasElement | null>(null)
const pdfContainer = ref<HTMLElement | null>(null)
const autoContainer = ref<HTMLElement | null>(null)
const isExporting = ref(false)
const isExportingAuto = ref(false)
const errorMessage = ref('')

// 第 5 页大表格的数据
const tableRows = [
  { id: 1, name: '需求评审', status: '已完成', note: '范围已确认' },
  { id: 2, name: '接口设计', status: '已完成', note: '含字体降级方案' },
  { id: 3, name: '渲染实现', status: '进行中', note: '矢量文本绘制' },
  { id: 4, name: '单元测试', status: '进行中', note: 'Vitest 覆盖工具函数' },
  { id: 5, name: '打包发布', status: '待开始', note: '字体随包发布' },
  { id: 6, name: '文档完善', status: '待开始', note: '多框架使用说明' },
]

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

async function handleExportAuto() {
  if (!autoContainer.value) {
    errorMessage.value = '未找到自动分页容器'
    return
  }

  isExportingAuto.value = true
  errorMessage.value = ''

  try {
    const result = await htmlToPdf(autoContainer.value, {
      filename: 'auto-pagination-demo',
    })

    if (!result.success) {
      throw result.error || new Error('PDF 生成失败')
    }
  } catch (error) {
    console.error('导出失败:', error)
    errorMessage.value = error instanceof Error ? error.message : '未知错误'
  } finally {
    isExportingAuto.value = false
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

/* 自动分页容器：页边距由这里的 padding 推导（所见即所得） */
.auto-doc {
  padding: 40px;
}

/* .pdf-page {
  padding: 20px;
  box-sizing: border-box;
} */

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

/* 合并单元格表格：给所有数据单元格显式不透明背景，
   避免 rowspan 占位区下层的行条纹透出（PDF 逐元素绘制，透明单元格不会遮挡下层背景）。 */
.merge-table td {
  background-color: #ffffff;
}

.merge-table .span-cell {
  background-color: #eef4ff;
  font-weight: bold;
}

.hint {
  margin: 4px 0 8px;
  color: #888;
  font-size: 13px;
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

/* 列表与长文本 */
ol,
ul {
  padding-left: 24px;
  line-height: 1.6;
  color: #333;
}

ul ul {
  margin-top: 4px;
}

.long-text {
  line-height: 1.7;
  color: #333;
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
