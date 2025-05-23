import { Session, h } from 'koishi'
import { ProbMode } from './repeat'

/**
 * 消息发送选项接口
 * @interface MessageOptions
 */
interface MessageOptions {
  /** 是否显示消息 */
  showMessage?: boolean
  /** 是否自动删除 */
  autoDelete?: boolean
  /** 删除延迟时间(ms) */
  deleteDelay?: number
  /** 是否返回内容 */
  returnContent?: boolean
  /** 消息类型(成功/失败) */
  isSuccess?: boolean
}

/**
 * 工具类，提供各种辅助函数
 * @class Utils
 */
export class Utils {
  /**
   * 检查当前时间是否在指定范围内
   * @param range - 时间范围，格式为"开始-结束"
   * @returns 是否在范围内
   */
  static isInTimeRange(range: string): boolean {
    if (!range) return true
    const [start, end] = range.split('-').map(Number)
    const hour = new Date().getHours()
    return end < start ? hour >= start || hour < end : hour >= start && hour < end
  }

  /**
   * 从文本中获取用户ID
   * @param target - 目标文本
   * @returns 用户ID或null
   */
  static getUserId(target: string): string | null {
    if (!target) return null
    const atId = h.select(h.parse(target), 'at')[0]?.attrs?.id
    const userId = atId || target.match(/@(\d+)/)?.[1] || (/^\d+$/.test(target.trim()) ? target.trim() : null)
    return userId && /^\d{5,10}$/.test(userId) ? userId : null
  }

  /**
   * 将秒数格式化为可读的时间字符串
   * @param seconds - 秒数
   * @returns 格式化的时间字符串
   */
  static formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600)
      const remainder = seconds % 3600
      return `${hours}小时${remainder > 0 ? this.formatTime(remainder) : ''}`
    }
    const days = Math.floor(seconds / 86400)
    const remainder = seconds % 86400
    return `${days}天${remainder > 0 ? this.formatTime(remainder) : ''}`
  }

  /**
   * 消息格式化函数，替换占位符
   * @param messages - 消息模板
   * @param targetId - 目标用户ID
   * @param username - 用户名
   * @param duration - 时长
   * @param isSuccess - 是否成功消息
   * @returns 格式化后的消息
   */
  static formatMessage(
    messages: string | string[] | Array<{Success: string, Failure: string}> | undefined,
    targetId: string, username: string, duration: number, isSuccess = true): string {
    if (!messages || (Array.isArray(messages) && !messages.length)) return ''
    // 选择消息模板
    let message: string
    if (typeof messages === 'string') {
      message = messages
    } else if (typeof messages[0] === 'string') {
      message = messages[Math.floor(Math.random() * messages.length)] as string
    } else {
      const template = messages[Math.floor(Math.random() * messages.length)] as {Success: string, Failure: string}
      message = isSuccess ? template.Success : template.Failure
    }
    // 替换占位符
    return message
      .replace(/\{at\}/g, `<at id="${targetId}"/>`)
      .replace(/\{username\}/g, username)
      .replace(/\{duration\}/g, this.formatTime(Math.floor(duration)))
  }

  /**
   * 延迟删除消息
   * @param session - 会话对象
   * @param msg - 消息对象
   * @param delay - 延迟时间(ms)
   */
  static delayDelete(session: Session, msg: any, delay = 10000): void {
    if (!msg) return
    setTimeout(() => {
      const messages = Array.isArray(msg) ? msg : [msg]
      Promise.all(messages.map(m => {
        const msgId = typeof m === 'string' ? m : m?.id
        return msgId && session.bot.deleteMessage(session.channelId, msgId)
      })).catch(() => {})
    }, delay)
  }

  /**
   * 发送消息的通用方法
   * @param session - 会话对象
   * @param message - 消息内容
   * @param options - 消息选项
   */
  static async sendMessage(session: Session, message: string, options: MessageOptions = {}): Promise<void> {
    const { showMessage = true, autoDelete = false, deleteDelay = 10000 } = options
    if (!message || !showMessage) return
    try {
      const sentMsg = await session.send(message)
      if (autoDelete) this.delayDelete(session, sentMsg, deleteDelay)
    } catch {}
  }

  /**
   * 执行禁言并发送消息
   * @param session - 会话对象
   * @param userId - 用户ID
   * @param duration - 禁言时长(秒)
   * @param config - 配置对象
   * @param username - 用户名
   * @param isSuccess - 是否成功
   * @returns 是否禁言成功
   */
  static async mute(session: Session, userId: string, duration: number, config: any,
      username: string, isSuccess = true): Promise<boolean> {
    try {
      await session.bot.muteGuildMember(session.guildId || '', userId, duration * 1000)
      if (config.showMessage) {
        const message = this.formatMessage(isSuccess ? config.Message : config.Message,  userId, username, duration, isSuccess)
        await this.sendMessage(session, message)
      }
      return true
    } catch {
      await this.sendMessage(session, `无法禁言${username}，可能是权限不足`, { autoDelete: true, deleteDelay: 5000 })
      return false
    }
  }

  /**
   * 获取目标用户名
   * @param session - 会话对象
   * @param userId - 用户ID
   * @param defaultName - 默认用户名
   * @returns 用户名
   */
  static async getUsername(session: Session, userId: string, defaultName: string): Promise<string> {
    try {
      const info = await session.bot.getGuildMember(session.guildId, userId)
      return info?.nick || info?.user?.name || defaultName
    } catch {
      return defaultName
    }
  }

  /**
   * 获取随机禁言时长（秒）
   * @param maxMinutes - 最大分钟数
   * @param minSeconds - 最小秒数
   * @returns 随机时长(秒)
   */
  static getRandomDuration(maxMinutes: number, minSeconds = 60): number {
    return Math.max(minSeconds, Math.floor(Math.random() * maxMinutes * 60))
  }

  /**
   * 创建概率管理器
   * @param config - 配置对象
   * @returns 概率管理器对象
   */
  static createProbabilityManager(config: any) {
    let prob = config.probabilityInitial
    const isIncreasing = config.probabilityMode === ProbMode.INCREASING
    return {
      get: () => isIncreasing ? prob : config.probabilityInitial,
      reset: () => { if (isIncreasing) prob = config.probabilityInitial },
      increase: () => { if (isIncreasing) prob = Math.min(prob * 1.1, 0.9) },
      getRate: (minutes: number) => 1 / (1 + Math.exp((minutes - config.maxDuration) / (config.maxDuration / 5))),
      getRepeatRate: (count: number) => 1 / (1 + Math.exp(-(count - 8) / 2.5))
    }
  }
}