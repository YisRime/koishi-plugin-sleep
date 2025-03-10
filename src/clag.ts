import { Context, Session, Random } from 'koishi'
import { Config, ClagFeature } from './index'
import {
  mute,
  autoRecall,
  calculateMuteDuration,
  recordMute,
  resolveMuteTarget,
  initializeSeasonalEvents,
  showEffectMessage,
  cleanExpiredRecords
} from './mute'
import { executeRouletteMode } from './roulette'

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
    cleanExpiredRecords()
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
  if (mode === ClagFeature.ROULETTE) {
    await executeRouletteMode(session, config, rouletteSize || config.clag.rouletteSize)
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
  // 解析目标 - 如果未提供目标，默认为自己
  const inputTargetId = targetInput ? await resolveMuteTarget(session, targetInput) : session.userId

  // 如果是自己禁言自己，直接执行
  if (inputTargetId === session.userId) {
    const muteDuration = calculateMuteDuration(config, duration)
    await mute(session, session.userId, muteDuration, config.enableMessage)

    // 显示自我惩罚提示
    if (config.clag.enableSpecialEffects) {
      const message = await session.send("自食其果！")
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
      const message = await session.send(`哎呀！${session.username}的禁言魔法反弹了！`)
      await autoRecall(session, message, 5000)

      // 记录禁言历史
      recordMute(session, session.userId, muteDuration)
    }
    return
  }

  // 确定最终目标
  const finalTargetId = inputTargetId;

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
  }
}
