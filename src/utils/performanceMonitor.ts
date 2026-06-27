/**
 * 性能监控工具
 *
 * 默认静默（`enabled = false`），仅在显式开启时输出控制台报告，
 * 避免库在使用方生产环境污染控制台。
 */

export class PerformanceMonitor {
  private startTime: number = 0
  private checkpoints: Map<string, number> = new Map()
  private durations: Map<string, number> = new Map()
  private enabled: boolean

  constructor(enabled: boolean = false) {
    this.enabled = enabled
  }

  /**
   * 开始监控
   */
  start(): void {
    this.startTime = performance.now()
    this.checkpoints.clear()
    this.durations.clear()
    if (this.enabled) console.log('⏱️  性能监控开始')
  }

  /**
   * 记录检查点
   */
  mark(label: string): void {
    const now = performance.now()
    const duration = now - (this.checkpoints.get('_last') || this.startTime)

    this.checkpoints.set(label, now)
    this.checkpoints.set('_last', now)
    this.durations.set(label, duration)

    if (this.enabled) {
      const total = now - this.startTime
      console.log(`  ├─ ${label}: ${duration.toFixed(2)}ms (总计: ${total.toFixed(2)}ms)`)
    }
  }

  /**
   * 结束监控并输出报告
   */
  end(label: string = '完成'): void {
    const now = performance.now()
    const total = now - this.startTime

    if (!this.enabled) return

    console.log(`  └─ ${label}: ${total.toFixed(2)}ms`)
    console.log('')
    console.log('📊 性能报告:')

    // 按耗时排序
    const sorted = Array.from(this.durations.entries())
      .sort((a, b) => b[1] - a[1])

    sorted.forEach(([name, time], index) => {
      const percentage = ((time / total) * 100).toFixed(1)
      const bar = '█'.repeat(Math.ceil(parseFloat(percentage) / 5))
      console.log(`  ${index + 1}. ${name}: ${time.toFixed(2)}ms (${percentage}%) ${bar}`)
    })

    console.log(`\n  总耗时: ${total.toFixed(2)}ms`)
  }

  /**
   * 获取某个阶段的耗时
   */
  getDuration(label: string): number {
    return this.durations.get(label) || 0
  }

  /**
   * 获取总耗时
   */
  getTotalDuration(): number {
    return performance.now() - this.startTime
  }
}

/**
 * 创建性能监控实例
 * @param enabled 是否输出控制台报告（默认 false，静默）
 */
export function createPerformanceMonitor(enabled: boolean = false): PerformanceMonitor {
  return new PerformanceMonitor(enabled)
}
