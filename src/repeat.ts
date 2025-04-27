import { Context, Session } from 'koishi'
import { Utils } from './utils'

export enum RepeatMode {
  FIXED = 'fixed',
  INCREASING = 'increasing',
}

interface RepeatState {
  lastMsg: string
  count: number
  recentUsers: string[]
}

export function registerRepeat(ctx: Context, config: any) {
  const groupState: Record<string, RepeatState> = {}
  let currentProbability = config.repeatProbability
  // 概率递增模式下重置概率
  const resetProbability = () => {
    if (config.repeatMode === RepeatMode.INCREASING) {
      currentProbability = config.repeatProbability
    }
  }
  // 概率递增模式下增加概率
  const increaseProbability = () => {
    if (config.repeatMode === RepeatMode.INCREASING) {
      currentProbability = Math.min(currentProbability + 0.1, 1)
    }
  }

  ctx.on('message', async (session: Session) => {
    if (!session.guildId || !session.content) return
    const state = groupState[session.guildId] ||= { lastMsg: '', count: 0, recentUsers: [] }
    const msg = session.content.trim()
    if (msg === state.lastMsg) {
      state.count++
      // 记录复读用户
      if (!state.recentUsers.includes(session.userId)) {
        state.recentUsers.push(session.userId)
      }
      if (state.count >= 2 && Math.random() < currentProbability) {
        const duration = Math.floor(Math.random() * (config.repeatMaxDuration)) + 1
        let muteUserIds: string[] = []
        if (typeof config.repeatMuteTarget === 'string' && /^\d+$/.test(config.repeatMuteTarget)) {
          const n = parseInt(config.repeatMuteTarget)
          const shuffled = state.recentUsers.slice().sort(() => Math.random() - 0.5)
          muteUserIds = shuffled.slice(0, Math.min(n, shuffled.length))
        } else {
          const n = typeof config.repeatMuteTarget === 'number' ? config.repeatMuteTarget : 1
          muteUserIds = state.recentUsers.slice(-n)
        }
        for (const userId of muteUserIds) {
          await session.bot.muteGuildMember(session.guildId, userId, duration * 60)
          const msgTpl = config.repeatMuteMsg?.length
            ? config.repeatMuteMsg[Math.floor(Math.random() * config.repeatMuteMsg.length)]
            : '{at}复读被抓，禁言{duration}'
          await session.send(Utils.formatMessage(
            msgTpl,
            userId,
            session.username,
            `${duration}分钟`
          ))
        }
        state.count = 0
        state.recentUsers = []
        resetProbability()
      } else if (state.count >= 2) {
        increaseProbability()
      }
    } else {
      state.lastMsg = msg
      state.count = 1
      state.recentUsers = [session.userId]
      resetProbability()
    }
  })
}