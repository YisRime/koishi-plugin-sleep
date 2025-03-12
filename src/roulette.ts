import { Context, Session } from 'koishi'
import { Config } from './index'
import globalCache from './cache'
import { MessageService, UserService, RandomUtil } from './utils'
import { MuteUtils } from './muteUtils'

interface RouletteSession {
  channelId: string
  guildId: string
  initiator: string
  participants: Set<string>
  startTime: number
  maxParticipants: number
  bulletCount: number
  duration?: number
  timeout: NodeJS.Timeout
}

interface RouletteResult {
  victims: string[]
  survivors: string[]
}

const ROULETTE_SESSIONS = 'rouletteSessions'

export function initializeRouletteCommand(ctx: Context, config: Config) {

  ctx.command('clag.roulette [...options]', '禁言轮盘游戏')
    .channelFields(['guildId'])
    .option('players', '-p <count:number>', { fallback: 10 })
    .option('bullets', '-b <count:number>', { fallback: 1 })
    .option('duration', '-d <minutes:number>', { fallback: 0 })
    .option('timeout', '-t <seconds:number>', { fallback: 60 })
    .action(async ({ session, options }) => {
      if (hasActiveSession(session)) {
        return '已有一个正在进行的轮盘游戏，请等待结束或使用 clag.roulette.cancel 取消'
      }

      const maxPlayers = Math.min(Math.max(2, options.players), 10)
      const bulletCount = Math.min(Math.max(1, options.bullets), maxPlayers - 1)
      const waitTime = Math.min(Math.max(10, options.timeout), 300)

      await createRouletteSession(session, config, {
        maxParticipants: maxPlayers,
        bulletCount: bulletCount,
        duration: options.duration > 0 ? options.duration : undefined,
        timeout: waitTime
      })

      return `${session.username} 发起了禁言轮盘游戏！\n最多 ${maxPlayers} 人参与，${bulletCount} 人会被禁言\n⏰ ${waitTime}秒内发送"参与"即可加入\n发起者已自动参与`
    })

  ctx.middleware(async (session, next) => {
    if (session.content !== '参与') return next()
    if (joinRouletteSession(session, config)) {
      const msg = await session.send(`${session.username} 加入了禁言轮盘！`)
      await MessageService.autoRecall(session, msg, 3000)
      return
    }
    return next()
  })

  ctx.command('clag.roulette.cancel', '取消禁言轮盘游戏')
    .channelFields(['guildId'])
    .action(async ({ session }) => {
      return cancelRouletteSession(session)
        ? '禁言轮盘游戏已取消'
        : '没有正在进行的轮盘游戏'
    })
}

async function createRouletteSession(
  session: Session,
  config: Config,
  options: {
    maxParticipants: number,
    bulletCount: number,
    duration?: number,
    timeout: number
  }
) {
  const sessionKey = getSessionKey(session)
  const rouletteSession: RouletteSession = {
    channelId: session.channelId,
    guildId: session.guildId,
    initiator: session.userId,
    participants: new Set([session.userId]),
    startTime: Date.now(),
    maxParticipants: options.maxParticipants,
    bulletCount: options.bulletCount,
    duration: options.duration,
    timeout: setTimeout(() => executeRoulette(session, config, sessionKey), options.timeout * 1000)
  }
  globalCache.set(ROULETTE_SESSIONS, sessionKey, rouletteSession, 3600000)
}

function joinRouletteSession(session: Session, config: Config): boolean {
  const sessionKey = getSessionKey(session)
  const rouletteSession = globalCache.get<RouletteSession>(ROULETTE_SESSIONS, sessionKey)
  if (!rouletteSession || rouletteSession.participants.has(session.userId)) return false

  rouletteSession.participants.add(session.userId)
  if (rouletteSession.participants.size >= rouletteSession.maxParticipants) {
    clearTimeout(rouletteSession.timeout)
    executeRoulette(session, config, sessionKey)
    return true
  }

  globalCache.set(ROULETTE_SESSIONS, sessionKey, rouletteSession, 3600000)
  return true
}

function cancelRouletteSession(session: Session): boolean {
  const sessionKey = getSessionKey(session)
  const rouletteSession = globalCache.get<RouletteSession>(ROULETTE_SESSIONS, sessionKey)
  if (!rouletteSession || session.userId !== rouletteSession.initiator) return false

  clearTimeout(rouletteSession.timeout)
  globalCache.delete(ROULETTE_SESSIONS, sessionKey)
  return true
}

async function executeRoulette(session: Session, config: Config, sessionKey: string) {
  const rouletteSession = globalCache.get<RouletteSession>(ROULETTE_SESSIONS, sessionKey)
  if (!rouletteSession) return

  globalCache.delete(ROULETTE_SESSIONS, sessionKey)
  const participants = Array.from(rouletteSession.participants)

  if (participants.length < 2) {
    await session.send('参与人数不足，禁言轮盘游戏取消！')
    return
  }

  const result = spinRoulette(participants, rouletteSession.bulletCount)
  await announceRouletteResult(session, result)

  // 直接使用传入的配置对象
  await executeRouletteMutes(session, config, result.victims, rouletteSession.duration)
}

function spinRoulette(participants: string[], bulletCount: number): RouletteResult {
  const shuffled = [...participants].sort(() => Math.random() - 0.5)
  return {
    victims: shuffled.slice(0, bulletCount),
    survivors: shuffled.slice(bulletCount)
  }
}

async function announceRouletteResult(session: Session, result: RouletteResult) {
  const victimNames = await Promise.all(
    result.victims.map(id => UserService.getUserName(session, id))
  )
  await session.send(
    `🎯 禁言轮盘结果揭晓！\n` +
    `${MessageService.getRandomMessage('roulette', 'result', {})}\n\n` +
    `🔴 中弹成员: ${victimNames.join(', ')}`
  )
}

async function executeRouletteMutes(session: Session, config: Config, victims: string[], duration?: number) {
  for (const victim of victims) {
    try {
      const isCritical = RandomUtil.isCritical(config.clag.criticalHitProbability);

      await MuteUtils.mute(session, config, {
        targetId: victim,
        baseDuration: duration,
        isCritical,
        messageOptions: {
          category: 'roulette',
          type: 'mute'
        }
      });
    } catch (error) {
      console.error('禁言轮盘受害者失败:', error);
    }
  }
}

function getSessionKey(session: Session): string {
  return `${session.platform}:${session.channelId}`
}

function hasActiveSession(session: Session): boolean {
  return globalCache.has(ROULETTE_SESSIONS, getSessionKey(session))
}

