import { Context } from 'koishi'
import { Config } from './index'
import { autoRecall } from './mute'

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
 * 插件配置接口
 */
export interface SleepConfig {
  type: SleepMode
  duration?: number
  until?: string
  min?: number
  max?: number
}

/**
 * 初始化睡眠命令
 * @param {Context} ctx - Koishi 上下文
 * @param {Config} config - 插件配置
 */
export function initializeSleepCommand(ctx: Context, config: Config) {
  // 验证时间格式
  if (config.sleep.type === SleepMode.UNTIL &&
    !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(config.sleep.until)) {
    throw new Error('无效的睡眠截止时间格式')
  }

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
            `当前时间不在允许的时间段内(${config.allowedTimeRange})`
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
              throw new Error('无效的时间格式');
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
        return "晚安，快去睡觉吧，祝你好梦";
      } catch (error) {
        console.error('Sleep command error:', error);
        const message = await session.send("失败，请检查机器人是否有权限");
        await autoRecall(session, message);
        return;
      }
    });
}
