import { Session } from 'koishi'
import { Config } from './index'
import globalCache from './cache'
import { MessageService, TimeUtil, RandomUtil, UserService } from './utils'

export const CACHE_KEYS = {
  MUTE_HISTORY: 'muteHistory'
}

// 禁言目标类型
export enum MuteTargetType {
  SELF = 'self',
  SPECIFIED = 'specified',
  RANDOM = 'random'
}

/**
 * 禁言结果接口
 */
export interface MuteResult {
  success: boolean
  targetId: string
  targetName: string
  isSelf: boolean
  duration: number
  timeInfo: { minutes: number, seconds: number }
  error?: Error
  messageId?: string | string[]
}

/**
 * 禁言参数接口
 */
export interface MuteOptions {
  targetId?: string
  duration?: number
  baseDuration?: number
  isCritical?: boolean
  bypassTargetCheck?: boolean
  deleteOriginalMessage?: boolean
  recordHistory?: boolean
  messageOptions?: {
    enabled?: boolean
    category?: string
    type?: string
    customVars?: Record<string, string>
    autoRecall?: boolean
    recallDelay?: number
  }
}

/**
 * 禁言工具类
 * 统一处理所有禁言相关逻辑
 */
export class MuteUtils {
  /**
   * 执行禁言操作
   */
  static async mute(
    session: Session,
    config: Config,
    options: MuteOptions = {}
  ): Promise<MuteResult> {
    const result: Partial<MuteResult> = {
      success: false
    };

    try {
      // 处理目标
      const targetId = await this.resolveTarget(session, options.targetId);
      result.targetId = targetId;
      result.isSelf = targetId === session.userId;
      result.targetName = await UserService.getUserName(session, targetId);

      // 计算禁言时长
      const duration = this.calculateDuration(config, {
        fixedDuration: options.duration,
        baseDuration: options.baseDuration,
        isCriticalHit: options.isCritical ?? false
      });
      result.duration = duration;
      result.timeInfo = TimeUtil.formatDuration(duration);

      // 执行禁言
      await this.executeMuteOperation(session, targetId, duration, {
        deleteOriginalMessage: options.deleteOriginalMessage ?? true,
        recordHistory: options.recordHistory ?? true
      });
      result.success = true;

      // 发送消息
      if (options.messageOptions?.enabled !== false) {
        await this.sendMuteMessage(session, {
          ...result as MuteResult,
          messageOptions: options.messageOptions || {}
        });
      }
    } catch (error) {
      result.success = false;
      result.error = error as Error;
      console.error('禁言执行失败:', error);
    }

    return result as MuteResult;
  }

  /**
   * 解析禁言目标
   */
  private static async resolveTarget(session: Session, targetInput?: string): Promise<string> {
    return targetInput ? await UserService.resolveTarget(session, targetInput) : session.userId;
  }

  /**
   * 计算禁言时长
   */
  private static calculateDuration(config: Config, options: {
    fixedDuration?: number,
    baseDuration?: number,
    isCriticalHit?: boolean
  }): number {
    const { fixedDuration, baseDuration, isCriticalHit = false } = options;

    if (fixedDuration) {
      return fixedDuration;
    }

    // 基础时长 (分钟转秒)
    let duration = baseDuration ?
      baseDuration * 60 :
      RandomUtil.int(config.clag.min * 60, config.clag.max * 60);

    // 暴击加成
    if (isCriticalHit) {
      duration = Math.round(duration * 2);
    }

    // 随机波动 (-15% 到 +15%)
    const variation = RandomUtil.float(-0.15, 0.15);
    duration = Math.round(duration * (1 + variation));

    // 返回至少5秒的禁言时间
    return Math.max(5, duration);
  }

  /**
   * 执行底层禁言操作
   */
  private static async executeMuteOperation(
    session: Session,
    targetId: string,
    duration: number,
    options: {
      deleteOriginalMessage?: boolean,
      recordHistory?: boolean
    } = {}
  ): Promise<void> {
    const { deleteOriginalMessage = true, recordHistory = true } = options;

    if (!session.guildId) {
      throw new Error('禁言失败: 缺少服务器ID');
    }

    await session.bot.muteGuildMember(session.guildId, targetId, duration * 1000);

    // 删除触发消息
    if (deleteOriginalMessage && session.messageId) {
      try {
        await session.bot.deleteMessage(session.channelId, session.messageId);
      } catch (error) {
        console.warn('无法删除原始消息:', error);
      }
    }

    // 记录禁言历史
    if (recordHistory) {
      this.recordMute(session, targetId, duration);
    }
  }

