import { Session, Context, Random, h } from 'koishi'
import { Config } from './index'

/**
 * 缓存条目类型定义
 */
export type CacheEntry = { data: string[]; expiry: number }

/**
 * 成员列表缓存
 * 键: platform:guildId
 * 值: {data: 成员ID列表, expiry: 过期时间}
 */
export const memberCache = new Map<string, CacheEntry>()

/**
 * 初始化缓存清理任务
 * 定期清理过期的缓存数据
 */
export function initializeCacheCleanup() {
  setInterval(() => {
    const now = Date.now()
    memberCache.forEach((entry, key) => {
      if (entry.expiry <= now) memberCache.delete(key)
    })
  }, 24 * 60 * 60 * 1000)
}

// 禁言历史记录缓存
const muteHistory = new Map<string, {
  source: string
  timestamp: number
  duration: number
}>()

// 特殊日期事件
const SEASONAL_EVENTS = [
  { month: 1, day: 1, key: 'new_year', multiplier: 0.5 },       // 元旦
  { month: 4, day: 1, key: 'april_fool', multiplier: 2 },       // 愚人节
  { month: 10, day: 31, key: 'halloween', multiplier: 1.5 },    // 万圣节
  { month: 12, day: 25, key: 'christmas', multiplier: 0.8 },    // 圣诞节
  { month: 12, day: 31, key: 'new_year_eve', multiplier: 1.2 }, // 跨年
]

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
  const cached = memberCache.get(cacheKey)

  // 优先使用缓存
  if (cached?.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const members: string[] = [];

    // 使用异步迭代器获取成员列表
    for await (const member of session.bot.getGuildMemberIter(session.guildId)) {
      const userId = member.user?.id;
      if (userId && String(userId) !== String(session.selfId)) {
        members.push(String(userId));
      }
    }

    // 如果找到成员，缓存结果
    if (members.length > 0) {
      memberCache.set(cacheKey, {
        data: members,
        expiry: Date.now() + 3600000 // 缓存1小时
      });
      return members;
    }

    return [session.userId];
  } catch (error) {
    console.error('Failed to get guild members:', error);
    return [session.userId];
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

      const msg = await session.send(isSelf
        ? `已将你禁言${min}分钟${sec}秒`
        : `已将${username}禁言${min}分钟${sec}秒`)
      await autoRecall(session, msg)
    }
    return true
  } catch (error) {
    console.error('Mute operation failed:', error)
    return false
  }
}

/**
 * 获取当前适用的季节效果
 */
function getCurrentSeasonalEffect(): { key: string, multiplier: number } | null {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  return SEASONAL_EVENTS.find(e => e.month === month && e.day === day) || null
}

/**
 * 初始化季节性事件
 */
export function initializeSeasonalEvents(ctx: Context): void {
  let lastDate = new Date().getDate()
  checkForSeasonalEvent(ctx)

  ctx.setInterval(() => {
    const now = new Date()
    const currentDate = now.getDate()
    if (currentDate !== lastDate) {
      lastDate = currentDate
      checkForSeasonalEvent(ctx)
    }
  }, 60 * 1000)
}

/**
 * 检查是否是特殊节日
 */
function checkForSeasonalEvent(ctx: Context): void {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  const event = SEASONAL_EVENTS.find(e => e.month === month && e.day === day)
  if (!event) return

  const messages = {
    'new_year': '元旦快乐！今天被禁言的时间减半～',
    'april_fool': '愚人节快乐！今天被禁言的时间翻倍！',
    'halloween': '万圣节快乐！禁言时间增加50%，好好享受"安静"的万圣夜吧！',
    'christmas': '圣诞快乐！禁言时间减少20%，这是圣诞老人的礼物～',
    'new_year_eve': '跨年夜！禁言时间增加20%，安静地迎接新的一年吧！',
    'generic': '今天是特殊日子，禁言效果有所变化！'
  }

  ctx.broadcast(messages[event.key] || messages.generic)
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

  // 特殊节日效果
  if (config.clag.enableSeasonalEvents) {
    const effect = getCurrentSeasonalEffect()
    if (effect) {
      duration = Math.round(duration * effect.multiplier)
    }
  }

  // 暴击效果
  if (isCriticalHit) {
    duration = Math.round(duration * 2)
  }

  // 添加随机波动 (±15%)
  const variation = Math.random() * 0.3 - 0.15
  duration = Math.round(duration * (1 + variation))

  // 确保最小5秒，最大设定上限
  return Math.max(5, Math.min(duration, config.maxAllowedDuration * 60))
}

/**
 * 记录禁言历史
 */
export function recordMute(session: Session, targetId: string, duration: number, sourceUserId?: string): void {
  const historyKey = `${session.platform}:${session.guildId}:${targetId}`

  muteHistory.set(historyKey, {
    source: sourceUserId || session.userId,
    timestamp: Date.now(),
    duration
  })

  // 设置过期清理
  setTimeout(() => {
    muteHistory.delete(historyKey)
  }, 7 * 24 * 60 * 60 * 1000) // 7天后清理
}

/**
 * 获取用户名
 */
export async function getUserName(session: Session, userId: string): Promise<string> {
  if (userId === session.userId) return session.username
  if (userId === 'system') return '系统'

  try {
    const user = await session.app.database.getUser(session.platform, userId)
    return user?.name || userId
  } catch {
    return userId
  }
}

/**
 * 清理过期记录
 */
export function cleanExpiredRecords(): void {
  const now = Date.now()
  muteHistory.forEach((record, key) => {
    if (now - record.timestamp > 7 * 24 * 60 * 60 * 1000) {
      muteHistory.delete(key)
    }
  })
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
  let effectMessage: string
  const targetName = await getUserName(session, targetId)

  if (isCritical) {
    effectMessage = `暴击！禁言时间翻倍！`
  } else if (isTargetSelected) {
    effectMessage = `${session.username}成功施放了禁言术！`
  } else {
    effectMessage = `命运之轮转动，${targetName}成为了被选中的幸运儿！`
  }

  const message = await session.send(effectMessage)
  await autoRecall(session, message, 5000)
}

/**
 * 选择随机目标(排除指定用户)
 */
export async function selectRandomTarget(
  session: Session,
  excludeIds: string[] = []
): Promise<string | null> {
  try {
    const members = await getGuildMembers(session)
    const validMembers = members.filter(id =>
      !excludeIds.includes(id) && id !== session.selfId
    )

    if (!validMembers.length) return null
    return validMembers[new Random().int(0, validMembers.length - 1)]
  } catch (error) {
    console.error('Failed to select random target:', error)
    return null
  }
}

/**
 * 格式化时间
 */
export function formatDuration(seconds: number): { minutes: number, seconds: number } {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return { minutes, seconds: remainingSeconds }
}
