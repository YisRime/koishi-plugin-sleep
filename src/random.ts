import { Context, Session } from 'koishi'
import { Utils } from './utils'

export function registerRandom(ctx: Context, config: any) {
  ctx.on('message', async (session: Session) => {
    if (!session.guildId || !session.content) return
    // 检查是否在启用时段
    if (config.randomTimeRange && !Utils.isInTimeRange(config.randomTimeRange)) return
    if (Math.random() < (config.randomProbability)) {
      const duration = Math.floor(Math.random() * (config.randomMaxDuration)) + 1
      await session.bot.muteGuildMember(session.guildId, session.userId, duration * 60)
      const msgTpl = config.randomMuteMsg?.length
        ? config.randomMuteMsg[Math.floor(Math.random() * config.randomMuteMsg.length)]
        : '{at}被随机禁言{duration}'
      await session.send(Utils.formatMessage(
        msgTpl,
        session.userId,
        session.username,
        `${duration}分钟`
      ))
    }
  })
}