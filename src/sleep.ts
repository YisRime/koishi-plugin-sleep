import { Context } from 'koishi'
import { Config } from './index'
import { MessageService, TimeUtil } from './utils'

/**
 * 睡眠模式类型枚举
 * @enum {string}
 */
export const enum SleepMode {
  STATIC = 'static',
  UNTIL = 'until'
}

/**
 * 插件配置接口
 */
export interface SleepConfig {
  type: SleepMode
  duration?: number
  until?: string
}

/**
 * 初始化睡眠命令
 * @param {Context} ctx - Koishi 上下文
 * @param {Config} config - 插件配置
 */
export function initializeSleepCommand(ctx: Context, config: Config) {
  /**
   * 精致睡眠命令 - 支持两种模式
   */
  ctx.command('sleep', '精致睡眠')
    .alias('jzsm', '精致睡眠')
    .channelFields(['guildId'])
    .usage('禁言自己到第二天早晨，安静入睡')
    .action(async ({ session }) => {
      try {
        const now = new Date();
        const isTimeAllowed = TimeUtil.isWithinTimeRange(config.sleep.allowedTimeRange);

        if (!isTimeAllowed) {
          const message = await session.send(`当前时间不在睡眠时间段内(${config.sleep.allowedTimeRange})`);
          await MessageService.autoRecall(session, message);
          return;
        }
        let duration: number;
        const sleep = config.sleep;
        switch (sleep.type) {
          case SleepMode.STATIC:
            duration = Math.max(1, sleep.duration) * 60 * 60;
            break;
          case SleepMode.UNTIL:
            const [hours, minutes] = sleep.until.split(':').map(Number);
            const endTime = new Date(now);
            endTime.setHours(hours, minutes, 0, 0);
            if (endTime <= now) endTime.setDate(endTime.getDate() + 1);
            duration = Math.max(1, Math.floor((endTime.getTime() - now.getTime()) / 1000));
            break;
        }
        await session.bot.muteGuildMember(session.guildId, session.userId, duration * 1000);
        return '晚安，愿你今晚得享美梦~';
      } catch (error) {
        const message = await session.send('禁言失败，请检查机器人权限');
        await MessageService.autoRecall(session, message);
        return;
      }
    });
}
