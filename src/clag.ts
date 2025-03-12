import { Context, Session } from 'koishi'
import { Config } from './index'
import { UserService, MessageService, RandomUtil } from './utils'
import { MuteUtils, MuteTargetType } from './muteUtils'

export function initializeClagFeatures(ctx: Context, config: Config) {
  const clag = ctx.command('clag [target:text] [duration:number]', '随机禁言')
    .channelFields(['guildId'])
    .usage(`随机禁言自己或他人，支持多种特殊效果`)
    .action(async ({ session }, target, duration) => {
      await handleMuteOperation(session, config, target, duration);
    });

  clag.subcommand('.me [duration:number]', '禁言自己')
    .action(async ({ session }, duration) => {
      await handleMuteOperation(session, config, session.userId, duration, true);
    });
}

/**
 * 处理禁言操作
 */
export async function handleMuteOperation(
  session: Session,
  config: Config,
  targetInput?: string,
  duration?: number,
  forceSelf: boolean = false
): Promise<void> {
  try {
    // 解析目标ID
    const targetId = targetInput ?
      await UserService.resolveTarget(session, targetInput) :
      session.userId;

    // 确定禁言目标类型
    const { targetType, isBackfire } = MuteUtils.determineTargetType(
      targetId,
      session.userId,
      config.clag.targetChangeRate,
      forceSelf
    );

    // 执行禁言
    await executeMuteByType(session, config, {
      targetType,
      targetId,
      originalTargetId: targetInput ? targetId : null,
      duration,
      isBackfire
    });
  } catch (error) {
    console.error('禁言操作失败:', error);
    await MessageService.sendAndRecall(session, '执行禁言时发生错误', 5000);
  }
}

/**
 * 根据类型执行禁言
 */
async function executeMuteByType(
  session: Session,
  config: Config,
  params: {
    targetType: MuteTargetType,
    targetId: string,
    originalTargetId: string | null,
    duration?: number,
    isBackfire: boolean
  }
): Promise<void> {
  const { targetType, targetId, originalTargetId, duration, isBackfire } = params;
  const isCritical = RandomUtil.isCritical(config.clag.criticalHitProbability);

  switch (targetType) {
    case MuteTargetType.SELF:
      await executeSelfMute(session, config, originalTargetId, duration, isBackfire, isCritical);
      break;

    case MuteTargetType.SPECIFIED:
      await executeTargetMute(session, config, targetId, duration, isCritical);
      break;
  }
}

/**
 * 执行自我禁言
 */
async function executeSelfMute(
  session: Session,
  config: Config,
  originalTargetId: string | null,
  duration?: number,
  isBackfire: boolean = false,
  isCritical: boolean = false
): Promise<void> {
  // 消息配置
  let messageCategory = 'effects';
  let messageType = 'selfPunish';
  const customVars: Record<string, string> = {};

  // 如果是反弹效果
  if (isBackfire && originalTargetId) {
    messageCategory = 'mute';
    messageType = 'backfire';

    // 获取原目标用户名
    const targetName = await UserService.getUserName(session, originalTargetId);
    customVars.target = targetName;
  }

  await MuteUtils.mute(session, config, {
    targetId: session.userId,
    duration,
    isCritical,
    messageOptions: {
      category: messageCategory,
      type: messageType,
      customVars
    }
  });
}

/**
 * 执行目标禁言
 */
async function executeTargetMute(
  session: Session,
  config: Config,
  targetId: string,
  duration?: number,
  isCritical: boolean = false
): Promise<void> {
  await MuteUtils.mute(session, config, {
    targetId,
    duration,
    isCritical,
    messageOptions: {
      category: 'effects',
      type: isCritical ? 'critical' : 'success'
    }
  });
}
