import { Context } from 'koishi'
import { Config } from './index'
import { Utils } from './utils'

/**
 * 计算睡眠时长（秒）
 * @param sleepSetting - 睡眠设置，可以是小时数或时间格式
 * @returns 睡眠时长(秒)
 */
function calculateSleepDuration(sleepSetting: string | number): number {
  const now = new Date()
  // 固定小时数
  if (typeof sleepSetting === 'number') return Math.max(1, sleepSetting) * 3600
  // 截止时间格式 HH:MM
  if (sleepSetting.includes(':')) {
    const [h, m] = sleepSetting.split(':').map(Number)
    const end = new Date(now)
    end.setHours(h, m, 0, 0)
    if (end <= now) end.setDate(end.getDate() + 1)
    return Math.max(1, Math.floor((end.getTime() - now.getTime()) / 1000))
  }
  // 默认8小时
  return 8 * 3600
}

/**
 * 注册睡眠命令
 * @param ctx - Koishi上下文
 * @param config - 插件配置
 */
export function registerSleep(ctx: Context, config: Config) {
  ctx.command('sleep', '精致睡眠')
    .alias('精致睡眠')
    .channelFields(['guildId'])
    .usage('禁言自己到第二天，安静入睡')
    .action(async ({ session }) => {
      // 检查时间范围并执行禁言
      if (!Utils.isInTimeRange(config.sleepTime)) {
        await Utils.sendMessage(session, '当前时间不在睡眠时间段内', { showMessage: config.showMessage, autoDelete: true })
        return
      }
      const duration = calculateSleepDuration(config.sleepSetting)
      await Utils.mute(session, session.userId, duration, config, session.username, true, config.sleepMsg)
    })
}