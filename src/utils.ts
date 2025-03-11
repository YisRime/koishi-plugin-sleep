import { Session, Random, h } from 'koishi'
import { Config } from './index'
import { getRandomMessage } from './messages'
import globalCache from './cache'

// 缓存存储名称常量
const MEMBER_CACHE = 'members'
const MUTE_HISTORY = 'muteHistory'

/**
 * 自动撤回消息
 */
export const autoRecall = async (session: Session, message: any, delay = 10000) => {
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
 * 获取成员列表
 */
export const getGuildMembers = async (session: Session): Promise<string[]> => {
  const cacheKey = `${session.platform}:${session.guildId}`
  // 检查缓存
  const cachedMembers = globalCache.get<string[]>(MEMBER_CACHE, cacheKey)
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
      globalCache.set(MEMBER_CACHE, cacheKey, members, 3600000)
      return members
    }

    return [session.userId]
  } catch (error) {
    console.error('Failed to get guild members:', error)
    return [session.userId]
  }
}

/**
 * 执行禁言
 */
export const mute = async (session: Session, targetId: string, duration: number, enableMessage: boolean) => {
  try {
    await session.bot.muteGuildMember(session.guildId, targetId, duration * 1000)
    session.messageId && await session.bot.deleteMessage(session.channelId, session.messageId)

    if (enableMessage) {
      const [min, sec] = [(duration / 60) | 0, duration % 60]
      const isSelf = targetId === session.userId

      let username = isSelf ? session.username : targetId
      try {
        if (!isSelf) {
          const user = await session.app.database.getUser(session.platform, targetId)
          username = user?.name || targetId
        }
      } catch (e) {
        console.warn('Failed to get username:', e)
      }

      const messageContent = getRandomMessage(
        'mute',
        isSelf ? 'self' : 'success',
        {
          target: username,
          minutes: String(min),
          seconds: String(sec)
        }
      )

      const msg = await session.send(messageContent)
      await autoRecall(session, msg)
    }
    return true
  } catch (error) {
    console.error('Mute operation failed:', error)
    return false
  }
}

/**
 * 获取禁言对象
 */
export async function resolveMuteTarget(session: Session, targetInput?: string): Promise<string> {
  if (!targetInput) return session.userId

  const parsed = h.parse(targetInput)[0]
  return parsed?.type === 'at' ? parsed.attrs.id : targetInput.trim()
}

/**
 * 计算禁言时长
 */
export function calculateMuteDuration(config: Config, baseDuration?: number, isCriticalHit = false): number {
  let duration = baseDuration ? baseDuration * 60 : new Random().int(config.clag.min * 60, config.clag.max * 60)

  // 暴击效果
  if (isCriticalHit) {
    duration = Math.round(duration * 2)
  }

  // 添加随机波动 (±15%)
  const variation = Math.random() * 0.3 - 0.15
  duration = Math.round(duration * (1 + variation))

  // 确保最小5秒
  return Math.max(5, duration)
}

/**
 * 记录禁言历史
 */
export function recordMute(session: Session, targetId: string, duration: number, sourceUserId?: string): void {
  const historyKey = `${session.platform}:${session.guildId}:${targetId}`

  // 使用缓存管理器存储禁言历史
  globalCache.set(MUTE_HISTORY, historyKey, {
    source: sourceUserId || session.userId,
    timestamp: Date.now(),
    duration
  }, 7 * 24 * 60 * 60 * 1000)
}

/**
 * 获取用户名
 */
export async function getUserName(session: Session, userId: string): Promise<string> {
  if (userId === session.userId) return session.username
  if (userId === 'system') return '系统'

  // 尝试从缓存获取用户名
  const cacheKey = `${session.platform}:${userId}:name`
  const cachedName = globalCache.get<string>('usernames', cacheKey)
  if (cachedName) return cachedName

  try {
    const user = await session.app.database.getUser(session.platform, userId)
    const name = user?.name || userId

    // 缓存用户名（1小时）
    globalCache.set('usernames', cacheKey, name, 3600000)
    return name
  } catch {
    return userId
  }
}

/**
 * 显示特效消息
 */
export async function showEffectMessage(
  session: Session,
  targetId: string,
  isCritical: boolean,
  isTargetSelected: boolean
): Promise<void> {
  let messageCategory: string
  let messageType: string
  const variables: Record<string, string> = {}

  variables.target = await getUserName(session, targetId)
  variables.user = session.username

  if (isCritical) {
    messageCategory = 'effects'
    messageType = 'critical'
  } else if (isTargetSelected) {
    messageCategory = 'effects'
    messageType = 'success'
  } else {
    messageCategory = 'effects'
    messageType = 'randomTarget'
  }

  const message = await session.send(getRandomMessage(
    messageCategory as keyof typeof import('./messages').templates,
    messageType,
    variables
  ))
  await autoRecall(session, message, 5000)
}

/**
 * 格式化时间
 */
export function formatDuration(seconds: number): { minutes: number, seconds: number } {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return { minutes, seconds: remainingSeconds }
}
