import { Context } from 'koishi'
import { Config } from './index'
import { Utils } from './utils'

/**
 * 禁言模式枚举
 * @enum {string}
 */
export const enum MuteMode {
  /** 随机成功模式：有概率禁言目标或自己 */
  RANDOM_SUCCESS = 'random_success',
  /** 两败俱伤模式：同时禁言目标和自己 */
  BOTH_MUTE = 'both_mute'
}

/**
 * 设置禁言命令
 * @param ctx - Koishi上下文
 * @param config - 插件配置
 * @returns 创建的命令
 */
export function setupMute(ctx: Context, config: Config) {
  const probMgr = Utils.createProbabilityManager(config)
  // 主禁言命令
  const cmd = ctx.command('clag <target:text> [duration:number]', '禁言他人')
    .channelFields(['guildId'])
    .usage('禁言他人，但自己也有可能遭殃')
    .action(async ({ session }, target, duration) => {
      // 验证目标用户ID
      const targetId = Utils.getUserId(target)
      if (!targetId) return Utils.sendMessage(session, '请输入正确的用户', { showMessage: config.showMessage, autoDelete: true })
      // 计算禁言时长并获取用户名
      const time = duration || Utils.getRandomDuration(Math.min(config.maxDuration, 10))
      const targetName = await Utils.getUsername(session, targetId, target)
      // 根据不同模式执行禁言
      if (config.clagMode === MuteMode.RANDOM_SUCCESS) {
        // 随机成功模式
        const willSucceed = Math.random() < probMgr.getRate(time)
        await Utils.mute(
          session, willSucceed ? targetId : session.userId, time,
          config, willSucceed ? targetName : session.username, willSucceed, config.Message
        )
      } else {
        // 两败俱伤模式
        const selfTime = Math.floor(Math.random() * (time - 30)) + 30
        await Utils.mute(session, targetId, time, config, targetName, true, config.Message)
        await Utils.mute(session, session.userId, selfTime, config, session.username, false, config.Message)
      }
    })
  // 禁言轮盘子命令
  cmd.subcommand('.biu', '禁言轮盘')
    .usage('玩一次轮盘游戏，有一定概率被禁言')
    .action(async ({ session }) => {
      if (Math.random() < probMgr.get()) {
        const time = Utils.getRandomDuration(config.maxDuration)
        probMgr.reset()
        await Utils.mute(session, session.userId, time, config, session.username, false, config.Message)
      } else {
        probMgr.increase()
        return '安全！'
      }
    })
  // 自我禁言子命令
  cmd.subcommand('.me [duration:number]', '禁言自己')
    .usage('禁言自己随机或指定时长')
    .action(async ({ session }, duration) => {
      const time = duration || Utils.getRandomDuration(config.maxDuration)
      await Utils.mute(session, session.userId, time, config, session.username, false, config.Message)
    })
  return cmd
}