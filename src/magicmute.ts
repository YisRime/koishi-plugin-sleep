import { Context, Session } from 'koishi'
import { Config } from './index'
import { mute, formatDuration } from './utils'
import { getRandomMessage } from './messages'

// 活跃频道监控
const activeChannels = new Map<string, boolean>()

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
    if (!isWithinMagicTime(config.magicMute.activeTime)) {
      return next()
    }

    // 获取当前时刻的随机概率
    const currentProbability = calculateCurrentProbability(config.magicMute)

    // 检查是否触发魔法口球
    if (shouldTriggerMagicMute(currentProbability)) {
      // 执行禁言
      await executeMagicMute(session, config, currentProbability)
    }

    // 继续处理下一个中间件
    return next()
  })

  // 注册命令
  ctx.command('magicmute', '神秘口球魔法设置')
    .channelFields(['guildId'])
    .option('status', '-s 查看当前状态')
    .option('enable', '-e [value:boolean] 启用/禁用魔法口球', { fallback: true })
    .action(async ({ session, options }) => {

      // 查看状态
      if (options.status) {
        return getMagicMuteStatus(config)
      }

      // 更新设置
      if ('enable' in options) {
        config.magicMute.enabled = options.enable
        return `神秘的口球魔法已${options.enable ? '启用' : '禁用'}`
      }

      // 默认显示帮助信息
      return '神秘口球魔法：在特定时间段内，说话有概率被禁言\n' +
        '使用 -s 查看当前状态\n' +
        '使用 -e 启用或禁用'
    })
}

/**
 * 检查当前时间是否在口球魔法的活跃时间段内
 */
function isWithinMagicTime(timeRange: string): boolean {
  // 解析时间范围，格式为"开始-结束"，如"22-6"表示晚上10点到早上6点
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
 * 决定是否触发魔法口球
 */
function shouldTriggerMagicMute(probability: number): boolean {
  return Math.random() < probability
}

/**
 * 执行魔法口球禁言
 */
async function executeMagicMute(session: Session, config: Config, probability: number) {
  try {
    // 计算禁言时长（5-60秒）
    const duration = Math.floor(Math.random() * 55) + 5

    // 执行禁言
    await mute(session, session.userId, duration, false)

    // 计算百分比概率
    const probabilityPercent = (probability * 100).toFixed(2)

    // 发送消息
    const { minutes, seconds } = formatDuration(duration)
    await session.send(getRandomMessage('magicMute', 'triggered', {
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
function getMagicMuteStatus(config: Config): string {
  const { enabled, activeTime, minProbability, maxProbability } = config.magicMute

  let status = '【神秘口球魔法】\n'
  status += `状态: ${enabled ? '已启用' : '已禁用'}\n`
  status += `活跃时间: ${activeTime}\n`
  status += `概率范围: ${minProbability}%-${maxProbability}%\n`

  // 检查是否在活跃时间段内
  const isActive = isWithinMagicTime(activeTime)
  status += `当前状态: ${isActive ? '已激活' : '未激活'}`

  // 如果在活跃时间内，显示当前概率
  if (isActive) {
    const currentProbability = calculateCurrentProbability(config.magicMute)
    status += `\n当前概率: ${(currentProbability * 100).toFixed(2)}%`
  }

  return status
}
