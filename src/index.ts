/**
 * 睡眠与禁言功能插件
 * @module sleep
 */

import { Context, Schema, Random, Session, h } from 'koishi'

// 插件元数据定义
export const name = 'sleep'

/**
 * 睡眠模式类型枚举
 * @enum {string}
 */
const enum SleepMode {
  STATIC = 'static',
  UNTIL = 'until',
  RANDOM = 'random'
}

/**
 * 禁言时长类型枚举
 * @enum {string}
 */
const enum MuteDurationType {
  STATIC = 'static',
  RANDOM = 'random'
}

/**
 * 插件配置接口
 */
interface SleepConfig {
  type: SleepMode
  duration?: number
  until?: string
  min?: number
  max?: number
  allowedTimeRange?: string
}
interface MuteConfig {
  type: MuteDurationType
  duration?: number
  min?: number
  max?: number
}
interface Config {
  sleep: SleepConfig
  mute: MuteConfig
  allowedTimeRange?: string
  maxAllowedDuration: number
  enableMessage: boolean
  enableMuteOthers: boolean
  probability: number
}

// Schema配置定义
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    sleep: Schema.intersect([
      Schema.object({
        type: Schema.union([SleepMode.STATIC, SleepMode.UNTIL, SleepMode.RANDOM]),
      }).default({ type: SleepMode.STATIC }),
      Schema.union([
        Schema.object({
          type: Schema.const(SleepMode.STATIC).required(),
          duration: Schema.number().default(8),
        }),
        Schema.object({
          type: Schema.const(SleepMode.UNTIL).required(),
          until: Schema.string().default('08:00'),
        }),
        Schema.object({
          type: Schema.const(SleepMode.RANDOM).required(),
          min: Schema.number().default(6),
          max: Schema.number().default(10),
        }),
      ]),
    ]),
    mute: Schema.intersect([
      Schema.object({
        type: Schema.union([MuteDurationType.STATIC, MuteDurationType.RANDOM]),
      }).default({ type: MuteDurationType.STATIC }),
      Schema.union([
        Schema.object({
          type: Schema.const(MuteDurationType.STATIC).required(),
          duration: Schema.number().default(5),
        }),
        Schema.object({
          type: Schema.const(MuteDurationType.RANDOM).required(),
          min: Schema.number().default(0.1),
          max: Schema.number().default(10),
        }),
      ]),
    ]),
    allowedTimeRange: Schema.string().default('20-8').pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/),
    maxAllowedDuration: Schema.number().default(1440),
    enableMessage: Schema.boolean().default(false),
    enableMuteOthers: Schema.boolean().default(true),
    probability: Schema.number().default(0.5).min(0).max(1),
  })
]).i18n({
  'zh-CN': require('./locales/zh-CN')._config,
  'en-US': require('./locales/en-US')._config,
})

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
 * @param session - 会话上下文
 * @param message - 要撤回的消息
 * @param delay - 延迟时间(ms),默认10秒
 * @returns 取消撤回的函数
 */
