import { Context, Session } from 'koishi'
import { Config } from './index'
import { MuteService, TimeUtil, MessageService, RandomUtil } from './utils'

/**
 * 初始化口球魔法功能
 */
export function initializeMagicMuteFeature(ctx: Context, config: Config) {
  // 注册消息中间件
  ctx.middleware(async (session, next) => {
    // 只处理消息类型的会话
    if (session.type !== 'message' || !session.channelId || !session.guildId) {
      return next()
    }

    // 检查是否启用了魔法口球功能
    if (!config.magicMute.enabled) {
      return next()
    }

    // 检查是否在活跃时间段
    if (!TimeUtil.isWithinTimeRange(config.magicMute.activeTime)) {
      return next()
    }

    // 获取当前时刻的随机概率
    const currentProbability = calculateCurrentProbability(config.magicMute)

    // 检查是否触发魔法口球
    if (RandomUtil.withProbability(currentProbability)) {
      // 执行禁言
      await executeMagicMute(session, config, currentProbability)
    }
    // 继续处理下一个中间件
    return next()
  })
}

/**
 * 计算当前时刻的触发概率
 * 在设定时间段的中间点概率最高，两端较低
 */
function calculateCurrentProbability(config: Config['magicMute']): number {
  const [startStr, endStr] = config.activeTime.split('-')
  const startHour = parseInt(startStr, 10)
  const endHour = parseInt(endStr, 10)

  // 计算时间段总小时数
  const totalHours = endHour > startHour ?
    endHour - startHour :
    endHour + 24 - startHour

  // 当前小时
  const now = new Date()
  const currentHour = now.getHours()

  // 计算距离开始时间的小时数
  let hoursFromStart
  if (endHour > startHour) {
    hoursFromStart = currentHour - startHour
  } else {
    hoursFromStart = currentHour >= startHour ?
      currentHour - startHour :
      currentHour + 24 - startHour
  }

  // 计算距离中间点的比例
  const midPoint = totalHours / 2
  const distanceFromMid = Math.abs(hoursFromStart - midPoint)
  const normalizedDistance = 1 - (distanceFromMid / midPoint)

  // 根据距离中间点的远近计算概率
  // 中间点使用最大概率，边缘使用最小概率
  const minProb = config.minProbability / 100
  const maxProb = config.maxProbability / 100

  return minProb + normalizedDistance * (maxProb - minProb)
}

/**
 * 执行魔法口球禁言
 */
async function executeMagicMute(session: Session, config: Config, probability: number) {
  try {
    // 计算禁言时长（5-60秒）
    const duration = Math.floor(Math.random() * 55) + 5

    // 执行禁言
    await MuteService.mute(session, session.userId, duration, {
      enableMessage: false,
      deleteOriginalMessage: false
    })

    // 计算百分比概率
    const probabilityPercent = (probability * 100).toFixed(2)

    // 发送消息
    const { minutes, seconds } = TimeUtil.formatDuration(duration)
    await session.send(MessageService.getRandomMessage('magicMute', 'triggered', {
      target: session.username,
      probability: probabilityPercent,
      minutes: String(minutes),
      seconds: String(seconds)
    }))

  } catch (error) {
    console.error('Magic mute failed:', error)
  }
}

/**
 * 获取魔法口球当前状态信息
 */
export function getMagicMuteStatus(config: Config): string {
  const { enabled, activeTime, minProbability, maxProbability } = config.magicMute

  let status = '【神秘口球魔法】\n'
  status += `状态: ${enabled ? '已启用' : '已禁用'}\n`
  status += `活跃时间: ${activeTime}\n`
  status += `概率范围: ${minProbability}%-${maxProbability}%\n`

  // 检查是否在活跃时间段内
  const isActive = TimeUtil.isWithinTimeRange(activeTime)
  status += `当前状态: ${isActive ? '已激活' : '未激活'}`

  // 如果在活跃时间内，显示当前概率
  if (isActive) {
    const currentProbability = calculateCurrentProbability(config.magicMute)
    status += `\n当前概率: ${(currentProbability * 100).toFixed(2)}%`
  }

  return status
}
