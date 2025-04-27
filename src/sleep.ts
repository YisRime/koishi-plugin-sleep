import { Context } from 'koishi'
import { Config } from './index'
import { Utils } from './utils'

/**
 * 睡眠模式类型枚举
 */
export const enum SleepMode {
  STATIC = 'static',
  UNTIL = 'until'
}

/**
 * 注册睡眠命令
 */
export function registerSleep(ctx: Context, config: Config) {
  ctx.command('sleep', '精致睡眠')
    .alias('精致睡眠')
    .channelFields(['guildId'])
    .usage('禁言自己到第二天，安静入睡')
    .action(async ({ session }) => {
      // 检查时间范围
      const sleepRange = config.sleepTimeRange
      if (!Utils.isInTimeRange(sleepRange)) {
        const error = await session.send(`当前时间不在睡眠时间段内`)
        await Utils.scheduleRecall(session, error)
        return
      }
      // 计算禁言时长
      const now = new Date()
      let duration = 0
      if (config.sleepMode === SleepMode.STATIC) {
        duration = Math.max(1, config.sleepDuration) * 3600
      } else {
        const [hours, minutes] = (config.sleepUntil).split(':').map(Number)
        const endTime = new Date(now)
        endTime.setHours(hours, minutes, 0, 0)
        if (endTime <= now) endTime.setDate(endTime.getDate() + 1)
        duration = Math.max(1, Math.floor((endTime.getTime() - now.getTime()) / 1000))
      }
      try {
        await session.bot.muteGuildMember(session.guildId, session.userId, duration * 1000)
        return Utils.getRandomMessage(config.sleepSuccessMsg, '晚安，愿你今晚得享美梦~')
      } catch (error) {
        return
      }
    })
}