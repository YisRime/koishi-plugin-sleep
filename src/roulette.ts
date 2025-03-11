import { Context, Session } from 'koishi'
import { Config } from './index'
import globalCache from './cache'
import {
  MessageService,
  MuteService,
  UserService,
  TimeUtil,
  RandomUtil
} from './utils'

// 轮盘游戏会话接口
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

// 轮盘游戏结果接口
interface RouletteResult {
  victims: string[]
  survivors: string[]
}

// 会话缓存的存储名称
const ROULETTE_SESSIONS = 'rouletteSessions'

/**
 * 初始化禁言轮盘功能
 */
export function initializeRouletteCommand(ctx: Context, config: Config) {
  // 清理超时的轮盘会话
  ctx.setInterval(() => {
    cleanupExpiredSessions()
  }, 60000) // 每分钟检查一次

  // 创建轮盘命令
  ctx.command('clag.roulette [...options]', '禁言轮盘游戏')
    .channelFields(['guildId'])
    .option('players', '-p <count:number>', { fallback: 3 })
    .option('bullets', '-b <count:number>', { fallback: 1 })
    .option('duration', '-d <minutes:number>', { fallback: 0 })
    .option('timeout', '-t <seconds:number>', { fallback: 60 })
    .action(async ({ session, options }) => {
      // 检查是否已有会话
      if (hasActiveSession(session)) {
        return '已有一个正在进行的轮盘游戏，请等待结束或使用 clag.roulette.cancel 取消'
      }

      const maxPlayers = Math.min(Math.max(2, options.players), 10)
      const bulletCount = Math.min(Math.max(1, options.bullets), maxPlayers - 1)
      const waitTime = Math.min(Math.max(10, options.timeout), 300) // 等待时间10-300秒

      // 创建轮盘会话
      await createRouletteSession(session, {
        maxParticipants: maxPlayers,
        bulletCount: bulletCount,
        duration: options.duration > 0 ? options.duration : undefined,
        timeout: waitTime
      })

      return `${session.username} 发起了禁言轮盘游戏！\n最多 ${maxPlayers} 人参与，${bulletCount} 人会被禁言\n⏰ ${waitTime}秒内发送"参与"即可加入\n发起者已自动参与`
    })

  // 参与轮盘游戏
  ctx.middleware(async (session, next) => {
    if (session.content !== '参与') return next()

    const joined = joinRouletteSession(session)
    if (joined) {
      const msg = await session.send(`${session.username} 加入了禁言轮盘！`)
      await MessageService.autoRecall(session, msg, 3000)
      return
    }

    return next()
  })

  // 取消轮盘游戏命令
  ctx.command('clag.roulette.cancel', '取消禁言轮盘游戏')
    .channelFields(['guildId'])
    .action(async ({ session }) => {
      const canceled = cancelRouletteSession(session)
      if (canceled) {
        return '禁言轮盘游戏已取消'
      } else {
        return '没有正在进行的轮盘游戏'
      }
    })
}

/**
 * 创建轮盘会话
 */
async function createRouletteSession(
  session: Session,
  options: {
    maxParticipants: number,
    bulletCount: number,
    duration?: number,
    timeout: number
  }
) {
  const sessionKey = getSessionKey(session)

  // 创建新会话
  const rouletteSession: RouletteSession = {
    channelId: session.channelId,
    guildId: session.guildId,
    initiator: session.userId,
    participants: new Set([session.userId]),
    startTime: Date.now(),
    maxParticipants: options.maxParticipants,
    bulletCount: options.bulletCount,
    duration: options.duration,
    timeout: setTimeout(() => {
      executeRoulette(session, sessionKey)
    }, options.timeout * 1000)
  }

  // 存储会话
  globalCache.set(ROULETTE_SESSIONS, sessionKey, rouletteSession, 3600000)
}

/**
 * 加入轮盘游戏
 */
function joinRouletteSession(session: Session): boolean {
  const sessionKey = getSessionKey(session)
  const rouletteSession = globalCache.get<RouletteSession>(ROULETTE_SESSIONS, sessionKey)

  // 检查是否有可加入的会话
  if (!rouletteSession) return false

  // 检查是否已加入
  if (rouletteSession.participants.has(session.userId)) return false

  // 添加参与者
  rouletteSession.participants.add(session.userId)

  // 如果达到最大人数，立即开始
  if (rouletteSession.participants.size >= rouletteSession.maxParticipants) {
    clearTimeout(rouletteSession.timeout)
    executeRoulette(session, sessionKey)
    return true
  }

  // 更新会话
  globalCache.set(ROULETTE_SESSIONS, sessionKey, rouletteSession, 3600000)
  return true
}

