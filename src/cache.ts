import { Context } from 'koishi'

/**
 * 缓存项接口
 */
export interface CacheItem<T> {
  data: T
  expiry: number
}

/**
 * 缓存管理器类
 * 提供统一的缓存管理功能
 */
export class CacheManager {
  private stores: Map<string, Map<string, CacheItem<any>>>
  private cleanupInterval: NodeJS.Timeout

  /**
   * 构造函数
   * @param cleanupIntervalMs 清理间隔（毫秒）
   */
  constructor(private cleanupIntervalMs: number = 3600000) {
    this.stores = new Map()
    this.setupCleanupTask()
  }

  /**
   * 设置或创建一个缓存存储
   * @param storeName 存储名称
   * @returns 该存储的Map引用
   */
  private getStore<T>(storeName: string): Map<string, CacheItem<T>> {
    if (!this.stores.has(storeName)) {
      this.stores.set(storeName, new Map())
    }
    return this.stores.get(storeName) as Map<string, CacheItem<T>>
  }

  /**
   * 设置缓存项
   * @param storeName 存储名称
   * @param key 缓存键
   * @param data 缓存数据
   * @param ttlMs 过期时间（毫秒）
   */
  set<T>(storeName: string, key: string, data: T, ttlMs: number): void {
    const store = this.getStore<T>(storeName)
    store.set(key, {
      data,
      expiry: Date.now() + ttlMs
    })
  }

  /**
   * 获取缓存项
   * @param storeName 存储名称
   * @param key 缓存键
   * @returns 缓存数据，不存在或已过期则返回null
   */
  get<T>(storeName: string, key: string): T | null {
    const store = this.getStore<T>(storeName)
    const item = store.get(key)
    if (!item) return null
    if (item.expiry <= Date.now()) {
      store.delete(key)
      return null
    }
    return item.data
  }

  /**
   * 检查缓存项是否存在且未过期
   * @param storeName 存储名称
   * @param key 缓存键
   * @returns 存在且未过期返回true，否则返回false
   */
  has(storeName: string, key: string): boolean {
    const store = this.getStore(storeName)
    const item = store.get(key)
    if (!item) return false
    if (item.expiry <= Date.now()) {
      store.delete(key)
      return false
    }
    return true
  }

  /**
   * 删除缓存项
   * @param storeName 存储名称
   * @param key 缓存键
   * @returns 删除成功返回true，否则返回false
   */
  delete(storeName: string, key: string): boolean {
    const store = this.getStore(storeName)
    return store.delete(key)
  }

  /**
   * 清空存储
   * @param storeName 存储名称
   */
  clear(storeName: string): void {
    if (this.stores.has(storeName)) {
      this.stores.get(storeName).clear()
    }
  }

  /**
   * 清除所有过期的缓存项
   */
  cleanupExpired(): void {
    const now = Date.now()
    this.stores.forEach((store, storeName) => {
      store.forEach((item, key) => {
        if (item.expiry <= now) {
          store.delete(key)
        }
      })
    })
  }

  /**
   * 设置自动清理任务
   */
  private setupCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired()
    }, this.cleanupIntervalMs)
  }

  /**
   * 关闭缓存管理器
   */
  dispose(): void {
    clearInterval(this.cleanupInterval)
  }

  /**
   * 获取缓存统计信息
   * @returns 各存储的统计信息
   */
  getStats(): Record<string, { total: number }> {
    const stats: Record<string, { total: number }> = {}

    this.stores.forEach((store, name) => {
      stats[name] = { total: store.size }
    })

    return stats
  }
}

// 创建全局的缓存管理器实例
const globalCache = new CacheManager()

/**
 * 初始化缓存服务
 * @param ctx Koishi上下文
 */
export function initializeCache(ctx: Context): void {
  ctx.on('dispose', () => {
    globalCache.dispose()
  })
  if (ctx.logger) {
    ctx.setInterval(() => {
      const stats = globalCache.getStats()
      ctx.logger.debug('Cache stats:', stats)
    }, 3600000)
  }
}
export default globalCache
