import { Session } from 'koishi'

/**
 * 缓存条目类型定义
 */
type CacheEntry = { data: string[]; expiry: number }

/**
 * 成员列表缓存
 * 键: platform:guildId
 * 值: {data: 成员ID列表, expiry: 过期时间}
 */
const cache = new Map<string, CacheEntry>()

setInterval(() => {
  const now = Date.now()
  cache.forEach((entry, key) => {
    if (entry.expiry <= now) cache.delete(key)
  })
}, 24 * 60 * 60 * 1000)

/**
 * 自动撤回消息
 */
export const autoRecall = async (session: Session, message: any, delay = 10000) => {
  if (!message) return
  const timer = setTimeout(async () => {
    try {
      const messages = Array.isArray(message) ? message : [message]
      await Promise.all(messages.map(msg => {
        const msgId = typeof msg === 'string' ? msg : msg?.id
        if (msgId) return session.bot.deleteMessage(session.channelId, msgId)
      }))
    } catch (error) {
      console.warn('Auto recall failed:', error)
    }
  }, delay)
  return () => clearTimeout(timer)
}

/**
 * 获取成员列表 - 简化版
 * 使用官方推荐的异步迭代器方法
 */
export const getGuildMembers = async (session: Session): Promise<string[]> => {
  const cacheKey = `${session.platform}:${session.guildId}`
  const cached = cache.get(cacheKey)

  // 优先使用缓存
  if (cached?.expiry > Date.now()) {
    return cached.data;
  }

  try {
    const members: string[] = [];

    // 使用异步迭代器获取成员列表 - 官方推荐方法
    for await (const member of session.bot.getGuildMemberIter(session.guildId)) {
      const userId = member.user?.id;
      if (userId && String(userId) !== String(session.selfId)) {
        members.push(String(userId));
      }
    }

    // 如果找到成员，缓存结果
    if (members.length > 0) {
      cache.set(cacheKey, {
        data: members,
        expiry: Date.now() + 3600000 // 缓存1小时
      });
      return members;
    }

    // 如果没找到成员，至少返回当前用户
    return [session.userId];

  } catch (error) {
    console.error('Failed to get guild members:', error);
    return [session.userId]; // 出错时返回当前用户
  }
}

/**
 * 执行禁言
 */
export const mute = async (session: Session, targetId: string, duration: number, enableMessage: boolean) => {
  try {
    await session.bot.muteGuildMember(session.guildId, targetId, duration * 1000)
    session.messageId && await session.bot.deleteMessage(session.channelId, session.messageId)

    if (enableMessage) {
      const [min, sec] = [(duration / 60) | 0, duration % 60]
      const isSelf = targetId === session.userId

      // 获取用户名时增加错误处理
      let username = isSelf ? session.username : targetId
      try {
        if (!isSelf) {
          const user = await session.app.database.getUser(session.platform, targetId)
          username = user?.name || targetId
        }
      } catch (e) {
        console.warn('Failed to get username:', e)
      }

      const msg = await session.send(session.text(
        `commands.clag.messages.notify.${isSelf ? 'self' : 'target'}_muted`,
        [username, min, sec]
      ))
      await autoRecall(session, msg)
    }
    return true
  } catch (error) {
    console.error('Mute operation failed:', error)
    return false
  }
}
