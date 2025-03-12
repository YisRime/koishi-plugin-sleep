import { Session, Random, h } from 'koishi'
import { Config } from './index'
import globalCache from './cache'
import { templates } from './messages'

// 缓存键常量
export const CACHE_KEYS = {
  MEMBERS: 'members',
  MUTE_HISTORY: 'muteHistory',
  USERNAMES: 'usernames'
}

/**
 * 消息服务类 - 处理所有与消息相关的操作
 */
export class MessageService {
  /**
   * 获取随机消息并替换变量
   */
  static getRandomMessage(
    category: string,
    subCategory: string,
    variables: Record<string, string> = {}
  ): string {
    // 修复: 改进类型检查和错误处理
    const templatesObj = templates as Record<string, Record<string, string[]>>
    if (!templatesObj[category] || !templatesObj[category][subCategory]) {
      return `消息模板未找到: ${category}.${subCategory}`;
    }

    const messageArray = templatesObj[category][subCategory];
    const message = messageArray[Math.floor(Math.random() * messageArray.length)];

    // 替换变量
    return message.replace(/\{(\w+)\}/g, (_, key) =>
      variables[key] !== undefined ? variables[key] : `{${key}}`
    );
  }

  /**
   * 自动撤回消息
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
   * 发送并自动撤回消息
   */
  static async sendAndRecall(session: Session, content: string, recallDelay = 10000): Promise<any> {
    const message = await session.send(content)
    await this.autoRecall(session, message, recallDelay)
    return message
  }

  /**
   * 显示特效消息
   * @deprecated 推荐直接使用session.send结合getRandomMessage
   */
  static async showEffect(
    session: Session,
    category: string,
    subType: string,
    variables: Record<string, string> = {},
    recallDelay = 5000
  ): Promise<void> {
    const content = this.getRandomMessage(category, subType, variables)
    const message = await session.send(content)
    await this.autoRecall(session, message, recallDelay)
  }
}

/**
 * 用户服务类 - 处理用户相关信息
 */