const autoRecall = async (session: Session, message: any, delay = 10000) => {
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
 * 处理禁言操作
 * @param session - 会话上下文
 * @param config - 插件配置
 * @param targetInput - 目标用户输入
 * @param duration - 禁言时长
 */
const handleMuteOperation = async (session: Session, config: Config, targetInput?: string, duration?: number) => {
  // 验证禁言时长
  if (duration && duration > config.maxAllowedDuration) {
    const message = await session.send(session.text('commands.mute.messages.errors.duration_too_long', [config.maxAllowedDuration]))
    await autoRecall(session, message)
    return
  }
  // 计算禁言时长
  const muteDuration = duration ? duration * 60 :
    (config.mute.type === MuteDurationType.RANDOM ?
      new Random().int(config.mute.min, config.mute.max) :
      config.mute.duration) * 60
  // 解析目标ID
  let targetId = session.userId
  if (targetInput) {
    const parsed = h.parse(targetInput)[0]
    targetId = parsed?.type === 'at' ? parsed.attrs.id : targetInput.trim()
    if (targetId === session.userId) {
      return await mute(session, targetId, muteDuration, config.enableMessage)
    }
  }
  // 随机选择是否反弹
  if (!new Random().bool(config.probability)) {
    return await mute(session, session.userId, muteDuration, config.enableMessage)
  }
  // 没有目标随机选择
  if (!targetInput) {
    try {
      const cacheKey = `${session.platform}:${session.guildId}`
      const cached = cache.get(cacheKey)
      let members: string[] = []

      if (cached?.expiry > Date.now()) {
        members = cached.data
      } else {
        for await (const member of session.bot.getGuildMemberIter(session.guildId)) {
          if (String(member.user?.id) !== String(session.selfId)) {
            members.push(String(member.user?.id))
          }
        }
        cache.set(cacheKey, {
          data: members,
          expiry: Date.now() + 3600000
        })
      }

      if (!members.length) {
        const message = await session.send(session.text('commands.mute.messages.errors.no_valid_members'))
        await autoRecall(session, message)
        return
      }

      targetId = members[new Random().int(0, members.length - 1)]
    } catch (error) {
      console.error('Failed to get member list:', error)
      const message = await session.send(session.text('commands.mute.messages.errors.no_valid_members'))
      await autoRecall(session, message)
      return
    }
  }

  await mute(session, targetId, muteDuration, config.enableMessage)
}

/**
 * 执行禁言
 * @param session - 会话上下文
 * @param targetId - 目标用户ID
 * @param duration - 禁言时长(秒)
 * @param enableMessage - 是否发送提示消息
 * @returns 禁言是否成功
 */
const mute = async (session: Session, targetId: string, duration: number, enableMessage: boolean) => {
  try {
    await session.bot.muteGuildMember(session.guildId, targetId, duration * 1000)
    session.messageId && await session.bot.deleteMessage(session.channelId, session.messageId)

    if (enableMessage) {
      const [min, sec] = [(duration / 60) | 0, duration % 60]
      const isSelf = targetId === session.userId
      const username = isSelf ? session.username
        : ((await session.app.database.getUser(session.platform, targetId))?.name || targetId)

      const msg = await session.send(session.text(
        `commands.mute.messages.notify.${isSelf ? 'self' : 'target'}_muted`,
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

/**
 * 插件主函数
 * @param {Context} ctx - Koishi 上下文
 * @param {Config} config - 插件配置
 */
export async function apply(ctx: Context, config: Config) {
  // 验证时间格式
  if (config.sleep.type === SleepMode.UNTIL &&
    !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(config.sleep.until)) {
    throw new Error('Invalid sleep end time format')
  }

  // 加载国际化资源
  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))
  ctx.i18n.define('en-US', require('./locales/en-US'))

  /**
   * 精致睡眠命令
   * 支持三种模式:
   * 1. static - 固定时长禁言
   * 2. until - 禁言至指定时间
   * 3. random - 随机时长禁言
   */
  ctx.command('sleep')
    .alias('jzsm', '精致睡眠')
    .channelFields(['guildId'])
    .action(async ({ session }) => {
      try {
        const now = new Date();
        const currentHour = now.getHours();
        const [startHour, endHour] = config.allowedTimeRange.split('-').map(Number);

        const isTimeAllowed = startHour > endHour
          ? (currentHour >= startHour || currentHour <= endHour)  // 跨夜情况，如20-8
          : (currentHour >= startHour && currentHour <= endHour); // 普通情况，如9-18

        if (!isTimeAllowed) {
          const message = await session.send(session.text('commands.sleep.errors.not_allowed_time', [config.allowedTimeRange]));
          await autoRecall(session, message);
          return;
        }

        let duration: number;
        const sleep = config.sleep;

        switch (sleep.type) {
          case SleepMode.STATIC:
            duration = Math.max(1, sleep.duration) * 60;
            break;
          case SleepMode.UNTIL:
            const [hours, minutes] = sleep.until.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) {
              throw new Error(session.text('commands.sleep.errors.invalid_time'));
            }
            const endTime = new Date(now);
            endTime.setHours(hours, minutes, 0, 0);
            if (endTime <= now) endTime.setDate(endTime.getDate() + 1);
            duration = Math.max(1, Math.floor((endTime.getTime() - now.getTime()) / 60000));
            break;
          case SleepMode.RANDOM:
            const min = Math.max(1, sleep.min) * 60;
            const max = Math.max(sleep.max, sleep.min) * 60;
            duration = Math.floor(Math.random() * (max - min + 1) + min);
            break;
        }

        await session.bot.muteGuildMember(session.guildId, session.userId, duration * 60 * 1000);
        return session.text('commands.sleep.messages.success');
      } catch (error) {
        const message = await session.send(session.text('commands.sleep.messages.failed'));
        await autoRecall(session, message);
        return;
      }
    });

  /**
   * 禁言命令组
   * - mute [duration] - 随机选择目标禁言
   * - mute.me [duration] - 禁言自己
   * - mute.user <target> [duration] - 禁言指定目标
   */
  ctx.command('mute [duration:number]')
    .channelFields(['guildId'])
    .action(async ({ session }, duration) => {
      if (!config.enableMuteOthers) {
        const message = await session.send(session.text('commands.mute.messages.notify.others_disabled'))
        await autoRecall(session, message)
        return
      }
      await handleMuteOperation(session, config, null, duration)
    })
    .subcommand('.me [duration:number]')
    .action(async ({ session }, duration) => {
      await handleMuteOperation(session, config, session.userId, duration)
    })
    .subcommand('.user <target:text> [duration:number]')
    .action(async ({ session }, target, duration) => {
      if (!config.enableMuteOthers) {
        const message = await session.send(session.text('commands.mute.messages.notify.others_disabled'))
        await autoRecall(session, message)
        return
      }
      await handleMuteOperation(session, config, target, duration)
    })
}
