import { Session, Random } from 'koishi'
import { Config } from '../index'
import { mute, autoRecall, getGuildMembers } from '../mute'
import {
  hasImmunity,
  calculateMuteDuration,
  recordMute,
  getUserName,
  selectRandomTarget
} from './utils'
import { grantChainReactionRight } from './chain'

/**
 * 执行禁言轮盘
 */
export async function executeRouletteMode(
  session: Session,
  config: Config,
  count: number = 3
): Promise<{ success: boolean, targetId?: string }> {
  try {
    // 使用统一的 getGuildMembers 函数获取成员列表
    const validMembers = await getGuildMembers(session)

    // 检查是否有足够的成员
    if (validMembers.length < 2) {
      const message = await session.send(session.text('commands.clag.messages.errors.not_enough_members'))
      await autoRecall(session, message)
      return { success: false }
    }

    // 选择轮盘参与者
    const participants = await selectRouletteParticipants(session, validMembers, count)

    // 发送轮盘启动消息
    const participantsNames = await Promise.all(participants.map(id => getUserName(session, id)))
    await session.send(session.text('commands.clag.roulette.start', [participantsNames.join('、')]))

    // 模拟转盘效果
    await simulateRoulette(session, participants)

    // 选择最终目标
    const targetInfo = await selectFinalTarget(session, participants, config)
    if (!targetInfo.targetId) return { success: false }

    // 计算禁言时长
    const muteDuration = calculateMuteDuration(
      config,
      undefined,
      targetInfo.isCritical
    )

    // 执行禁言
    const success = await mute(session, targetInfo.targetId, muteDuration, config.enableMessage)

    if (success) {
      // 发送最终结果
      const victimName = await getUserName(session, targetInfo.targetId)
      await session.send(session.text('commands.clag.roulette.result', [
        victimName,
        Math.floor(muteDuration / 60),
        muteDuration % 60,
        targetInfo.isCritical ? session.text('commands.clag.effects.critical_hit') : ''
      ]))

      // 如果启用连锁禁言，给予复仇权利
      if (config.clag.enableChainReaction) {
        grantChainReactionRight(
          session,
          targetInfo.targetId,
          session.userId,
          config.clag.chainReactionExpiry
        )
      }

      // 记录禁言历史
      recordMute(session, targetInfo.targetId, muteDuration, session.userId)

      return { success: true, targetId: targetInfo.targetId }
    }

    return { success: false }
  } catch (error) {
    console.error('Roulette mode failed:', error)
    return { success: false }
  }
}

/**
 * 选择轮盘参与者
 */
async function selectRouletteParticipants(
  session: Session,
  validMembers: string[],
  count: number
): Promise<string[]> {
  // 参与人数不能超过有效成员数
  const participantCount = Math.min(count, validMembers.length)
  const participants: string[] = []

  // 确保发起者在内
  participants.push(session.userId)

  // 随机选择其他参与者
  const remainingMembers = validMembers.filter(id => id !== session.userId)
  while (participants.length < participantCount && remainingMembers.length > 0) {
    const index = new Random().int(0, remainingMembers.length - 1)
    participants.push(remainingMembers[index])
    remainingMembers.splice(index, 1)
  }

  // 打乱顺序
  return participants.sort(() => Math.random() - 0.5)
}

/**
 * 模拟轮盘旋转效果
 */
async function simulateRoulette(session: Session, participants: string[]): Promise<void> {
  // 先指向几个随机的人增加悬念
  const iterations = new Random().int(2, 4)
  for (let i = 0; i < iterations; i++) {
    const randomIndex = new Random().int(0, participants.length - 1)
    const currentName = await getUserName(session, participants[randomIndex])
    const indicatorMsg = await session.send(session.text('commands.clag.roulette.spinning', [currentName]))
    await autoRecall(session, indicatorMsg, 800)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

/**
 * 选择最终被禁言的目标
 */
async function selectFinalTarget(
  session: Session,
  participants: string[],
  config: Config
): Promise<{ targetId?: string, isCritical: boolean }> {
  // 随机选择最终禁言目标
  let victimIndex = new Random().int(0, participants.length - 1)
  let targetId = participants[victimIndex]

  // 检查是否有免疫
  if (hasImmunity(targetId, session.guildId, session.platform)) {
    const immuneUserName = await getUserName(session, targetId)
    await session.send(session.text('commands.clag.effects.immunity', [immuneUserName]))

    // 重新选择，排除免疫者
    const newParticipants = participants.filter(id => id !== targetId)
    if (newParticipants.length === 0) {
      await session.send(session.text('commands.clag.roulette.all_immune'))
      return { targetId: undefined, isCritical: false }
    }

    victimIndex = new Random().int(0, newParticipants.length - 1)
    targetId = newParticipants[victimIndex]
  }

  // 随机决定是否暴击
  const isCritical = config.clag.enableSpecialEffects &&
                    new Random().bool(config.clag.criticalHitProbability)

  return { targetId, isCritical }
}
