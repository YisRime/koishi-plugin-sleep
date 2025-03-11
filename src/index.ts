import { Context, Schema } from 'koishi'
import { handleMuteOperation, initializeClagFeatures } from './clag'
import { autoRecall } from './utils'
import { SleepMode, SleepConfig, initializeSleepCommand } from './sleep'
import { initializeCache } from './cache'
import { initializeRouletteCommand } from './roulette'
import { initializeMagicMuteFeature } from './magicmute'
import './messages'

export const name = 'sleep'

/**
 * 禁言功能类型枚举
 * @enum {string}
 */
export const enum ClagFeature {
  NORMAL = 'normal'
}

export interface ClagConfig {
  min: number
  max: number
  criticalHitProbability: number
  enableMessage: boolean
  targetChangeRate: number
}

export interface MagicMuteConfig {
  enabled: boolean
  activeTime: string
  minProbability: number
  maxProbability: number
}

export interface Config {
  sleep: SleepConfig & {
    allowedTimeRange: string
  }
  clag: ClagConfig
  magicMute: MagicMuteConfig
}

// Schema配置定义
export const Config: Schema<Config> = Schema.object({
  sleep: Schema.intersect([
    Schema.object({
      type: Schema.union([SleepMode.STATIC, SleepMode.UNTIL]).description('精致睡眠模式'),
      allowedTimeRange: Schema.string().default('20-8').pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/).description('允许睡眠的时间段(HH-HH)'),
    }).description('睡眠配置').default({ type: SleepMode.STATIC, allowedTimeRange: '20-8' }),
    Schema.union([
      Schema.object({
        type: Schema.const(SleepMode.STATIC).required(),
        duration: Schema.number().default(8).description('固定禁言时长（小时）'),
      }),
      Schema.object({
        type: Schema.const(SleepMode.UNTIL).required(),
        until: Schema.string().default('08:00').pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).description('禁言截止时间(HH:MM)'),
      })
    ]),
  ]).description('精致睡眠配置'),
  clag: Schema.object({
    min: Schema.number().default(0.5).description('最小时长（分钟）'),
    max: Schema.number().default(10).description('最大时长（分钟）'),
    enableMessage: Schema.boolean().default(true).description('启用消息提示'),
    criticalHitProbability: Schema.number().default(0.1).min(0).max(1).description('暴击概率'),
    targetChangeRate: Schema.number().default(0.6).min(0).max(1).description('反弹概率'),
  }).description('禁言配置'),
  magicMute: Schema.object({
    enabled: Schema.boolean().default(false).description('启用神秘口球魔法'),
    activeTime: Schema.string().default('22-6').pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/).description('活跃时间段(HH-HH)'),
    minProbability: Schema.number().default(1).min(0.1).max(15).step(0.1).description('最小触发概率(%)'),
    maxProbability: Schema.number().default(15).min(1).max(30).step(0.1).description('最大触发概率(%)'),
  }).description('神秘口球魔法配置'),
})

/**
 * 插件主函数
 */
export async function apply(ctx: Context, config: Config) {
  initializeCache(ctx)
  initializeSleepCommand(ctx, config)
  initializeClagFeatures(ctx, config)
  initializeRouletteCommand(ctx, config)
  initializeMagicMuteFeature(ctx, config)
}
