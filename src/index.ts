/**
 * 睡眠与禁言功能插件
 * @module sleep
 */
import { Context, Schema } from 'koishi'
import { handleMuteOperation, initializeClagFeatures } from './clag'
import { autoRecall, initializeSeasonalEvents, initializeCacheCleanup } from './utils'
import { SleepMode, SleepConfig, initializeSleepCommand } from './sleep'

export const name = 'sleep'

/**
 * 禁言功能类型枚举
 * @enum {string}
 */
export const enum ClagFeature {
  NORMAL = 'normal',
  ROULETTE = 'roulette'
}

export interface ClagConfig {
  min: number
  max: number
  enableSpecialEffects: boolean
  enableRoulette: boolean
  enableSeasonalEvents: boolean
  criticalHitProbability: number
  rouletteSize: number
  maxAllowedDuration: number
  enableMessage: boolean
  enableMuteOthers: boolean
  probability: number
}

export interface Config {
  sleep: SleepConfig & {
    allowedTimeRange: string
  }
  clag: ClagConfig
}

// Schema配置定义
export const Config: Schema<Config> = Schema.object({
  sleep: Schema.intersect([
    Schema.object({
      type: Schema.union([SleepMode.STATIC, SleepMode.UNTIL, SleepMode.RANDOM]).description('精致睡眠模式'),
      allowedTimeRange: Schema.string().default('20-8').pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/).description('允许睡眠的时间段(HH-HH)'),
    }).description('睡眠配置').default({ type: SleepMode.STATIC, allowedTimeRange: '20-8' }),
    Schema.union([
      Schema.object({
        type: Schema.const(SleepMode.STATIC).required(),
        duration: Schema.number().default(8).description('固定禁言时长（小时）'),
      }),
      Schema.object({
        type: Schema.const(SleepMode.UNTIL).required(),
        until: Schema.string().default('08:00').description('禁言截止时间(HH:MM)'),
      }),
      Schema.object({
        type: Schema.const(SleepMode.RANDOM).required(),
        min: Schema.number().default(6).description('最短禁言时长（小时）'),
        max: Schema.number().default(10).description('最长禁言时长（小时）'),
      }),
    ]),
  ]),
  clag: Schema.object({
    min: Schema.number().default(0.5).description('最小时长（分钟）'),
    max: Schema.number().default(10).description('最大时长（分钟）'),
    enableSpecialEffects: Schema.boolean().default(true).description('启用特殊效果'),
    enableRoulette: Schema.boolean().default(true).description('启用禁言轮盘'),
    enableSeasonalEvents: Schema.boolean().default(true).description('启用节日特效'),
    criticalHitProbability: Schema.number().default(0.1).min(0).max(1).description('禁言暴击概率'),
    rouletteSize: Schema.number().default(3).min(2).max(10).description('轮盘人数'),
    maxAllowedDuration: Schema.number().default(1440).description('最大普通禁言限制（分钟）'),
    enableMessage: Schema.boolean().default(true).description('启用禁言提示'),
    enableMuteOthers: Schema.boolean().default(true).description('允许禁言他人'),
    probability: Schema.number().default(0.5).min(0).max(1).description('禁言成功概率'),
  }).description('禁言配置'),
})

/**
 * 插件主函数
 * @param {Context} ctx - Koishi 上下文
 * @param {Config} config - 插件配置
 */
export async function apply(ctx: Context, config: Config) {
  initializeCacheCleanup()
  initializeSleepCommand(ctx, config)
  initializeClagFeatures(ctx, config)

  if (config.clag.enableSeasonalEvents) {
    initializeSeasonalEvents(ctx)
  }

  /**
   * 随机禁言命令组
   */
  const clag = ctx.command('clag [target:text] [duration:number]')
    .channelFields(['guildId'])
    .action(async ({ session }, target, duration) => {
      if (target && !config.clag.enableMuteOthers) {
        const message = await session.send("已禁用禁言他人功能")
        await autoRecall(session, message)
        return
      }
      const actualTarget = target || session.userId
      await handleMuteOperation(session, config, actualTarget, duration, ClagFeature.NORMAL)
    })

  clag.subcommand('.roulette [count:number]', { authority: 1 })
    .action(async ({ session }, count) => {
      if (!config.clag.enableRoulette) {
        const message = await session.send("已禁用轮盘禁言功能")
        await autoRecall(session, message)
        return
      }
      await handleMuteOperation(session, config, null, null, ClagFeature.ROULETTE, count || config.clag.rouletteSize)
    })
}
