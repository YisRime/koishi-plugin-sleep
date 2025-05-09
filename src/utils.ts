import { Session, h } from 'koishi'
import { ProbMode } from './repeat'

/**
 * 工具类，提供各种辅助函数
 */
export class Utils {
  /**
   * 检查当前时间是否在指定范围内
   */
  static isInTimeRange(range: string): boolean {
    if (!range) return true
    const [start, end] = range.split('-').map(Number)
    const hour = new Date().getHours()
    return end < start ? hour >= start || hour < end : hour >= start && hour < end
  }

  /**
   * 从文本中获取用户ID
   */
  static getUserId(target: string): string | null {
    if (!target) return null
    const atId = h.select(h.parse(target), 'at')[0]?.attrs?.id
    const userId = atId || target.match(/@(\d+)/)?.[1] || (/^\d+$/.test(target.trim()) ? target.trim() : null)
    return userId && /^\d{5,10}$/.test(userId) ? userId : null
  }

  /**
   * 将秒数格式化为可读的时间字符串
   */
  static formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时${seconds % 3600 > 0 ? this.formatTime(seconds % 3600) : ''}`
    return `${Math.floor(seconds / 86400)}天${seconds % 86400 > 0 ? this.formatTime(seconds % 86400) : ''}`
  }

  /**
   * 消息格式化函数，替换占位符
   */
  static formatMessage(
    messages: string | string[] | Array<{Success: string, Failure: string}> | undefined,
    targetId: string, username: string, duration: number, isSuccess: boolean = true): string {
    if (!messages || (Array.isArray(messages) && messages.length === 0)) return ''
    // 选择消息模板
    let message = '';
    if (typeof messages === 'string') {
      message = messages;
    } else if (Array.isArray(messages)) {
      if (typeof messages[0] === 'string') {
        message = messages[Math.floor(Math.random() * messages.length)] as string;
      } else if (typeof messages[0] === 'object') {
        const template = messages[Math.floor(Math.random() * messages.length)] as {Success: string, Failure: string};
        message = isSuccess ? template.Success : template.Failure;
      }
    }
    // 替换占位符
    return message
      .replace(/\{at\}/g, `<at id="${targetId}"/>`)
      .replace(/\{username\}/g, username)
      .replace(/\{duration\}/g, this.formatTime(Math.floor(duration)));
  }

  /**
   * 延迟删除消息
   */
  static delayDelete(session: Session, msg: any, delay = 10000): void {
    if (!msg) return;
    setTimeout(() => {
      const messages = Array.isArray(msg) ? msg : [msg];
      Promise.all(messages.map(m => {
        const msgId = typeof m === 'string' ? m : m?.id;
        return msgId && session.bot.deleteMessage(session.channelId, msgId);
      })).catch(() => {});
    }, delay);
  }

  /**
   * 执行禁言并发送消息的综合方法
   */
  static async muteAndSend(session: Session, userId: string, duration: number, messages: any, username: string,
    showMessage: boolean = true, isSuccess: boolean = true, autoDelete: boolean = false): Promise<string> {
    try {
      await session.bot.muteGuildMember(session.guildId, userId, duration * 1000);
      if (showMessage) {
        const message = this.formatMessage(messages, userId, username, duration, isSuccess);
        if (message) {
          const sentMsg = await session.send(message);
          if (autoDelete) this.delayDelete(session, sentMsg, 10000);
          return message;
        }
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  /**
   * 发送消息并处理显示/删除逻辑
   */
  static async sendMessage(session: Session, message: string, showMessage: boolean = true,
    autoDelete: boolean = false, deleteDelay: number = 10000): Promise<string> {
    if (!message || !showMessage) return '';
    try {
      const sentMsg = await session.send(message);
      if (autoDelete) this.delayDelete(session, sentMsg, deleteDelay);
      return showMessage ? message : '';
    } catch (e) {
      return '';
    }
  }

  /**
   * 概率管理器类，用于管理禁言概率相关逻辑
   */
  static createProbabilityManager(config: any) {
    let prob = config.probabilityInitial;
    return {
      get: () => config.probabilityMode === ProbMode.FIXED ? config.probabilityInitial : prob,
      reset: () => { if (config.probabilityMode === ProbMode.INCREASING) prob = config.probabilityInitial; },
      increase: () => { if (config.probabilityMode === ProbMode.INCREASING) prob = Math.min(prob * 1.3, 1); },
      getRate: (minutes: number) => 1 / (1 + Math.exp((minutes / 60 - 30) / 25)),
      getRepeatRate: (count: number) => 1 / (1 + Math.exp(-(count - 7) / 2.0))
    };
  }
}