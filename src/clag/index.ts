import { Context, Session, Random } from 'koishi'
import { Config, ClagFeature } from '../index'
import { mute, autoRecall, getGuildMembers } from '../mute'
import { executeRouletteMode } from './roulette'
import { executeChainMode, checkChainReactionRight, grantChainReactionRight } from './chain'
import {
  hasImmunity,
  grantImmunity,
  calculateMuteDuration,
  recordMute,
  resolveMuteTarget,
  getUserName,
  initializeSeasonalEvents,
  showEffectMessage
} from './utils'

// 导出工具函数供其他模块使用
export {
  resolveMuteTarget,
  calculateMuteDuration,
  recordMute,
  hasImmunity,
  grantImmunity,
  getUserName
}

/**
 * 初始化clag功能
 */
export function initializeClagFeatures(ctx: Context, config: Config) {
  // 启动定期清理过期记录
  initializeCleaner(ctx)

  // 如果启用节日特效，则初始化节日检查器
  if (config.clag.enableSeasonalEvents) {
    initializeSeasonalEvents(ctx)
  }
}

/**
 * 初始化清理器，定期清理过期数据
 */
function initializeCleaner(ctx: Context) {
  ctx.setInterval(() => {
    // 定期清理过期记录的逻辑在各个模块中实现
    // 这里只需要定期触发即可
  }, 3600 * 1000) // 每小时检查一次
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

  // 根据不同模式处理
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

  // 处理普通禁言模式
  await handleNormalMode(session, config, targetInput, duration)
}

/**
 * 处理普通禁言模式
 */
async function handleNormalMode(
  session: Session,
  config: Config,
  targetInput?: string,
  duration?: number
): Promise<void> {
  // 解析目标
  const inputTargetId = targetInput ? await resolveMuteTarget(session, targetInput) : null

  // 如果是自己禁言自己，直接执行
  if (inputTargetId === session.userId) {
    const muteDuration = calculateMuteDuration(config, duration)
    await mute(session, session.userId, muteDuration, config.enableMessage)

    // 显示自我惩罚提示
    if (config.clag.enableSpecialEffects) {
      const message = await session.send(session.text('commands.clag.effects.self_punishment'))
      await autoRecall(session, message, 3000)
    }
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
  const finalTargetId = await determineFinalTarget(session, inputTargetId)
  if (!finalTargetId) return

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
      await showEffectMessage(session, finalTargetId, isCritical, inputTargetId !== null)
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

/**
 * 确定最终禁言目标
 * 优化版本：使用统一的 getGuildMembers 函数
 */
async function determineFinalTarget(session: Session, inputTargetId?: string): Promise<string | null> {
  if (inputTargetId) return inputTargetId

  try {
    // 使用统一的 getGuildMembers 函数获取成员列表
    const validMembers = await getGuildMembers(session)

    if (!validMembers.length) {
      const message = await session.send(session.text('commands.clag.messages.errors.no_valid_members'))
      await autoRecall(session, message)
      return null
    }

    // 随机选择一个目标
    return validMembers[new Random().int(0, validMembers.length - 1)]
  } catch (error) {
    console.error('Failed to get guild members:', error)
    const message = await session.send(session.text('commands.clag.messages.errors.no_valid_members'))
    await autoRecall(session, message)
    return null
  }
}
