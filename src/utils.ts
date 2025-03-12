import { Session, h } from 'koishi'
import globalCache from './cache'
import { templates } from './messages'

/**
 * 缓存键常量
 */
export const CACHE_KEYS = {
  MEMBERS: 'members',      // 群成员缓存
  USERNAMES: 'usernames',  // 用户名缓存
}

/**
 * 时间工具类
 * 处理时间计算、格式化和比较
 */
export class TimeUtil {
  /**
   * 格式化时长为分钟和秒
   * @param seconds 总秒数
   * @returns 格式化后的分钟和秒
   */
  static formatDuration(seconds: number): { minutes: number, seconds: number } {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return { minutes, seconds: remainingSeconds }
  }

  /**
   * 检查当前时间是否在指定时间范围内
   * @param timeRange 时间范围，格式为"HH-HH"
   * @returns 是否在时间范围内
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
   * @param timeRange 时间范围，格式为"HH-HH"
   * @returns 当前时间在范围内的位置，范围0-1
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

/**
 * 随机工具类
 * 封装各种概率计算和随机逻辑
 */
export class RandomUtil {
  /**
   * 检查是否触发指定概率事件
   * @param probability 概率值(0-1)
   * @returns 是否触发
   */
  static roll(probability: number): boolean {
    return Math.random() < probability;
  }

  /**
   * 从数组中随机选择一项
   * @param arr 输入数组
   * @returns 随机选中的元素
   */
  static choose<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 获取范围内的随机整数
   * @param min 最小值（含）
   * @param max 最大值（含）
   * @returns 随机整数
   */
  static int(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 生成指定范围内的随机浮点数
   * @param min 最小值（含）
   * @param max 最大值（不含）
   * @returns 随机浮点数
   */
  static float(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * 计算基于中心分布的概率
   * position为0.5时概率最大，两端递减
   * @param min 最小概率
   * @param max 最大概率
   * @param position 位置(0-1)
   * @returns 计算后的概率
   */
  static centeredProbability(min: number, max: number, position: number): number {
    const normalizedPosition = 1 - Math.abs(position - 0.5) * 2;
    return min + normalizedPosition * (max - min);
  }

  /**
   * 基于时间计算概率
   * @param config 配置参数
   * @returns 基于当前时间计算的概率
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
   * @param rate 暴击率
   * @returns 是否触发暴击
   */
  static isCritical(rate: number): boolean {
    return this.roll(rate);
  }
}

/**
 * 用户服务
 * 负责用户信息获取和处理
 */
export class UserService {
  /**
   * 获取群组成员列表
   * @param session 会话对象
   * @returns 成员ID数组
   */
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
        globalCache.set(CACHE_KEYS.MEMBERS, cacheKey, members, 3600000) // 缓存1小时
        return members
      }
      return [session.userId]
    } catch (error) {
      console.error('Failed to get guild members:', error)
      return [session.userId]
    }
  }

  /**
   * 解析目标用户ID
   * 支持@用户或直接输入ID
   * @param session 会话对象
   * @param targetInput 目标输入
   * @returns 解析后的用户ID
   */
  static async resolveTarget(session: Session, targetInput?: string): Promise<string> {
    if (!targetInput) return session.userId
    const parsed = h.parse(targetInput)[0]
    return parsed?.type === 'at' ? parsed.attrs.id : targetInput.trim()
  }

  /**
   * 获取用户名称
   * @param session 会话对象
   * @param userId 用户ID
   * @returns 用户名称
   */
  static async getUserName(session: Session, userId: string): Promise<string> {
    if (userId === session.userId) return session.username
    if (userId === 'system') return '系统'

    const cacheKey = `${session.platform}:${userId}:name`
    const cachedName = globalCache.get<string>(CACHE_KEYS.USERNAMES, cacheKey)
    if (cachedName) return cachedName

    try {
      const user = await session.app.database.getUser(session.platform, userId)
      const name = user?.name || userId
      globalCache.set(CACHE_KEYS.USERNAMES, cacheKey, name, 3600000) // 缓存1小时
      return name
    } catch {
      return userId
    }
  }
}

/**
 * 消息服务
 * 负责消息生成、发送和管理
 */
export class MessageService {
  /**
   * 从模板获取随机消息并填充变量
   * @param category 消息类别
   * @param subCategory 消息子类别
   * @param variables 变量映射
   * @returns 格式化后的随机消息
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
   * @param message 原始消息
   * @param variables 变量映射
   * @returns 替换变量后的消息
   */
  private static replaceVariables(message: string, variables: Record<string, string>): string {
    return message.replace(/\{(\w+)\}/g, (_, key) =>
      variables[key] !== undefined ? variables[key] : `{${key}}`);
  }

  /**
   * 设置消息自动撤回
   * @param session 会话对象
   * @param message 消息对象
   * @param delay 延迟时间(毫秒)
   * @returns 取消撤回的函数
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
   * @param session 会话对象
   * @param content 消息内容
   * @param recallDelay 撤回延迟(毫秒)
   * @returns 发送的消息对象
   */
  static async sendAndRecall(session: Session, content: string, recallDelay = 10000): Promise<any> {
    const message = await session.send(content)
    await this.autoRecall(session, message, recallDelay)
    return message
  }

  /**
   * 发送效果消息
   * @param session 会话对象
   * @param options 消息选项
   * @returns 发送的消息对象
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
   * @param session 会话对象
   * @param result 操作结果
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