import { Context, Session, Random, h } from 'koishi'
import { Config, ClagFeature } from './index'
import { mute, autoRecall, getGuildMembers } from './mute'

// 禁言结果类型定义
type MuteResult = {
  success: boolean
  targetId: string
  duration: number
  reason: string
  chainReactionSource?: string
}

// 禁言历史记录缓存
const muteHistory = new Map<string, {
  source: string
  timestamp: number
  duration: number
  hasRevengeRight: boolean
}>()

// 连锁禁言权利记录
const chainReactionRights = new Map<string, {
  expiryTime: number
  sourceUser: string
}>()

// 免疫记录
const immunityRecords = new Map<string, number>()

// 特殊日期事件
const SEASONAL_EVENTS = [
  { month: 1, day: 1, key: 'new_year', multiplier: 0.5 },       // 元旦
  { month: 4, day: 1, key: 'april_fool', multiplier: 2 },       // 愚人节
  { month: 10, day: 31, key: 'halloween', multiplier: 1.5 },    // 万圣节
  { month: 12, day: 25, key: 'christmas', multiplier: 0.8 },    // 圣诞节
  { month: 12, day: 31, key: 'new_year_eve', multiplier: 1.2 }, // 跨年
]

/**
 * 初始化clag功能
 */
export function initializeClagFeatures(ctx: Context, config: Config) {
  // 定期清理过期记录
  ctx.setInterval(() => {
    const now = Date.now()

    // 清理连锁禁言权利
    chainReactionRights.forEach((right, key) => {
      if (right.expiryTime < now) {
        chainReactionRights.delete(key)
      }
    })

    // 清理长期未使用的历史记录
    muteHistory.forEach((record, key) => {
      if (now - record.timestamp > 7 * 24 * 60 * 60 * 1000) { // 7天后清理
        muteHistory.delete(key)
      }
    })

    // 清理免疫记录
    immunityRecords.forEach((expiry, key) => {
      if (expiry < now) {
        immunityRecords.delete(key)
      }
    })
  }, 3600 * 1000) // 每小时检查一次

  // 如果启用节日特效，则注册日期变更检测
  if (config.clag.enableSeasonalEvents) {
    let lastDate = new Date().getDate()

    ctx.setInterval(() => {
      const now = new Date()
      const currentDate = now.getDate()

      // 如果日期变了，检查是否有特殊节日
      if (currentDate !== lastDate) {
        lastDate = currentDate
        checkForSeasonalEvent(ctx)
      }
    }, 60 * 1000) // 每分钟检查一次

    // 启动时也检查一次
    checkForSeasonalEvent(ctx)
  }
}

/**
 * 检查是否是特殊节日
 */
