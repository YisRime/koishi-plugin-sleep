import { Context, Session } from 'koishi'
import { Config } from './index'
import { TimeUtil, RandomUtil } from './utils'
import { MuteUtils } from './muteUtils'

/**
 * 初始化口球魔法功能
 */
export function initializeMagicMuteFeature(ctx: Context, config: Config) {
  ctx.middleware(async (session, next) => {
    // 基本检查
    if (!shouldProcessMagicMute(session, config)) {
      return next();
    }

    // 计算触发概率并检查是否触发
    const currentProbability = calculateMagicMuteProbability(config.magicMute);
    if (RandomUtil.roll(currentProbability)) {
      await executeMagicMute(session, config, currentProbability);
    }

    return next();
  });
}

/**
 * 检查是否应处理魔法禁言
 */
function shouldProcessMagicMute(session: Session, config: Config): boolean {
  return session.type === 'message' &&
         !!session.channelId &&
         !!session.guildId &&
         config.magicMute.enabled &&
         TimeUtil.isWithinTimeRange(config.magicMute.activeTime);
}

/**
 * 计算魔法禁言触发概率
 */
function calculateMagicMuteProbability(config: Config['magicMute']): number {
  return RandomUtil.timeBasedProbability({
    timeRange: config.activeTime,
    minProb: config.minProbability / 100,
    maxProb: config.maxProbability / 100
  });
}

/**
 * 执行魔法口球禁言
 */
async function executeMagicMute(session: Session, config: Config, probability: number) {
  try {
    // 计算5-60秒的随机禁言时长
    const duration = RandomUtil.int(5, 60);

    await MuteUtils.mute(session, config, {
      targetId: session.userId,
      duration,
      messageOptions: {
        category: 'magicMute',
        type: 'triggered',
        customVars: {
          probability: (probability * 100).toFixed(2)
        }
      }
    });
  } catch (error) {
    console.error('魔法禁言失败:', error);
  }
}

/**
 * 获取魔法口球当前状态信息
 */
export function getMagicMuteStatus(config: Config): string {
  const { enabled, activeTime, minProbability, maxProbability } = config.magicMute

  let status = '【神秘口球魔法】\n' +
               `状态: ${enabled ? '已启用' : '已禁用'}\n` +
               `活跃时间: ${activeTime}\n` +
               `概率范围: ${minProbability}%-${maxProbability}%\n`

  // 检查是否在活跃时间段内
  const isActive = TimeUtil.isWithinTimeRange(activeTime)
  status += `当前状态: ${isActive ? '已激活' : '未激活'}`

  // 如果在活跃时间内，显示当前概率
  if (isActive) {
    const currentProbability = calculateMagicMuteProbability(config.magicMute)
    status += `\n当前概率: ${(currentProbability * 100).toFixed(2)}%`
  }

  return status
}
