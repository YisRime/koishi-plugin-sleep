import { Command } from 'koishi'
import { Config } from '.'
import { Utils } from './utils'

export enum biuMode {
  FIXED = 'fixed',
  INCREASING = 'increasing'
}

export function registerbiu(cmd: Command, config: Config) {
  let currentProbability = config.biuProbability;
  // 重置概率（递增模式使用）
  const resetProbability = () => {
    if (config.biuMode === biuMode.INCREASING) {
      currentProbability = config.biuProbability;
    }
  };
  // 增加概率（递增模式使用）
  const increaseProbability = () => {
    if (config.biuMode === biuMode.INCREASING) {
      // 每次失败增加概率，最高不超过100%
      currentProbability = Math.min(currentProbability + 0.1, 1);
    }
  };

  cmd.subcommand('.biu', '禁言轮盘')
    .usage('玩一次轮盘游戏，有一定概率被禁言')
    .action(async ({ session }) => {
      // 随机决定是否禁言
      if (Math.random() < currentProbability) {
        try {
          // 生成随机禁言时长（1到最大值之间）
          const maxMinutes = config.biuMaxDuration;
          const muteMinutes = Math.max(1, Math.floor(Math.random() * maxMinutes) + 1);
          // 禁言触发者
          await session.bot.muteGuildMember(session.guildId, session.userId, muteMinutes * 60);
          // 获取用户名
          const username = session.username;
          // 发送禁言成功消息
          const formattedDuration = Utils.formatDuration(muteMinutes * 60);
          const message = Utils.formatMessage(
            Utils.getRandomMessage(config.biuFailureMsg, '很不幸，你被禁言了{duration}'),
            session.userId,
            username,
            formattedDuration
          );
          // 重置概率（对递增模式有效）
          resetProbability();
          return message;
        } catch (e) {
          return;
        }
      } else {
        // 增加下次概率（对递增模式有效）
        increaseProbability();
        // 发送逃过禁言的消息
        return Utils.getRandomMessage(config.biuSuccessMsg, '恭喜你逃过一劫！');
      }
    });
}