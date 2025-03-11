import { Context, Session, Random } from 'koishi'
import { Config } from './index'
import {
  mute,
  autoRecall,
  calculateMuteDuration,
  recordMute,
  resolveMuteTarget,
  showEffectMessage,
  getUserName
} from './utils'
import { getRandomMessage } from './messages'

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
  const inputTargetId = targetInput ? await resolveMuteTarget(session, targetInput) : session.userId

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
  const random = new Random();
  if (random.bool(config.clag.targetChangeRate)) {
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
  const isCritical = new Random().bool(config.clag.criticalHitProbability)

  // 计算禁言时长
  const muteDuration = calculateMuteDuration(config, duration, isCritical)

  // 根据不同的目标类型执行禁言
  switch (targetType) {
    case MuteTargetType.SELF:
      await executeSelfMute(session, config, muteDuration, inputTargetId, isBackfire)
      break

    case MuteTargetType.SPECIFIED:
      await executeSpecifiedTargetMute(session, config, inputTargetId, muteDuration, isCritical)
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
  isBackfire: boolean = false
): Promise<void> {
  const success = await mute(session, session.userId, muteDuration, config.clag.enableMessage)

  if (success) {
    let message;

    if (isBackfire && targetId) {
      // 显示反弹效果消息
      const targetName = await getUserName(session, targetId)
      message = await session.send(getRandomMessage('mute', 'backfire', {
        user: session.username,
        target: targetName
      }))
      await autoRecall(session, message, 5000)
    } else {
      // 显示自我惩罚提示
      message = await session.send(getRandomMessage('effects', 'selfPunish', {}))
      await autoRecall(session, message, 3000)
    }

    // 记录禁言历史
    recordMute(session, session.userId, muteDuration)
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
  isCritical: boolean
): Promise<void> {
  const success = await mute(session, targetId, muteDuration, config.clag.enableMessage)

  if (success) {
    await showEffectMessage(session, targetId, isCritical, true)
    recordMute(session, targetId, muteDuration, session.userId)
  }
}
