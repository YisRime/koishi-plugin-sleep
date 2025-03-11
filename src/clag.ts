import { Context, Session } from 'koishi'
import { Config } from './index'
import {
  MuteService,
  UserService,
  MessageService,
  RandomUtil,
  TimeUtil
} from './utils'

/**
 * 禁言目标类型
 */
enum MuteTargetType {
  SELF = 'self',    // 禁言自己（包含主动和被动反弹）
  SPECIFIED = 'specified'  // 禁言他人
}

/**
 * 初始化clag功能
 */
export function initializeClagFeatures(ctx: Context, config: Config) {
  /**
   * 随机禁言命令
   */
  const clag = ctx.command('clag [target:text] [duration:number]', '随机禁言')
    .channelFields(['guildId'])
    .usage(`随机禁言自己或他人，支持多种特殊效果`)
    .action(async ({ session }, target, duration) => {
      await handleMuteOperation(session, config, target, duration)
    })

  /**
   * 禁言自己子命令
   */
  clag.subcommand('.me [duration:number]', '禁言自己')
    .action(async ({ session }, duration) => {
      await handleMuteOperation(session, config, session.userId, duration, true)
    })
}

/**
 * 处理禁言操作主函数
 */
export async function handleMuteOperation(
  session: Session,
  config: Config,
  targetInput?: string,
  duration?: number,
  forceSelf: boolean = false
): Promise<void> {
  // 解析目标ID
  const inputTargetId = targetInput ? await UserService.resolveTarget(session, targetInput) : session.userId

  // 确定最终的禁言目标类型和是否为反弹
  const { targetType, isBackfire } = await determineTargetType(session, inputTargetId, config, forceSelf)

  // 根据目标类型执行禁言
  await executeTargetedMute(session, config, targetType, inputTargetId, duration, isBackfire)
}

/**
 * 确定禁言目标类型
 */
async function determineTargetType(
  session: Session,
  inputTargetId: string,
  config: Config,
  forceSelf: boolean
): Promise<{ targetType: MuteTargetType, isBackfire: boolean }> {
  // 如果强制自己或输入的就是自己
  if (forceSelf || inputTargetId === session.userId) {
    return { targetType: MuteTargetType.SELF, isBackfire: false };
  }

  // 随机决定是否改变目标（反弹到自己）
  if (RandomUtil.withProbability(config.clag.targetChangeRate)) {
    // 禁言反弹到自己
    return { targetType: MuteTargetType.SELF, isBackfire: true };
  } else {
    // 禁言指定的目标
    return { targetType: MuteTargetType.SPECIFIED, isBackfire: false };
  }
}

/**
 * 执行针对特定目标的禁言
 */
async function executeTargetedMute(
  session: Session,
  config: Config,
  targetType: MuteTargetType,
  inputTargetId: string,
  duration?: number,
  isBackfire: boolean = false
): Promise<void> {
  // 随机决定是否暴击
  const isCritical = RandomUtil.withProbability(config.clag.criticalHitProbability)

  // 计算禁言时长
  const muteDuration = MuteService.calculateDuration(config, {
    baseDuration: duration,
    isCriticalHit: isCritical
  })

  // 格式化时间用于展示
  const { minutes, seconds } = TimeUtil.formatDuration(muteDuration)

  // 根据不同的目标类型执行禁言
  switch (targetType) {
    case MuteTargetType.SELF:
      await executeSelfMute(session, config, muteDuration, inputTargetId, isBackfire, { minutes, seconds })
      break

    case MuteTargetType.SPECIFIED:
      await executeSpecifiedTargetMute(session, config, inputTargetId, muteDuration, isCritical, { minutes, seconds })
      break
  }
}

/**
 * 执行禁言自己（包括反弹效果）
 */
async function executeSelfMute(
  session: Session,
  config: Config,
  muteDuration: number,
  targetId?: string,
  isBackfire: boolean = false,
  timeInfo?: { minutes: number, seconds: number }
): Promise<void> {
  try {
    const success = await MuteService.mute(session, session.userId, muteDuration, {
      enableMessage: config.clag.enableMessage,
      recordHistory: true
    })

    if (success) {
      if (isBackfire && targetId) {
        // 显示反弹效果消息
        const targetName = await UserService.getUserName(session, targetId)
        // 修复: 使用正确的消息类别和变量
        await session.send(MessageService.getRandomMessage('mute', 'backfire', {
          user: session.username,
          target: targetName,
          minutes: String(timeInfo?.minutes || 0),
          seconds: String(timeInfo?.seconds || 0)
        }))
      } else {
        // 显示自我惩罚提示
        // 修复: 使用正确的消息类别和变量
        await session.send(MessageService.getRandomMessage('effects', 'selfPunish', {
          minutes: String(timeInfo?.minutes || 0),
          seconds: String(timeInfo?.seconds || 0)
        }))
      }
    } else {
      // 禁言失败提示
      await MessageService.sendAndRecall(session, '禁言失败，请检查机器人权限或目标是否可被禁言', 5000)
    }
  } catch (error) {
    console.error('Self mute failed:', error)
    // 修复: 安全地访问error信息
    const errorMsg = error instanceof Error ? error.message : String(error)
    await MessageService.sendAndRecall(session, '执行禁言时发生错误: ' + errorMsg, 5000)
  }
}

/**
 * 执行对指定目标的禁言
 */
async function executeSpecifiedTargetMute(
  session: Session,
  config: Config,
  targetId: string,
  muteDuration: number,
  isCritical: boolean,
  timeInfo?: { minutes: number, seconds: number }
): Promise<void> {
  try {
    // 尝试获取目标用户名
    const username = await UserService.getUserName(session, targetId)

    const success = await MuteService.mute(session, targetId, muteDuration, {
      enableMessage: config.clag.enableMessage,
      recordHistory: true
    })

    if (success) {
      // 准备展示效果消息
      if (isCritical) {
        // 暴击效果消息
        // 修复: 使用正确的消息发送方式
        await session.send(MessageService.getRandomMessage('effects', 'critical', {
          user: session.username,
          target: username,
          minutes: String(timeInfo?.minutes || 0),
          seconds: String(timeInfo?.seconds || 0)
        }))
      } else {
        // 普通禁言效果消息
        // 修复: 使用正确的消息发送方式
        await session.send(MessageService.getRandomMessage('effects', 'success', {
          user: session.username,
          target: username,
          minutes: String(timeInfo?.minutes || 0),
          seconds: String(timeInfo?.seconds || 0)
        }))
      }
    } else {
      // 禁言失败提示
      await MessageService.sendAndRecall(session, `禁言 ${username} 失败，请检查权限或目标是否可被禁言`, 5000)
    }
  } catch (error) {
    console.error('Target mute failed:', error)
    // 修复: 安全地访问error信息
    const errorMsg = error instanceof Error ? error.message : String(error)
    await MessageService.sendAndRecall(session, '执行禁言时发生错误: ' + errorMsg, 5000)
  }
}
