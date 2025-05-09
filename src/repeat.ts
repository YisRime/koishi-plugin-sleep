import { Context, Middleware } from 'koishi'
import { Utils } from './utils'

/**
 * 概率模式枚举
 */
export enum ProbMode {
  FIXED = 'fixed',
  INCREASING = 'increasing',
}

/**
 * 监听模式枚举
 */
export enum ListenMode {
  OFF = 'off',
  REPEAT = 'repeat',
  RANDOM = 'random',
}

/**
 * 聊天状态接口
 */
interface ChatState {
  lastMsg: string
  count: number
  users: string[]
}

/**
 * 设置消息监控中间件
 */
export function setupMonitor(ctx: Context, config: any) {
  if (config.listenMode === ListenMode.OFF) return;
  const groups: Record<string, ChatState> = {};
  let middlewareDisposer = null;
  let isActive = false;
  const probMgr = Utils.createProbabilityManager(config);

  /**
   * 消息处理中间件
   */
  const messageMiddleware: Middleware = async (session, next) => {
    if (!session.guildId || !session.content) return next();
    const content = session.content.trim();
    const duration = Math.floor(Math.random() * config.maxDuration * 60);
    if (config.listenMode === ListenMode.RANDOM) {
      if (Math.random() < probMgr.get()) {
        await Utils.muteAndSend(session, session.userId, duration, config.Message, session.username, config.showMessage, true);
        probMgr.reset();
      } else {
        probMgr.increase();
      }
    }
    else if (config.listenMode === ListenMode.REPEAT) {
      const state = groups[session.guildId] ||= { lastMsg: '', count: 0, users: [] };
      // 消息变化，重置状态
      if (content !== state.lastMsg) {
        state.lastMsg = content;
        state.count = 1;
        state.users = [session.userId];
        return next();
      }
      // 更新复读状态
      state.count++;
      if (!state.users.includes(session.userId)) {
        state.users.push(session.userId);
      }
      // 判断是否触发禁言
      if (state.count >= 2 && Math.random() < probMgr.getRepeatRate(state.count)) {
        let targets = [];
        if (typeof config.repeatMuteTarget === 'string') {
          // 随机禁言多个人
          const count = parseInt(config.repeatMuteTarget);
          targets = state.users.slice()
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.min(count, state.users.length));
        } else {
          // 禁言最后几个人
          const count = config.repeatMuteTarget;
          targets = state.users.slice(-Math.min(count, state.users.length));
        }
        // 执行禁言
        for (const userId of targets) {
          let targetName = userId;
          try {
            const info = await session.bot.getGuildMember(session.guildId, userId);
            targetName = info?.nick || info?.user?.name || userId;
          } catch {}
          await Utils.muteAndSend(session, userId, duration, config.Message, targetName, config.showMessage, true);
        }
        // 重置状态
        state.count = 0;
        state.users = [];
      }
    }
    return next();
  };

  /**
   * 更新中间件状态
   */
  const updateMiddlewareState = () => {
    const shouldBeActive = !config.listenTime || Utils.isInTimeRange(config.listenTime);
    if (shouldBeActive === isActive) return;
    if (shouldBeActive) {
      middlewareDisposer = ctx.middleware(messageMiddleware);
    } else if (middlewareDisposer) {
      middlewareDisposer();
      middlewareDisposer = null;
    }
    isActive = shouldBeActive;
  };
  // 初始化并定时更新中间件状态
  updateMiddlewareState();
  const timer = setInterval(updateMiddlewareState, 60000);
  // 清理资源
  ctx.on('dispose', () => {
    clearInterval(timer);
    if (middlewareDisposer) middlewareDisposer();
  });
}