/**
 * 取消轮盘游戏
 */
function cancelRouletteSession(session: Session): boolean {
  const sessionKey = getSessionKey(session)
  const rouletteSession = globalCache.get<RouletteSession>(ROULETTE_SESSIONS, sessionKey)

  // 检查是否有可取消的会话
  if (!rouletteSession) return false

  // 检查是否是发起者或管理员
  if (session.userId !== rouletteSession.initiator) return false

  // 清理会话
  clearTimeout(rouletteSession.timeout)
  globalCache.delete(ROULETTE_SESSIONS, sessionKey)
  return true
}

/**
 * 执行轮盘游戏
 */
async function executeRoulette(session: Session, sessionKey: string) {
  // 获取会话
  const rouletteSession = globalCache.get<RouletteSession>(ROULETTE_SESSIONS, sessionKey)
  if (!rouletteSession) return

  // 清除会话
  globalCache.delete(ROULETTE_SESSIONS, sessionKey)

  // 参与人数检查
  const participants = Array.from(rouletteSession.participants)
  if (participants.length < 2) {
    await session.send('参与人数不足，禁言轮盘游戏取消！')
    return
  }

  // 随机选择受害者
  const result = spinRoulette(participants, rouletteSession.bulletCount)

  // 发送游戏结果
  await announceRouletteResult(session, result)

  // 执行禁言
  await executeRouletteMutes(session, result.victims, rouletteSession.duration)
}

/**
 * 轮盘随机选择
 */
function spinRoulette(participants: string[], bulletCount: number): RouletteResult {
  // 随机洗牌
  const shuffled = [...participants].sort(() => Math.random() - 0.5)

  // 选择受害者和幸存者
  const victims = shuffled.slice(0, bulletCount)
  const survivors = shuffled.slice(bulletCount)

  return { victims, survivors }
}

/**
 * 宣布轮盘结果
 */
async function announceRouletteResult(session: Session, result: RouletteResult) {
  // 获取用户名
  const victimNames = await Promise.all(
    result.victims.map(id => UserService.getUserName(session, id))
  )

  // 构建结果消息
  let message = `🎯 禁言轮盘结果揭晓！\n`
  message += `${MessageService.getRandomMessage('roulette', 'result', {})}\n\n`
  message += `🔴 中弹成员: ${victimNames.join(', ')}\n`

  await session.send(message)
}

/**
 * 执行轮盘禁言
 */
async function executeRouletteMutes(session: Session, victims: string[], duration?: number) {
  // 对每个受害者执行禁言
  for (const victim of victims) {
    try {
      // 计算禁言时长
      const config = session.app.config.get('sleep')
      const muteDuration = duration ?
        duration * 60 : // 如果有指定时长，使用分钟转秒
        MuteService.calculateDuration(config, {
          isCriticalHit: RandomUtil.withProbability(0.2) // 20%概率暴击
        })

      // 执行禁言
      await MuteService.mute(session, victim, muteDuration, {
        enableMessage: true
      })

      // 发送禁言信息
      const { minutes, seconds } = TimeUtil.formatDuration(muteDuration)
      const victimName = await UserService.getUserName(session, victim)

      await session.send(MessageService.getRandomMessage('roulette', 'mute', {
        target: victimName,
        minutes: String(minutes),
        seconds: String(seconds)
      }))

    } catch (error) {
      console.error('Failed to mute roulette victim:', error)
    }
  }
}

/**
 * 获取会话键
 */
function getSessionKey(session: Session): string {
  return `${session.platform}:${session.channelId}`
}

/**
 * 判断是否有活跃会话
 */
function hasActiveSession(session: Session): boolean {
  return globalCache.has(ROULETTE_SESSIONS, getSessionKey(session))
}

/**
 * 清理过期会话
 */
function cleanupExpiredSessions() {
  // 会话清理由缓存过期机制自动完成
  // 这个函数保留用于未来扩展
}