function checkForSeasonalEvent(ctx: Context) {
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
function getCurrentSeasonalEffect(): { key: string, multiplier: number } | null {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()

  const event = SEASONAL_EVENTS.find(e => e.month === month && e.day === day)
  return event || null
}

/**
 * 获取禁言对象
 */
async function resolveMuteTarget(session: Session, targetInput?: string): Promise<string> {
  if (!targetInput) return session.userId

  const parsed = h.parse(targetInput)[0]
  return parsed?.type === 'at' ? parsed.attrs.id : targetInput.trim()
}

/**
 * 计算禁言时长
 */
function calculateMuteDuration(config: Config, baseDuration?: number, isCriticalHit = false): number {
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
function hasImmunity(userId: string, guildId: string, platform: string): boolean {
  const key = `${platform}:${guildId}:${userId}`
  const expiry = immunityRecords.get(key)
  return expiry ? expiry > Date.now() : false
}

/**
 * 授予禁言免疫
 */
function grantImmunity(userId: string, guildId: string, platform: string, durationHours = 1): void {
  const key = `${platform}:${guildId}:${userId}`
  const expiry = Date.now() + durationHours * 60 * 60 * 1000
  immunityRecords.set(key, expiry)
}

/**
 * 记录禁言历史
 */
function recordMute(session: Session, targetId: string, duration: number, sourceUserId?: string): void {
  const historyKey = `${session.platform}:${session.guildId}:${targetId}`

  muteHistory.set(historyKey, {
    source: sourceUserId || session.userId,
    timestamp: Date.now(),
    duration,
    hasRevengeRight: true
  })
}

/**
 * 记录连锁禁言权利
 */
function grantChainReactionRight(session: Session, userId: string, sourceUserId: string, expiryHours: number): void {
  const key = `${session.platform}:${session.guildId}:${userId}`

  chainReactionRights.set(key, {
    expiryTime: Date.now() + expiryHours * 60 * 60 * 1000,
    sourceUser: sourceUserId
  })
}

/**
 * 检查是否有连锁禁言权利
 */
function checkChainReactionRight(session: Session, userId: string): { hasRight: boolean, sourceUser: string } {
  const key = `${session.platform}:${session.guildId}:${userId}`
  const right = chainReactionRights.get(key)

  if (right && right.expiryTime > Date.now()) {
    chainReactionRights.delete(key) // 用掉即删除
    return { hasRight: true, sourceUser: right.sourceUser }
  }

  return { hasRight: false, sourceUser: '' }
}

/**
 * 获取用户名
 */
async function getUserName(session: Session, userId: string): Promise<string> {
  if (userId === session.userId) return session.username
  try {
    const user = await session.app.database.getUser(session.platform, userId)
    return user?.name || userId
  } catch {
    return userId
  }
}

/**
 * 执行禁言轮盘
 */
async function executeRouletteMode(session: Session, config: Config, count: number = 3): Promise<MuteResult> {
  try {
    // 获取成员列表
    const members = await getGuildMembers(session)

    // 过滤掉机器人
    const validMembers = members.filter(id => id !== session.selfId)
    if (validMembers.length < 2) {
      const message = await session.send(session.text('commands.clag.messages.errors.not_enough_members'))
      await autoRecall(session, message)
      return { success: false, targetId: '', duration: 0, reason: '' }
    }

    // 选择轮盘参与者
    const participantCount = Math.min(count, validMembers.length)
    const participants: string[] = []

    // 确保发起者在内
    participants.push(session.userId)

    // 随机选择其他参与者
    const remainingMembers = validMembers.filter(id => id !== session.userId)
    while (participants.length < participantCount && remainingMembers.length > 0) {
      const index = new Random().int(0, remainingMembers.length - 1)
      participants.push(remainingMembers[index])
      remainingMembers.splice(index, 1)
    }

    // 打乱顺序
    participants.sort(() => Math.random() - 0.5)

    // 发送轮盘启动消息
    const participantsNames = await Promise.all(participants.map(id => getUserName(session, id)))
    const message = await session.send(session.text('commands.clag.roulette.start', [participantsNames.join('、')]))

    // 随机选择最终禁言目标
    let victimIndex = new Random().int(0, participants.length - 1)
    let targetId = participants[victimIndex]

    // 检查是否有免疫
    if (hasImmunity(targetId, session.guildId, session.platform)) {
      const immuneUserName = await getUserName(session, targetId)
      await session.send(session.text('commands.clag.effects.immunity', [immuneUserName]))

      // 重新选择，排除免疫者
      const newParticipants = participants.filter(id => id !== targetId)
      if (newParticipants.length === 0) {
        await session.send(session.text('commands.clag.roulette.all_immune'))
        return { success: false, targetId: '', duration: 0, reason: '' }
      }

      victimIndex = new Random().int(0, newParticipants.length - 1)
      targetId = newParticipants[victimIndex]
    }

    // 计算禁言时长
    const isCritical = new Random().bool(config.clag.criticalHitProbability)
    const muteDuration = calculateMuteDuration(config, null, isCritical)

    // 模拟转盘效果
    for (let i = 0; i < participants.length; i++) {
      const currentName = await getUserName(session, participants[i])
      const indicatorMsg = await session.send(session.text('commands.clag.roulette.spinning', [currentName]))
      await autoRecall(session, indicatorMsg, 800)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // 执行禁言
    const success = await mute(session, targetId, muteDuration, config.enableMessage)

    // 发送最终结果
    const victimName = await getUserName(session, targetId)
    const resultMsg = await session.send(session.text('commands.clag.roulette.result', [
      victimName,
      Math.floor(muteDuration / 60),
      muteDuration % 60,
      isCritical ? session.text('commands.clag.effects.critical_hit') : ''
    ]))

    // 如果启用连锁禁言，给予复仇权利
    if (config.clag.enableChainReaction) {
      grantChainReactionRight(session, targetId, session.userId, config.clag.chainReactionExpiry)
    }

    // 记录禁言历史
    recordMute(session, targetId, muteDuration, session.userId)

    return {
      success,
      targetId,
      duration: muteDuration,
      reason: 'roulette_victim',
    }
  } catch (error) {
    console.error('Roulette mode failed:', error)
    return { success: false, targetId: '', duration: 0, reason: '' }
  }
}

/**
 * 执行连锁禁言
 */
async function executeChainMode(session: Session, config: Config, targetId: string): Promise<MuteResult> {
  const chainRight = checkChainReactionRight(session, session.userId)

  if (!chainRight.hasRight) {
    const message = await session.send(session.text('commands.clag.chain.no_right'))
    await autoRecall(session, message)
    return { success: false, targetId: '', duration: 0, reason: '' }
  }

  // 计算禁言时长，连锁禁言默认有1.5倍加成
  const muteDuration = Math.round(calculateMuteDuration(config) * 1.5)

  // 执行禁言
  const success = await mute(session, targetId, muteDuration, config.enableMessage)

  if (success) {
    const targetName = await getUserName(session, targetId)
    const sourceName = await getUserName(session, chainRight.sourceUser)

    // 提示复仇禁言效果
    const message = await session.send(session.text('commands.clag.chain.success', [
      session.username, targetName, sourceName,
      Math.floor(muteDuration / 60), muteDuration % 60
    ]))

    // 记录禁言历史
    recordMute(session, targetId, muteDuration, session.userId)

    return {
      success: true,
      targetId,
      duration: muteDuration,
      reason: 'chain_reaction',
      chainReactionSource: chainRight.sourceUser
    }
  }

  return { success: false, targetId, duration: muteDuration, reason: '' }
}

/**
 * 处理禁言操作主函数
 */
export async function handleMuteOperation(
  session: Session,
  config: Config,
  targetInput?: string,
  duration?: number,
  mode: ClagFeature = ClagFeature.NORMAL,
  rouletteSize?: number
): Promise<void> {
  // 验证禁言时长
  if (duration && duration > config.maxAllowedDuration) {
    const message = await session.send(session.text('commands.clag.messages.errors.duration_too_long', [config.maxAllowedDuration]))
    await autoRecall(session, message)
    return
  }

  // 选择模式进入不同的处理流程
  switch (mode) {
    case ClagFeature.ROULETTE:
      await executeRouletteMode(session, config, rouletteSize || config.clag.rouletteSize)
      return

    case ClagFeature.CHAIN:
      // 目标检验
      if (!targetInput) {
        const message = await session.send(session.text('commands.clag.chain.no_target'))
        await autoRecall(session, message)
        return
      }

      const chainTargetId = await resolveMuteTarget(session, targetInput)
      if (chainTargetId === session.userId) {
        const message = await session.send(session.text('commands.clag.chain.self_error'))
        await autoRecall(session, message)
        return
      }

      await executeChainMode(session, config, chainTargetId)
      return
  }

  // 下面处理普通禁言模式

  // 解析目标
  const inputTargetId = targetInput ? await resolveMuteTarget(session, targetInput) : null

  // 如果是自己禁言自己，直接执行
  if (inputTargetId === session.userId) {
    const muteDuration = calculateMuteDuration(config, duration)
    await mute(session, session.userId, muteDuration, config.enableMessage)
    return
  }

  // 随机决定是否禁言成功
  if (!new Random().bool(config.probability)) {
    // 禁言失败，反弹到发起者
    const muteDuration = calculateMuteDuration(config, duration)
    const success = await mute(session, session.userId, muteDuration, config.enableMessage)

    if (success && config.clag.enableSpecialEffects) {
      const message = await session.send(session.text('commands.clag.effects.backfire', [session.username]))
      await autoRecall(session, message, 5000)

      // 记录禁言历史
      recordMute(session, session.userId, muteDuration)

      // 启用连锁禁言机制
      if (config.clag.enableChainReaction) {
        grantChainReactionRight(session, session.userId, inputTargetId || 'system', config.clag.chainReactionExpiry)
      }
    }
    return
  }

  // 确定最终目标
  let finalTargetId: string

  if (inputTargetId) {
    // 指定了目标
    finalTargetId = inputTargetId
  } else {
    // 随机选择目标
    const members = await getGuildMembers(session)
    const validMembers = members.filter(id => id !== session.selfId)

    if (!validMembers.length) {
      const message = await session.send(session.text('commands.clag.messages.errors.no_valid_members'))
      await autoRecall(session, message)
      return
    }

    finalTargetId = validMembers[new Random().int(0, validMembers.length - 1)]
  }

  // 检查是否有免疫
  if (hasImmunity(finalTargetId, session.guildId, session.platform) && config.clag.enableSpecialEffects) {
    const immuneUserName = await getUserName(session, finalTargetId)
    const message = await session.send(session.text('commands.clag.effects.immunity', [immuneUserName]))
    await autoRecall(session, message)
    return
  }

  // 随机决定是否暴击
  const isCritical = config.clag.enableSpecialEffects && new Random().bool(config.clag.criticalHitProbability)

  // 计算禁言时长
  const muteDuration = calculateMuteDuration(config, duration, isCritical)

  // 执行禁言
  const success = await mute(session, finalTargetId, muteDuration, config.enableMessage)

  if (success) {
    // 特殊效果提示
    if (config.clag.enableSpecialEffects) {
      let effectMessage: string

      if (isCritical) {
        effectMessage = 'critical_hit'
      } else if (inputTargetId) {
        effectMessage = 'target_selected'
      } else {
        effectMessage = 'random_victim'
      }

      const targetName = await getUserName(session, finalTargetId)
      const message = await session.send(session.text(`commands.clag.effects.${effectMessage}`, [session.username, targetName]))
      await autoRecall(session, message, 5000)
    }

    // 记录禁言历史
    recordMute(session, finalTargetId, muteDuration, session.userId)

    // 如果启用连锁禁言，给予复仇权利
    if (config.clag.enableChainReaction) {
      grantChainReactionRight(session, finalTargetId, session.userId, config.clag.chainReactionExpiry)
    }

    // 小概率赐予目标免疫权
    if (config.clag.enableSpecialEffects && new Random().bool(config.clag.immunityProbability)) {
      grantImmunity(finalTargetId, session.guildId, session.platform, 1)
    }
  }
}
