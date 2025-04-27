import { Context } from 'koishi'
import { Config } from './index'
import { Utils } from './utils'
import { registerbiu } from './biu'

export const enum ClagMode {
  RANDOM_SUCCESS = 'random_success',
  BOTH_MUTE = 'both_mute'
}

export function registerClag(ctx: Context, config: Config) {
  const cmd = ctx.command('clag <target:text> [duration:number]', '禁言他人')
    .channelFields(['guildId'])
    .usage('禁言他人，但自己也有可能遭殃')
    .action(async ({ session }, target, duration) => {
      const targetId = Utils.extractUserId(target)
      if (!targetId) {
        const error = await session.send('请输入正确的用户')
        await Utils.scheduleRecall(session, error)
        return
      }
      // 计算禁言时长(秒)
      let muteSeconds: number
      const maxDuration = config.clagMaxDuration
      if (duration) {
        // 用户指定的时长不受最大禁言时长限制
        muteSeconds = duration * 60
      } else {
        // 随机生成的时长受最大禁言时长限制
        muteSeconds = Math.floor(Math.random() * Math.min(maxDuration, 10)) * 60
      }
      // 获取目标用户名
      let targetUsername = target;
      try {
        const targetInfo = await session.bot.getGuildMember(session.guildId, targetId);
        targetUsername = targetInfo?.nick || targetInfo?.user?.name || target;
      } catch (e) {}
      try {
        // 根据模式执行禁言
        if (config.clagMode === ClagMode.RANDOM_SUCCESS) {
          // 动态计算禁言成功概率：时长越大，成功率越低
          const baseProbability = config.clagProbability
          const durationMinutes = muteSeconds / 60
          // 使用单一公式计算概率
          const successProbability = Math.max(0.01, baseProbability * (15 / (durationMinutes + 15)))
          const success = Math.random() < successProbability
          if (success) {
            await session.bot.muteGuildMember(session.guildId, targetId, muteSeconds * 1000);
            const message = Utils.getRandomMessage(
              config.clagSuccessMsg, `禁言对方${Utils.formatDuration(muteSeconds)}，你逃过一劫！`
            );
            return Utils.formatMessage(
              message,
              targetId,
              targetUsername,
              Utils.formatDuration(muteSeconds)
            );
          } else {
            await session.bot.muteGuildMember(session.guildId, session.userId, muteSeconds * 1000);
            const message = Utils.getRandomMessage(
              config.clagFailureMsg, `禁言失败！作为惩罚，禁言你${Utils.formatDuration(muteSeconds)}`
            );
            return Utils.formatMessage(
              message,
              session.userId,
              session.username,
              Utils.formatDuration(muteSeconds)
            );
          }
        } else {
          // 双禁言模式
          await session.bot.muteGuildMember(session.guildId, targetId, muteSeconds * 1000);
          const selfDuration = Math.floor(Math.random() * muteSeconds);
          await session.bot.muteGuildMember(session.guildId, session.userId, selfDuration * 1000);
          const message = Utils.getRandomMessage(
            config.clagSelfMuteMsg, `禁言对方${Utils.formatDuration(muteSeconds)}，作为代价，禁言你${Utils.formatDuration(selfDuration)}`
          );
          return Utils.formatMessage(
            message,
            targetId,
            targetUsername,
            Utils.formatDuration(muteSeconds),
            Utils.formatDuration(selfDuration)
          );
        }
      } catch (error) {
        return
      }
    })
  // 如果轮盘功能启用，注册为子命令
  if (config.biuEnabled) {
    registerbiu(cmd, config)
  }
  return cmd
}