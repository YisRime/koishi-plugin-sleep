import { Context } from 'koishi'
import { Config } from './index'
import { Utils } from './utils'

/**
 * 注册睡眠命令
 */
export function registerSleep(ctx: Context, config: Config) {
  ctx.command('sleep', '精致睡眠')
    .alias('精致睡眠')
    .channelFields(['guildId'])
    .usage('禁言自己到第二天，安静入睡')
    .action(async ({ session }) => {
      // 检查是否在睡眠时间范围内
      if (!Utils.isInTimeRange(config.sleepTime)) {
        return await Utils.sendMessage(session, '当前时间不在睡眠时间段内', config.showMessage, true);
      }
      // 计算睡眠时长
      const now = new Date();
      const sleepSetting = config.sleepSetting;
      let duration: number;
      // 根据设置类型计算时长
      if (typeof sleepSetting === 'number') {
        duration = Math.max(1, sleepSetting) * 3600;
      } else if (typeof sleepSetting === 'string' && sleepSetting.includes(':')) {
        const [h, m] = sleepSetting.split(':').map(Number);
        const end = new Date(now);
        end.setHours(h, m, 0, 0);
        if (end <= now) end.setDate(end.getDate() + 1);
        duration = Math.max(1, Math.floor((end.getTime() - now.getTime()) / 1000));
      } else {
        duration = 8 * 3600;
      }
      return await Utils.muteAndSend(session, session.userId, duration, config.sleepMsg, session.username, config.showMessage);
    });
}