export class UserService {
  /**
   * 获取成员列表
   */
  static async getGuildMembers(session: Session): Promise<string[]> {
    const cacheKey = `${session.platform}:${session.guildId}`
    // 检查缓存
    const cachedMembers = globalCache.get<string[]>(CACHE_KEYS.MEMBERS, cacheKey)
    if (cachedMembers) {
      return cachedMembers
    }

    try {
      const members: string[] = []
      // 使用异步迭代器获取成员列表
      for await (const member of session.bot.getGuildMemberIter(session.guildId)) {
        const userId = member.user?.id
        if (userId && String(userId) !== String(session.selfId)) {
          members.push(String(userId))
        }
      }

      // 缓存结果 (一小时过期)
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

  /**
   * 解析目标用户ID - 支持文本ID或at标签
   */
  static async resolveTarget(session: Session, targetInput?: string): Promise<string> {
    if (!targetInput) return session.userId

    const parsed = h.parse(targetInput)[0]
    return parsed?.type === 'at' ? parsed.attrs.id : targetInput.trim()
  }

  /**
   * 获取用户名
   */
  static async getUserName(session: Session, userId: string): Promise<string> {
    if (userId === session.userId) return session.username
    if (userId === 'system') return '系统'

    // 尝试从缓存获取用户名
    const cacheKey = `${session.platform}:${userId}:name`
    const cachedName = globalCache.get<string>(CACHE_KEYS.USERNAMES, cacheKey)
    if (cachedName) return cachedName

    try {
      const user = await session.app.database.getUser(session.platform, userId)
      const name = user?.name || userId

      // 缓存用户名（1小时）
      globalCache.set(CACHE_KEYS.USERNAMES, cacheKey, name, 3600000)
      return name
    } catch {
      return userId
    }
  }
}

/**
 * 禁言服务类 - 处理禁言相关功能
 */
export class MuteService {
  /**
   * 执行禁言并处理相关逻辑
   */
  static async mute(
    session: Session,
    targetId: string,
    duration: number,
    options: {
      enableMessage?: boolean,
      recordHistory?: boolean,
      messageCategory?: string,
      messageType?: string,
      deleteOriginalMessage?: boolean
    } = {}
  ): Promise<boolean> {
    const {
      enableMessage = false,
      recordHistory = false,
      messageCategory = 'mute',
      messageType = 'success',
      deleteOriginalMessage = true
    } = options;

    try {
      // 检查必要参数
      if (!session.guildId) {
        console.error('Mute failed: Missing guildId')
        return false
      }

      // 检查是否为自身
      const isSelf = targetId === session.userId

      // 尝试使用多种可能的API调用禁言
      try {
        // 第一种尝试: 标准API
        await session.bot.muteGuildMember(session.guildId, targetId, duration * 1000)
      } catch (err) {
        // 第二种尝试: 部分平台使用不同API
        try {
          // @ts-ignore - 某些平台特殊API
          await session.bot.mute(session.guildId, targetId, duration)
        } catch (err2) {
          // 第三种尝试: 其他可能的API变种
          try {
            // @ts-ignore - 兼容其他平台API
            await session.bot.setGuildMemberMute(session.guildId, targetId, true, duration)
          } catch (err3) {
            // 如果所有尝试都失败，则抛出错误
            throw new Error(`无法执行禁言操作: ${err?.message || err2?.message || err3?.message || '未知错误'}`)
          }
        }
      }

      // 删除触发消息
      if (deleteOriginalMessage && session.messageId) {
        try {
          await session.bot.deleteMessage(session.channelId, session.messageId)
        } catch (deleteError) {
          console.warn('Failed to delete original message:', deleteError)
          // 继续执行，不要因为无法删除消息而中断流程
        }
      }

      // 记录禁言历史
      if (recordHistory) {
        this.recordMute(session, targetId, duration)
      }

      // 发送禁言提示
      if (enableMessage) {
        const { minutes, seconds } = TimeUtil.formatDuration(duration)

        let username = await UserService.getUserName(session, targetId)

        // 发送禁言消息
        const messageContent = MessageService.getRandomMessage(
          messageCategory as keyof typeof templates,
          isSelf ? 'self' : messageType,
          {
            target: username,
            minutes: String(minutes),
            seconds: String(seconds)
          }
        )

        const msg = await session.send(messageContent)
        await MessageService.autoRecall(session, msg)
      }
      return true
    } catch (error) {
      console.error('Mute operation failed:', error)
      // 如果配置了消息提示，则发送失败消息
      if (enableMessage) {
        try {
          const errorMsg = error instanceof Error ? error.message : String(error)
          const msg = await session.send(`禁言操作失败: ${errorMsg}`)
          await MessageService.autoRecall(session, msg, 5000)
        } catch (e) {
          console.error('Failed to send error message:', e)
        }
      }
      return false
    }
  }

  /**
   * 计算禁言时长
   */
  static calculateDuration(
    config: Config,
    options: {
      baseDuration?: number,
      isCriticalHit?: boolean,
      randomVariation?: boolean
    } = {}
  ): number {
    const { baseDuration, isCriticalHit = false, randomVariation = true } = options;

    let duration = baseDuration ?
      baseDuration * 60 :
      new Random().int(config.clag.min * 60, config.clag.max * 60);

    // 暴击效果
    if (isCriticalHit) {
      duration = Math.round(duration * 2);
    }

    // 添加随机波动 (±15%)
    if (randomVariation) {
      const variation = Math.random() * 0.3 - 0.15;
      duration = Math.round(duration * (1 + variation));
    }

    // 确保最小5秒
    return Math.max(5, duration);
  }

  /**
   * 记录禁言历史
   */
  static recordMute(session: Session, targetId: string, duration: number, sourceUserId?: string): void {
    const historyKey = `${session.platform}:${session.guildId}:${targetId}`;

    globalCache.set(CACHE_KEYS.MUTE_HISTORY, historyKey, {
      source: sourceUserId || session.userId,
      timestamp: Date.now(),
      duration
    }, 7 * 24 * 60 * 60 * 1000); // 保存7天
  }
}

/**
 * 时间工具类
 */
export class TimeUtil {
  /**
   * 格式化秒数为分钟和秒
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

    // 处理跨日的时间范围
    if (endHour < startHour) {
      // 例如22-6表示晚上10点到次日早上6点
      return currentHour >= startHour || currentHour < endHour
    } else {
      // 例如10-18表示上午10点到下午6点
      return currentHour >= startHour && currentHour < endHour
    }
  }
}

/**
 * 随机工具类
 */
export class RandomUtil {
  /**
   * 基于概率判断是否触发
   */
  static withProbability(probability: number): boolean {
    return Math.random() < probability;
  }

  /**
   * 从数组中随机选择元素
   */
  static choose<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}

// 保留兼容性导出
export const getRandomMessage = MessageService.getRandomMessage;
export const autoRecall = MessageService.autoRecall;
export const getGuildMembers = UserService.getGuildMembers;
export const resolveMuteTarget = UserService.resolveTarget;
export const getUserName = UserService.getUserName;
export const calculateMuteDuration = MuteService.calculateDuration;
export const recordMute = MuteService.recordMute;
export const formatDuration = TimeUtil.formatDuration;
export const showEffectMessage = MessageService.showEffect;
