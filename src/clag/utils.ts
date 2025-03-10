import { Context, Session, Random, h } from 'koishi'
import { Config } from '../index'
import { getGuildMembers, autoRecall } from '../mute'

// 禁言历史记录缓存
export const muteHistory = new Map<string, {
  source: string
  timestamp: number
  duration: number
  hasRevengeRight: boolean
}>()

// 免疫记录
export const immunityRecords = new Map<string, number>()

// 特殊日期事件
export const SEASONAL_EVENTS = [
  { month: 1, day: 1, key: 'new_year', multiplier: 0.5 },       // 元旦
  { month: 4, day: 1, key: 'april_fool', multiplier: 2 },       // 愚人节
  { month: 10, day: 31, key: 'halloween', multiplier: 1.5 },    // 万圣节
  { month: 12, day: 25, key: 'christmas', multiplier: 0.8 },    // 圣诞节
  { month: 12, day: 31, key: 'new_year_eve', multiplier: 1.2 }, // 跨年
]

/**
 * 初始化季节性事件
 */
export function initializeSeasonalEvents(ctx: Context): void {
  let lastDate = new Date().getDate()

  // 启动时检查一次
  checkForSeasonalEvent(ctx)

  // 每分钟检查一次日期变化
  ctx.setInterval(() => {
    const now = new Date()
    const currentDate = now.getDate()

    // 如果日期变了，检查是否有特殊节日
    if (currentDate !== lastDate) {
      lastDate = currentDate
      checkForSeasonalEvent(ctx)
    }
  }, 60 * 1000)
}

/**
 * 检查是否是特殊节日
 */
export function checkForSeasonalEvent(ctx: Context): void {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  const event = SEASONAL_EVENTS.find(e => e.month === month && e.day === day)
  if (!event) return

  // 广播节日消息
  ctx.broadcast([
    `commands.clag.seasonal.${event.key}`,
    `commands.clag.seasonal.generic`
  ])
}

/**
 * 获取当前适用的季节效果
 */
export function getCurrentSeasonalEffect(): { key: string, multiplier: number } | null {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  const event = SEASONAL_EVENTS.find(e => e.month === month && e.day === day)
  return event || null
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
 * 是否拥有禁言免疫
 */
export function hasImmunity(userId: string, guildId: string, platform: string): boolean {
  const key = `${platform}:${guildId}:${userId}`
  const expiry = immunityRecords.get(key)
  return expiry ? expiry > Date.now() : false
}

/**
 * 授予禁言免疫
 */
export function grantImmunity(userId: string, guildId: string, platform: string, durationHours = 1): void {
  const key = `${platform}:${guildId}:${userId}`
  const expiry = Date.now() + durationHours * 60 * 60 * 1000
  immunityRecords.set(key, expiry)
}

/**
 * 记录禁言历史
 */
export function recordMute(session: Session, targetId: string, duration: number, sourceUserId?: string): void {
  const historyKey = `${session.platform}:${session.guildId}:${targetId}`

  muteHistory.set(historyKey, {
    source: sourceUserId || session.userId,
    timestamp: Date.now(),
    duration,
    hasRevengeRight: true
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

  // 清理免疫记录
  immunityRecords.forEach((expiry, key) => {
    if (expiry < now) {
      immunityRecords.delete(key)
    }
  })

  // 清理长期未使用的历史记录
  muteHistory.forEach((record, key) => {
    if (now - record.timestamp > 7 * 24 * 60 * 60 * 1000) { // 7天后清理
      muteHistory.delete(key)
    }
  })
}

/**
 * 显示特效消息
 * 移至工具模块以便复用
 */
export async function showEffectMessage(
  session: Session,
  targetId: string,
  isCritical: boolean,
  isTargetSelected: boolean
): Promise<void> {
  let effectMessage: string

  if (isCritical) {
    effectMessage = 'critical_hit'
  } else if (isTargetSelected) {
    effectMessage = 'target_selected'
  } else {
    effectMessage = 'random_victim'
  }

  const targetName = await getUserName(session, targetId)
  const message = await session.send(session.text(`commands.clag.effects.${effectMessage}`, [session.username, targetName]))
  await autoRecall(session, message, 5000)
}

/**
 * 选择随机目标(排除指定用户)
 * 集中实现这个常用功能
 */
export async function selectRandomTarget(
  session: Session,
  excludeIds: string[] = []
): Promise<string | null> {
  try {
    const members = await getGuildMembers(session)

    // 过滤掉排除的ID
    const validMembers = members.filter(id =>
      !excludeIds.includes(id) && id !== session.selfId
    )

    if (!validMembers.length) return null

    // 随机选择一个
    return validMembers[new Random().int(0, validMembers.length - 1)]
  } catch (error) {
    console.error('Failed to select random target:', error)
    return null
  }
}

/**
 * 格式化时间
 * 将秒数格式化为"X分Y秒"
 */
export function formatDuration(seconds: number): { minutes: number, seconds: number } {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return { minutes, seconds: remainingSeconds }
}
