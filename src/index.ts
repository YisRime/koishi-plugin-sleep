// 基础依赖导入和插件元数据定义
import { Context, Schema, Random } from 'koishi'
import { utils, ConfigValidator } from './utils'

// 插件元数据定义
export const name = 'sleep'

/**
 * 睡眠模式类型枚举
 * @enum {string}
 */
export const enum SleepMode {
  STATIC = 'static',
  UNTIL = 'until',
  RANDOM = 'random'
}

/**
 * 禁言时长类型枚举
 * @enum {string}
 */
export const enum MuteDurationType {
  STATIC = 'static',
  RANDOM = 'random'
}

/**
 * 插件配置接口
 */
export interface SleepConfig {
  type: SleepMode
  duration?: number
  until?: string
  min?: number
  max?: number
  allowedTimeRange?: string
}

export interface MuteConfig {
  type: MuteDurationType
  duration?: number
  min?: number
  max?: number
}

export interface Config {
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
      }).default({ type: SleepMode.UNTIL }),
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
      }).default({ type: MuteDurationType.RANDOM }),
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
  }).i18n({
    'zh-CN': require('./locales/zh-CN')._config_mute,
    'en-US': require('./locales/en-US')._config_mute,
  })
])

/**
 * 插件主函数
 * @param {Context} ctx - Koishi 上下文
 * @param {Config} config - 插件配置
 */
export async function apply(ctx: Context, config: Config) {

  new ConfigValidator(config).validate();

  ctx.i18n.define('zh-CN', require('./locales/zh-CN'));
  ctx.i18n.define('en-US', require('./locales/en-US'));

  utils.startCacheCleaner();

  /**
   * 精致睡眠命令处理
   * @description
   * 三种睡眠模式:
   * 1. static - 固定时长,使用配置的duration
   * 2. until - 指定时间,计算到指定时间的时长
   * 3. random - 随机时长,在min和max之间随机
   *
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
          await utils.autoRecall(session, message);
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
        await utils.autoRecall(session, message);
        return;
      }
    });

  /**
   * 禁言命令处理
   * @description
   * 支持以下功能:
   * 1. mute - 随机选择目标禁言
   * 2. mute.me - 禁言自己
   * 3. mute.user - 指定目标禁言
   */
  const mute = ctx.command('mute [duration:number]')
    .channelFields(['guildId'])
    .action(async ({ session }, duration) => {
      if (duration && duration > config.maxAllowedDuration) {
        const message = await session.send(session.text('commands.mute.messages.errors.duration_too_long', [config.maxAllowedDuration]));
        await utils.autoRecall(session, message);
        return;
      }

      if (!config.enableMuteOthers) {
        const message = await session.send(session.text('commands.mute.messages.notify.others_disabled'));
        await utils.autoRecall(session, message);
        return;
      }

      const muteDuration = utils.calculateMuteDuration(config.mute.type, config.mute.duration, config.mute.min, config.mute.max, duration);

      try {
        const validMembers = await utils.getMemberList(session);
        if (!validMembers.length) {
          const message = await session.send(session.text('commands.mute.messages.errors.no_valid_members'));
          await utils.autoRecall(session, message);
          return;
        }

        if (!new Random().bool(config.probability)) {
          await utils.mute(session, session.userId, muteDuration, config.enableMessage);
          return;
        }

        const targetIndex = new Random().int(0, validMembers.length - 1);
        const targetId = validMembers[targetIndex];
        await utils.mute(session, targetId, muteDuration, config.enableMessage);
      } catch (error) {
        console.error('Failed to execute random mute:', error);
        const message = await session.send(session.text('commands.mute.messages.errors.no_valid_members'));
        await utils.autoRecall(session, message);
      }
    });

  // 禁言自己子命令
  mute.subcommand('.me [duration:number]')
    .action(async ({ session }, duration) => {
      if (duration && duration > config.maxAllowedDuration) {
        const message = await session.send(session.text('commands.mute.messages.errors.duration_too_long', [config.maxAllowedDuration]));
        await utils.autoRecall(session, message);
        return;
      }

      const muteDuration = utils.calculateMuteDuration(config.mute.type, config.mute.duration, config.mute.min, config.mute.max,duration);
      await utils.mute(session, session.userId, muteDuration, config.enableMessage);
    });

  // 指定目标禁言子命令
  mute.subcommand('.user <target:text> [duration:number]')
    .action(async ({ session }, target, duration) => {
      if (!config.enableMuteOthers) {
        const message = await session.send(session.text('commands.mute.messages.notify.others_disabled'));
        await utils.autoRecall(session, message);
        return;
      }

      if (duration && duration > config.maxAllowedDuration) {
        const message = await session.send(session.text('commands.mute.messages.errors.duration_too_long', [config.maxAllowedDuration]));
        await utils.autoRecall(session, message);
        return;
      }

      const muteTargetId = utils.parseTarget(target);
      if (!muteTargetId || muteTargetId === session.userId) {
        await utils.mute(session, session.userId, duration * 60 || config.mute.duration * 60, config.enableMessage);
        return;
      }

      const muteDuration = utils.calculateMuteDuration(config.mute.type, config.mute.duration, config.mute.min, config.mute.max,duration);

      if (!new Random().bool(config.probability)) {
        await utils.mute(session, session.userId, muteDuration, config.enableMessage);
        return;
      }

      await utils.mute(session, muteTargetId, muteDuration, config.enableMessage);
    })
}
