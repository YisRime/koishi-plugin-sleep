import { Context, Middleware } from 'koishi'
import { Utils } from './utils'

/**
 * 概率模式枚举
 * @enum {string}
 */
export enum ProbMode {
  /** 固定概率 */
  FIXED = 'fixed',
  /** 递增概率 */
  INCREASING = 'increasing',
}

/**
 * 监听模式枚举
 * @enum {string}
 */
export enum ListenMode {
  /** 关闭监听 */
  OFF = 'off',
  /** 复读监听 */
  REPEAT = 'repeat',
  /** 随机监听 */
  RANDOM = 'random',
}

/**
 * 聊天状态接口
 * @interface ChatState
 */
interface ChatState {
  /** 上一条消息内容 */
  lastMsg: string
  /** 复读计数 */
  count: number
  /** 参与用户列表 */
  users: string[]
}

/**
 * 获取目标禁言用户列表
 * @param users - 用户列表
 * @param target - 目标设置
 * @returns 选中的用户列表
 */
function getTargetUsers(users: string[], target: number | string): string[] {
  if (typeof target === 'string') {
    // 随机禁言多个人
    const count = parseInt(target)
    return users.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(count, users.length))
  }
  // 禁言最后几个人
  return users.slice(-Math.min(target, users.length))
}

/**
 * 设置消息监控中间件
 * @param ctx - Koishi上下文
 * @param config - 插件配置
 */
export function setupMonitor(ctx: Context, config: any) {
  if (config.listenMode === ListenMode.OFF) return
  const groups: Record<string, ChatState> = {}
  let middlewareDisposer = null
  let isActive = false
  const probMgr = Utils.createProbabilityManager(config)

  /**
   * 处理随机禁言逻辑
   * @param session - 会话对象
   */
  async function handleRandom(session) {
    if (Math.random() < probMgr.get()) {
      const duration = Utils.getRandomDuration(config.maxDuration)
      await Utils.mute(session, session.userId, duration, config, session.username)
      probMgr.reset()
    } else {
      probMgr.increase()
    }
  }

  /**
   * 处理复读禁言逻辑
   * @param session - 会话对象
   * @param state - 聊天状态
   * @param content - 消息内容
   */
  async function handleRepeat(session, state: ChatState, content: string) {
    // 消息变化，重置状态
    if (content !== state.lastMsg) {
      state.lastMsg = content
      state.count = 1
      state.users = [session.userId]
      return
    }
    // 更新复读状态
    state.count++
    if (!state.users.includes(session.userId)) state.users.push(session.userId)
    // 判断是否触发禁言
    if (state.count >= 2 && Math.random() < probMgr.getRepeatRate(state.count)) {
      const duration = Utils.getRandomDuration(config.maxDuration)
      const targets = getTargetUsers(state.users, config.repeatMuteTarget)
      // 执行禁言
      for (const userId of targets) {
        const username = await Utils.getUsername(session, userId, userId)
        await Utils.mute(session, userId, duration, config, username, true)
      }
      // 重置状态
      state.count = 0
      state.users = []
    }
  }

  /**
   * 消息处理中间件
   */
  const messageMiddleware: Middleware = async (session, next) => {
    if (!session.guildId || !session.content) return next()
    const content = session.content.trim()
    // 根据不同模式处理消息
    if (config.listenMode === ListenMode.RANDOM) {
      await handleRandom(session)
    } else if (config.listenMode === ListenMode.REPEAT) {
      const state = groups[session.guildId] ||= { lastMsg: '', count: 0, users: [] }
      await handleRepeat(session, state, content)
    }
    return next()
  }

  /**
   * 更新中间件状态
   */
  const updateMiddlewareState = () => {
    const shouldBeActive = !config.listenTime || Utils.isInTimeRange(config.listenTime)
    if (shouldBeActive === isActive) return
    if (shouldBeActive) {
      middlewareDisposer = ctx.middleware(messageMiddleware)
    } else if (middlewareDisposer) {
      middlewareDisposer()
      middlewareDisposer = null
    }
    isActive = shouldBeActive
  }
  // 初始化并定时更新中间件状态
  updateMiddlewareState()
  const timer = setInterval(updateMiddlewareState, 60000)
  // 清理资源
  ctx.on('dispose', () => {
    clearInterval(timer)
    if (middlewareDisposer) middlewareDisposer()
  })
}