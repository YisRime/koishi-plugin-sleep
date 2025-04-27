import { Context } from 'koishi'
import { Config } from './index'
import { Utils } from './utils'

/**
 * 禁言模式枚举
 */
export const enum MuteMode {
  /** 随机成功模式：有概率禁言目标或自己 */
  RANDOM_SUCCESS = 'random_success',
  /** 两败俱伤模式：同时禁言目标和自己 */
  BOTH_MUTE = 'both_mute'
}

/**
 * 设置禁言命令
 */
export function setupMute(ctx: Context, config: Config) {
  const probMgr = Utils.createProbabilityManager(config);
  const cmd = ctx.command('clag <target:text> [duration:number]', '禁言他人')
    .channelFields(['guildId'])
    .usage('禁言他人，但自己也有可能遭殃')
    .action(async ({ session }, target, duration) => {
      // 验证目标用户ID
      const targetId = Utils.getUserId(target);
      if (!targetId) return await Utils.sendMessage(session, '请输入正确的用户', config.showMessage, true);
      // 计算禁言时长
      const time = duration || Math.floor(Math.random() * Math.min(config.maxDuration, 10) * 60);
      // 获取目标用户名
      let targetName = target;
      try {
        const info = await session.bot.getGuildMember(session.guildId, targetId);
        targetName = info?.nick || info?.user?.name || target;
      } catch {}
      // 处理不同模式的禁言逻辑
      if (config.clagMode === MuteMode.RANDOM_SUCCESS) {
        const rate = probMgr.getRate(time);
        if (Math.random() < rate) {
          return await Utils.muteAndSend(session, targetId, time, config.Message, targetName, config.showMessage, true);
        } else {
          return await Utils.muteAndSend(session, targetId, time, config.Message, targetName, config.showMessage, true);
        }
      } else {
        // 两败俱伤模式
        const selfTime = Math.floor(Math.random() * (time - 30)) + 30;
        await Utils.muteAndSend(session, targetId, time, config.Message, targetName, config.showMessage, true);
        return await Utils.muteAndSend(session, session.userId, selfTime, config.Message, session.username, config.showMessage, false);
      }
    });

  // 添加禁言轮盘子命令
  cmd.subcommand('.biu', '禁言轮盘')
    .usage('玩一次轮盘游戏，有一定概率被禁言')
    .action(async ({ session }) => {
      if (Math.random() < probMgr.get()) {
        const time = Math.max(60, Math.floor(Math.random() * config.maxDuration * 60));
        probMgr.reset();
        return await Utils.muteAndSend(session, session.userId, time, config.Message, session.username, config.showMessage, false);
      } else {
        probMgr.increase();
        return '';
      }
    });

  // 添加自我禁言子命令
  cmd.subcommand('.me [duration:number]', '禁言自己')
    .usage('禁言自己随机或指定时长')
    .action(async ({ session }, duration) => {
      const time = duration || Math.floor(Math.random() * config.maxDuration * 60);
      return await Utils.muteAndSend(session, session.userId, time, config.Message, session.username, config.showMessage, false);
    });
  return cmd;
}