  /**
   * 记录禁言历史
   */
  private static recordMute(session: Session, targetId: string, duration: number): void {
    const historyKey = `${session.platform}:${session.guildId}:${targetId}`;
    globalCache.set(CACHE_KEYS.MUTE_HISTORY, historyKey, {
      source: session.userId,
      timestamp: Date.now(),
      duration
    }, 7 * 24 * 60 * 60 * 1000);
  }

  /**
   * 发送禁言消息
   */
  private static async sendMuteMessage(
    session: Session,
    mutationResult: MuteResult & { messageOptions: MuteOptions['messageOptions'] }
  ): Promise<void> {
    const {
      targetName,
      isSelf,
      timeInfo,
      messageOptions = {}
    } = mutationResult;

    const {
      category = 'effects',
      type = isSelf ? 'self' : 'success',
      customVars = {},
      autoRecall = false,
      recallDelay = 5000
    } = messageOptions;

    // 准备消息变量
    const variables = {
      user: session.username,
      target: targetName,
      minutes: String(timeInfo.minutes),
      seconds: String(timeInfo.seconds),
      ...customVars
    };

    // 发送消息
    const messageId = await MessageService.sendEffect(session, {
      category,
      type,
      variables,
      recall: autoRecall,
      recallDelay
    });

    mutationResult.messageId = messageId;
  }

  /**
   * 确定禁言目标类型
   */
  static determineTargetType(
    targetId: string,
    userId: string,
    backfireRate: number,
    forceSelf: boolean = false
  ): { targetType: MuteTargetType, isBackfire: boolean } {
    // 如果指定自己或强制自己
    if (forceSelf || targetId === userId) {
      return { targetType: MuteTargetType.SELF, isBackfire: false };
    }

    // 检查是否反弹
    const isBackfire = RandomUtil.roll(backfireRate);
    return isBackfire
      ? { targetType: MuteTargetType.SELF, isBackfire: true }
      : { targetType: MuteTargetType.SPECIFIED, isBackfire: false };
  }

  /**
   * 获取禁言历史
   */
  static getMuteHistory(session: Session, userId: string): {
    source: string;
    timestamp: number;
    duration: number;
  } | null {
    const historyKey = `${session.platform}:${session.guildId}:${userId}`;
    return globalCache.get(CACHE_KEYS.MUTE_HISTORY, historyKey);
  }

  /**
   * 随机禁言群成员
   */
  static async muteRandomMember(
    session: Session,
    config: Config,
    options: {
      excludeIds?: string[],
      duration?: number,
      messageOptions?: MuteOptions['messageOptions']
    } = {}
  ): Promise<MuteResult | null> {
    try {
      const { excludeIds = [], duration, messageOptions } = options;

      // 获取群成员
      const members = await UserService.getGuildMembers(session);

      // 排除指定的ID（包括机器人自身）
      const availableMembers = members.filter(id =>
        id !== session.selfId && !excludeIds.includes(id)
      );

      if (availableMembers.length === 0) {
        return null;
      }

      // 随机选择一名成员
      const targetId = RandomUtil.choose(availableMembers);

      // 执行禁言
      return await this.mute(session, config, {
        targetId,
        duration,
        messageOptions
      });
    } catch (error) {
      console.error('随机禁言失败:', error);
      return null;
    }
  }

  /**
   * 批量禁言成员
   */
  static async muteBatch(
    session: Session,
    config: Config,
    targetIds: string[],
    options: Omit<MuteOptions, 'targetId'> = {}
  ): Promise<MuteResult[]> {
    const results: MuteResult[] = [];

    for (const targetId of targetIds) {
      try {
        const result = await this.mute(session, config, {
          ...options,
          targetId
        });
        results.push(result);
      } catch (error) {
        console.error(`批量禁言成员 ${targetId} 失败:`, error);
      }
    }

    return results;
  }

  /**
   * 检查用户是否可被禁言
   * 通常用于检查机器人是否有权限禁言目标用户
   */
  static async canMute(session: Session, targetId: string): Promise<boolean> {
    if (!session.guildId) return false;

    try {
      // 尝试获取目标用户在群组中的信息
      const member = await session.bot.getGuildMember(session.guildId, targetId);

      // 检查对方是否为管理员或群主
      if (member.roles?.some(role => ['admin', 'owner'].includes(role))) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('检查禁言权限失败:', error);
      return false;
    }
  }
}
