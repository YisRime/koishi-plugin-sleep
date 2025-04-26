import { Session, h } from 'koishi'

export class Utils {
  /**
   * 检查当前时间是否在指定时间范围内
   * @param range 时间范围，格式为"HH-HH"
   */
  static isInTimeRange(range: string): boolean {
    const [start, end] = range.split('-').map(h => parseInt(h, 10))
    const hour = new Date().getHours()
    return end < start ? (hour >= start || hour < end) : (hour >= start && hour < end)
  }

  /**
   * 设置消息自动撤回
   * @param session 会话对象
   * @param msg 消息对象
   * @param delay 延迟时间(毫秒)
   */
  static async scheduleRecall(session: Session, msg: any, delay = 10000) {
    if (!msg) return
    setTimeout(() => {
      const messages = Array.isArray(msg) ? msg : [msg]
      Promise.all(messages.map(m => {
        const msgId = typeof m === 'string' ? m : m?.id
        if (msgId) return session.bot.deleteMessage(session.channelId, msgId)
      })).catch(() => {})
    }, delay)
  }

  /**
   * 解析用户ID (支持@元素、@数字格式或纯数字)
   */
  static extractUserId(target: string): string | null {
    if (!target) return null
    const atId = h.select(h.parse(target), 'at')[0]?.attrs?.id
    if (atId) return atId
    const userId = target.match(/@(\d+)/)?.[1] || (/^\d+$/.test(target.trim()) ? target.trim() : null)
    return userId && /^\d{5,10}$/.test(userId) ? userId : null
  }

  /**
   * 检查命令执行环境
   */
  static async checkEnvironment(session: Session): Promise<boolean> {
    const roles = session.event?.member?.roles
    const hasMutePermission = roles.length === 0 || roles.some(role =>
      ['admin', 'owner', 'op'].some(kw => String(role).toLowerCase().includes(kw))
    )
    if (!hasMutePermission) {
      const error = await session.send('权限不足，无法执行禁言')
      await this.scheduleRecall(session, error)
      return false
    }
    return true
  }

  /**
   * 将秒数格式化为天时分秒
   * @param seconds 总秒数
   * @param simple 是否只显示最大单位
   */
  static formatDuration(seconds: number, simple = false): string {
    const units = [
      { value: 86400, name: '天' },
      { value: 3600, name: '小时' },
      { value: 60, name: '分钟' },
      { value: 1, name: '秒' }
    ];
    let result = '';
    let remaining = Math.floor(seconds);
    for (const { value, name } of units) {
      const count = Math.floor(remaining / value);
      if (count > 0) {
        result += `${count}${name}`;
        remaining %= value;
        if (simple) return result;
      }
    }
    return result;
  }

  /**
   * 从消息数组中随机选择一条消息
   * @param messages 消息数组或单条消息
   * @param defaultMsg 默认消息（当messages未定义或为空数组时使用）
   */
  static getRandomMessage(messages: string | string[], defaultMsg: string): string {
    if (!messages) return defaultMsg
    if (typeof messages === 'string') return messages
    if (messages.length === 0) return defaultMsg
    return messages[Math.floor(Math.random() * messages.length)]
  }

  /**
   * 格式化消息，替换占位符
   * @param message 消息模板
   * @param targetId 目标用户ID
   * @param username 用户名
   * @param duration 禁言时长
   * @param selfDuration 自身禁言时长(可选)
   */
  static formatMessage(message: string, targetId: string, username: string, duration: string, selfDuration?: string): string {
    return message
      .replace(/\{at\}/g, `<at id="${targetId}"/>`)
      .replace(/\{username\}/g, username)
      .replace(/\{duration\}/g, duration)
      .replace(/\{selfDuration\}/g, selfDuration || '');
  }
}