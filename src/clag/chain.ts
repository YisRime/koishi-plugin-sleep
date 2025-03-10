import { Session } from 'koishi'
import { Config } from '../index'
import { mute, autoRecall } from '../mute'
import { calculateMuteDuration, recordMute, getUserName } from './utils'

// 连锁禁言权利记录
export const chainReactionRights = new Map<string, {
  expiryTime: number
  sourceUser: string
}>()

/**
 * 记录连锁禁言权利
 */
export function grantChainReactionRight(session: Session, userId: string, sourceUserId: string, expiryHours: number): void {
  const key = `${session.platform}:${session.guildId}:${userId}`

  chainReactionRights.set(key, {
    expiryTime: Date.now() + expiryHours * 60 * 60 * 1000,
    sourceUser: sourceUserId
  })

  // 设置自动过期
  setTimeout(() => {
    chainReactionRights.delete(key)
  }, expiryHours * 60 * 60 * 1000)
}

/**
 * 检查是否有连锁禁言权利
 */
export function checkChainReactionRight(session: Session, userId: string): { hasRight: boolean, sourceUser: string } {
  const key = `${session.platform}:${session.guildId}:${userId}`
  const right = chainReactionRights.get(key)

  if (right && right.expiryTime > Date.now()) {
    chainReactionRights.delete(key) // 用掉即删除
    return { hasRight: true, sourceUser: right.sourceUser }
  }

  return { hasRight: false, sourceUser: '' }
}

/**
 * 执行连锁禁言
 */
export async function executeChainMode(session: Session, config: Config, targetId: string): Promise<boolean> {
  // 检查权限
  const chainRight = checkChainReactionRight(session, session.userId)

  if (!chainRight.hasRight) {
    const message = await session.send(session.text('commands.clag.chain.no_right'))
    await autoRecall(session, message)
    return false
  }

  // 计算禁言时长，连锁禁言默认有1.5倍加成
  const muteDuration = Math.round(calculateMuteDuration(config) * 1.5)

  // 执行禁言
  const success = await mute(session, targetId, muteDuration, config.enableMessage)

  if (success) {
    // 获取相关用户名
    const targetName = await getUserName(session, targetId)
    const sourceName = await getUserName(session, chainRight.sourceUser)

    // 提示复仇禁言效果
    const message = await session.send(session.text('commands.clag.chain.success', [
      session.username,
      targetName,
      sourceName,
      Math.floor(muteDuration / 60),
      muteDuration % 60
    ]))

    // 记录禁言历史
    recordMute(session, targetId, muteDuration, session.userId)

    // 被连锁禁言的人也获得连锁禁言权利，形成多级连锁反应
    if (config.clag.enableChainReaction) {
      grantChainReactionRight(session, targetId, session.userId, config.clag.chainReactionExpiry)
    }

    return true
  }

  return false
}

/**
 * 清理过期的连锁禁言权利
 */
export function cleanExpiredChainRights(): void {
  const now = Date.now()

  chainReactionRights.forEach((right, key) => {
    if (right.expiryTime < now) {
      chainReactionRights.delete(key)
    }
  })
}
