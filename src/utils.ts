import { Session, h } from 'koishi'
import globalCache from './cache'
import { templates } from './messages'

export const CACHE_KEYS = {
  MEMBERS: 'members',
  USERNAMES: 'usernames'
}

/**
 * 消息处理服务
 * 负责消息生成、发送和管理
 */
export class MessageService {
  /**
   * 从模板获取随机消息并填充变量
   */
  static getRandomMessage(category: string, subCategory: string, variables: Record<string, string> = {}): string {
    const templatesObj = templates as Record<string, Record<string, string[]>>
    if (!templatesObj[category] || !templatesObj[category][subCategory]) {
      return `消息模板未找到: ${category}.${subCategory}`;
    }
    const messageArray = templatesObj[category][subCategory];
    const message = RandomUtil.choose(messageArray);
    return this.replaceVariables(message, variables);
  }

  /**
   * 替换消息中的变量
   */
  private static replaceVariables(message: string, variables: Record<string, string>): string {
    return message.replace(/\{(\w+)\}/g, (_, key) =>
      variables[key] !== undefined ? variables[key] : `{${key}}`);
  }

  /**
   * 设置消息自动撤回
   */
  static async autoRecall(session: Session, message: any, delay = 10000) {
    if (!message) return
    const timer = setTimeout(async () => {
      try {
        const messages = Array.isArray(message) ? message : [message]
        await Promise.all(messages.map(msg => {
          const msgId = typeof msg === 'string' ? msg : msg?.id
          if (msgId) return session.bot.deleteMessage(session.channelId, msgId)
        }))
      } catch (error) {
        console.warn('Auto recall failed:', error)
      }
    }, delay)
    return () => clearTimeout(timer)
  }

  /**
   * 发送消息并设置自动撤回
   */
  static async sendAndRecall(session: Session, content: string, recallDelay = 10000): Promise<any> {
    const message = await session.send(content)
    await this.autoRecall(session, message, recallDelay)
    return message
  }

  /**
   * 发送效果消息
   */
  static async sendEffect(
    session: Session,
    options: {
      category: string,
      type: string,
      variables?: Record<string, string>,
      recall?: boolean,
      recallDelay?: number
    }
  ): Promise<any> {
    const { category, type, variables = {}, recall = false, recallDelay = 5000 } = options;
    const content = this.getRandomMessage(category, type, variables);
    const message = await session.send(content);

    if (recall) {
      await this.autoRecall(session, message, recallDelay);
    }

    return message;
  }

  /**
   * 发送操作结果消息
   */
  static async sendResult(
    session: Session,
    result: {
      success: boolean,
      errorMessage?: string,
      successData?: any
    }
  ): Promise<void> {
    if (!result.success) {
      await this.sendAndRecall(session, result.errorMessage || '操作失败', 5000);
    } else if (result.successData?.message) {
      await session.send(result.successData.message);
    }
  }
}

/**
 * 用户服务
 * 负责用户信息获取和处理
 */
export class UserService {
  static async getGuildMembers(session: Session): Promise<string[]> {
    const cacheKey = `${session.platform}:${session.guildId}`
    const cachedMembers = globalCache.get<string[]>(CACHE_KEYS.MEMBERS, cacheKey)
    if (cachedMembers) return cachedMembers

    try {
      const members: string[] = []
      for await (const member of session.bot.getGuildMemberIter(session.guildId)) {
        const userId = member.user?.id
        if (userId && String(userId) !== String(session.selfId)) {
          members.push(String(userId))
        }
      }

      if (members.length > 0) {
        globalCache.set(CACHE_KEYS.MEMBERS, cacheKey, members, 3600000)
        return members
      }
      return [session.userId]
    } catch (error) {
      console.error('Failed to get guild members:', error)
      return [session.userId]
    }
  }

  static async resolveTarget(session: Session, targetInput?: string): Promise<string> {
    if (!targetInput) return session.userId
    const parsed = h.parse(targetInput)[0]
    return parsed?.type === 'at' ? parsed.attrs.id : targetInput.trim()
  }

  static async getUserName(session: Session, userId: string): Promise<string> {
    if (userId === session.userId) return session.username
    if (userId === 'system') return '系统'

    const cacheKey = `${session.platform}:${userId}:name`
    const cachedName = globalCache.get<string>(CACHE_KEYS.USERNAMES, cacheKey)
    if (cachedName) return cachedName

    try {
      const user = await session.app.database.getUser(session.platform, userId)
      const name = user?.name || userId
      globalCache.set(CACHE_KEYS.USERNAMES, cacheKey, name, 3600000)
      return name
    } catch {
      return userId
    }
  }
}

/**
 * 概率工具
 * 封装各种概率计算和随机逻辑
 */
export class RandomUtil {
  /**
   * 检查是否触发指定概率事件
   */
  static roll(probability: number): boolean {
    return Math.random() < probability;
  }

  /**
   * 从数组中随机选择一项
   */
  static choose<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 获取范围内的随机整数
   */
  static int(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 生成指定范围内的随机浮点数
   */
  static float(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * 计算基于中心分布的概率
   * position为0.5时概率最大，两端递减
   */
  static centeredProbability(min: number, max: number, position: number): number {
    const normalizedPosition = 1 - Math.abs(position - 0.5) * 2;
    return min + normalizedPosition * (max - min);
  }

  /**
   * 基于时间计算概率
   */
  static timeBasedProbability(config: {
    timeRange: string,
    minProb: number,
    maxProb: number
  }): number {
    const position = TimeUtil.getPositionInTimeRange(config.timeRange);
    return this.centeredProbability(config.minProb, config.maxProb, position);
  }

  /**
   * 暴击检查
   */
  static isCritical(rate: number): boolean {
    return this.roll(rate);
  }
}

/**
 * 时间工具
 * 处理时间计算和格式化
 */
export class TimeUtil {
  /**
   * 格式化时长为分钟和秒
   */
  static formatDuration(seconds: number): { minutes: number, seconds: number } {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return { minutes, seconds: remainingSeconds }
  }

  /**
   * 检查当前时间是否在指定时间范围内
   */
  static isWithinTimeRange(timeRange: string): boolean {
    const [startStr, endStr] = timeRange.split('-')
    const startHour = parseInt(startStr, 10)
    const endHour = parseInt(endStr, 10)
    const now = new Date()
    const currentHour = now.getHours()
    return endHour < startHour
      ? currentHour >= startHour || currentHour < endHour
      : currentHour >= startHour && currentHour < endHour
  }

  /**
   * 计算当前时间在时间范围内的相对位置(0-1)
   */
  static getPositionInTimeRange(timeRange: string): number {
    const [startStr, endStr] = timeRange.split('-')
    const startHour = parseInt(startStr, 10)
    const endHour = parseInt(endStr, 10)

    const totalHours = endHour > startHour ?
      endHour - startHour :
      endHour + 24 - startHour

    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()

    let hoursFromStart
    if (endHour > startHour) {
      hoursFromStart = currentHour - startHour + currentMinute/60
    } else {
      hoursFromStart = currentHour >= startHour ?
        currentHour - startHour + currentMinute/60 :
        currentHour + 24 - startHour + currentMinute/60
    }

    return Math.max(0, Math.min(1, hoursFromStart / totalHours))
  }
}
