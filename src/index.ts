/**
 * 睡眠与禁言功能插件
 * @module sleep
 */

import { Context, Schema } from 'koishi'
import { handleMuteOperation, initializeClagFeatures } from './clag/index'
import { autoRecall } from './mute'

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
 * 禁言功能类型枚举
 * @enum {string}
 */
export const enum ClagFeature {
  NORMAL = 'normal',
  ROULETTE = 'roulette',
  CHAIN = 'chain'
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
}

export interface ClagConfig {
  min: number
  max: number
  enableSpecialEffects: boolean
  enableRoulette: boolean
  enableChainReaction: boolean
  enableSeasonalEvents: boolean
  immunityProbability: number
  criticalHitProbability: number
  rouletteSize: number
  chainReactionExpiry: number
}

// 导出配置接口，使其可被其他模块使用
export interface Config {
  sleep: SleepConfig
  clag: ClagConfig
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
    clag: Schema.object({
      min: Schema.number().default(0.5).description('最小禁言时长（分钟）'),
      max: Schema.number().default(10).description('最大禁言时长（分钟）'),
      enableSpecialEffects: Schema.boolean().default(true).description('启用特殊效果'),
      enableRoulette: Schema.boolean().default(true).description('启用禁言轮盘'),
      enableChainReaction: Schema.boolean().default(true).description('启用连锁禁言'),
      enableSeasonalEvents: Schema.boolean().default(true).description('启用节日特效'),
      immunityProbability: Schema.number().default(0.05).min(0).max(1).description('禁言免疫概率'),
      criticalHitProbability: Schema.number().default(0.1).min(0).max(1).description('禁言暴击概率'),
      rouletteSize: Schema.number().default(3).min(2).max(10).description('轮盘人数'),
      chainReactionExpiry: Schema.number().default(24).description('连锁禁言有效期（小时）')
    }),
    allowedTimeRange: Schema.string().default('20-8').pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/),
    maxAllowedDuration: Schema.number().default(1440),
    enableMessage: Schema.boolean().default(true),
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

  // 初始化clag高级功能
  initializeClagFeatures(ctx, config)

  /**
   * 精致睡眠命令 - 支持三种模式
   */
  ctx.command('sleep')
    .alias('jzsm', '精致睡眠')
    .channelFields(['guildId'])
    .action(async ({ session }) => {
      try {
        // 验证时间段
        const now = new Date();
        const currentHour = now.getHours();
        const [startHour, endHour] = config.allowedTimeRange.split('-').map(Number);

        const isTimeAllowed = startHour > endHour
          ? (currentHour >= startHour || currentHour <= endHour)  // 跨夜情况，如20-8
          : (currentHour >= startHour && currentHour <= endHour); // 普通情况，如9-18

        if (!isTimeAllowed) {
          const message = await session.send(
            session.text('commands.sleep.errors.not_allowed_time', [config.allowedTimeRange])
          );
          await autoRecall(session, message);
          return;
        }

        // 计算禁言时长
        let duration: number;
        const sleep = config.sleep;

        switch (sleep.type) {
          case SleepMode.STATIC:
            duration = Math.max(1, sleep.duration) * 60 * 60; // 转为秒
            break;

          case SleepMode.UNTIL:
            const [hours, minutes] = sleep.until.split(':').map(Number);
            if (isNaN(hours) || isNaN(minutes)) {
              throw new Error(session.text('commands.sleep.errors.invalid_time'));
            }
            const endTime = new Date(now);
            endTime.setHours(hours, minutes, 0, 0);
            if (endTime <= now) endTime.setDate(endTime.getDate() + 1);
            duration = Math.max(1, Math.floor((endTime.getTime() - now.getTime()) / 1000)); // 转为秒
            break;

          case SleepMode.RANDOM:
            const min = Math.max(1, sleep.min) * 60 * 60; // 转为秒
            const max = Math.max(sleep.min, sleep.max) * 60 * 60; // 转为秒
            duration = Math.floor(Math.random() * (max - min + 1) + min);
            break;
        }

        // 执行禁言
        await session.bot.muteGuildMember(session.guildId, session.userId, duration * 1000);
        return session.text('commands.sleep.messages.success');
      } catch (error) {
        console.error('Sleep command error:', error);
        const message = await session.send(session.text('commands.sleep.messages.failed'));
        await autoRecall(session, message);
        return;
      }
    });

  /**
   * 随机禁言命令组
   */
  ctx.command('clag [duration:number]')
    .channelFields(['guildId'])
    .action(async ({ session }, duration) => {
      if (!config.enableMuteOthers) {
        const message = await session.send(session.text('commands.clag.messages.notify.others_disabled'))
        await autoRecall(session, message)
        return
      }
      await handleMuteOperation(session, config, null, duration, ClagFeature.NORMAL)
    })
    .subcommand('.me [duration:number]')
    .action(async ({ session }, duration) => {
      await handleMuteOperation(session, config, session.userId, duration, ClagFeature.NORMAL)
    })
    .subcommand('.user <target:text> [duration:number]')
    .action(async ({ session }, target, duration) => {
      if (!config.enableMuteOthers) {
        const message = await session.send(session.text('commands.clag.messages.notify.others_disabled'))
        await autoRecall(session, message)
        return
      }
      await handleMuteOperation(session, config, target, duration, ClagFeature.NORMAL)
    })
    .subcommand('.roulette [count:number]', { authority: 1 })
    .alias('轮盘')
    .action(async ({ session }, count) => {
      if (!config.clag.enableRoulette) {
        const message = await session.send(session.text('commands.clag.messages.notify.feature_disabled', ['轮盘']))
        await autoRecall(session, message)
        return
      }
      await handleMuteOperation(session, config, null, null, ClagFeature.ROULETTE, count || config.clag.rouletteSize)
    })
    .subcommand('.chain <target:text>')
    .alias('连锁')
    .action(async ({ session }, target) => {
      if (!config.clag.enableChainReaction) {
        const message = await session.send(session.text('commands.clag.messages.notify.feature_disabled', ['连锁']))
        await autoRecall(session, message)
        return
      }
      await handleMuteOperation(session, config, target, null, ClagFeature.CHAIN)
    })
}
