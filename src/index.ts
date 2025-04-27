import { Context, Schema } from 'koishi'
import { SleepMode, registerSleep } from './sleep'
import { ClagMode, registerClag } from './clag'
import { biuMode } from './biu'
import { registerRepeat, RepeatMode } from './repeat'
import { registerRandom } from './random'

export const name = 'sleep'

export interface Config {
  enabled: boolean
  sleepMode?: SleepMode
  sleepDuration?: number
  sleepUntil?: string
  sleepTimeRange?: string
  clagEnabled: boolean
  clagMode?: ClagMode
  clagProbability?: number
  clagMaxDuration?: number
  biuEnabled: boolean
  biuMode?: biuMode
  biuProbability?: number
  biuMaxDuration?: number
  sleepSuccessMsg?: string[]
  clagSuccessMsg?: string[]
  clagSelfMuteMsg?: string[]
  clagFailureMsg?: string[]
  biuSuccessMsg?: string[]
  biuFailureMsg?: string[]
  repeatEnabled: boolean
  repeatMode?: RepeatMode
  repeatProbability?: number
  repeatMaxDuration?: number
  repeatMuteMsg?: string[]
  repeatMuteTarget?: number | string
  randomEnabled: boolean
  randomProbability?: number
  randomMaxDuration?: number
  randomMuteMsg?: string[]
  randomTimeRange?: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enabled: Schema.boolean().default(false).description('启用精致睡眠指令'),
    clagEnabled: Schema.boolean().default(false).description('启用禁言指令'),
    biuEnabled: Schema.boolean().default(false).description('启用禁言轮盘指令'),
    repeatEnabled: Schema.boolean().default(false).description('启用复读禁言'),
    randomEnabled: Schema.boolean().default(false).description('启用随机禁言'),
  }).description('指令配置'),
  Schema.union([
    Schema.object({
      enabled: Schema.const(true).required(),
      sleepMode: Schema.union([
        Schema.const(SleepMode.STATIC).description('固定时长模式'),
        Schema.const(SleepMode.UNTIL).description('截止时间模式'),
      ]).description('精致睡眠模式'),
      sleepTimeRange: Schema.string().description('开启时间段(HH-HH)').default('20-8')
        .pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/),
      sleepDuration: Schema.number().description('固定时长（小时）').default(8),
      sleepUntil: Schema.string().description('截止时间(HH:MM)').default('08:00')
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    }).description('精致睡眠配置'),
  ]),
  Schema.union([
    Schema.object({
      clagEnabled: Schema.const(true).required(),
      clagMode: Schema.union([
        Schema.const(ClagMode.RANDOM_SUCCESS).description('概率反噬'),
        Schema.const(ClagMode.BOTH_MUTE).description('两败俱伤'),
      ]).description('禁言模式'),
      clagProbability: Schema.number().description('成功概率').default(0.5).min(0).max(1),
      clagMaxDuration: Schema.number().description('最大时长（分钟）').default(15).min(1),
    }).description('禁言配置'),
  ]),
  Schema.union([
    Schema.object({
      biuEnabled: Schema.const(true).required(),
      biuMode: Schema.union([
        Schema.const(biuMode.FIXED).description('固定'),
        Schema.const(biuMode.INCREASING).description('递增'),
      ]).description('禁言概率'),
      biuProbability: Schema.number().description('初始概率').default(0.2).min(0).max(1),
      biuMaxDuration: Schema.number().description('最大时长（分钟）').default(15).min(1),
    }).description('禁言轮盘配置'),
  ]),
  Schema.union([
    Schema.object({
      repeatEnabled: Schema.const(true).required(),
      repeatMode: Schema.union([
        Schema.const(RepeatMode.FIXED).description('固定'),
        Schema.const(RepeatMode.INCREASING).description('递增'),
      ]).description('禁言概率').default(RepeatMode.FIXED),
      repeatProbability: Schema.number().description('初始概率').default(0.25).min(0).max(1),
      repeatMaxDuration: Schema.number().description('最大时长（分钟）').default(10).min(1),
      repeatMuteTarget: Schema.union([
        Schema.number().description('倒数第N人').default(1),
        Schema.string().description('随机选N人').default('2'),
      ]).description('禁言目标'),
    }).description('复读禁言配置'),
  ]),
  Schema.union([
    Schema.object({
      randomEnabled: Schema.const(true).required(),
      randomProbability: Schema.number().description('禁言概率').default(0.05).min(0).max(1),
      randomMaxDuration: Schema.number().description('最大时长（分钟）').default(5).min(1),
      randomTimeRange: Schema.string().description('开启时间段(HH-HH)').default('22-6')
        .pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/),
    }).description('随机禁言配置'),
  ]),
  Schema.object({
    sleepSuccessMsg: Schema.array(Schema.string()).description('精致睡眠提示消息').default([
      '晚安，做个好梦~',
      '休息一下吧，明天见！',
      '已进入精致睡眠模式，明早见！'
    ]).role('table'),
    clagSuccessMsg: Schema.array(Schema.string()).description('禁言成功提示消息').default([
      '{at}被禁言{duration}，你逃过一劫！',
      '成功禁言{username}{duration}！',
      '已将{username}禁言{duration}，安静的享受这段时间吧~'
    ]).role('table'),
    clagFailureMsg: Schema.array(Schema.string()).description('禁言失败提示消息').default([
      '禁言失败！作为惩罚，{at}被禁言{duration}',
      '{username}你太倒霉了，被禁言{duration}',
      '哎呀，失败了！你被禁言{duration}'
    ]).role('table'),
    clagSelfMuteMsg: Schema.array(Schema.string()).description('禁言自我提示消息').default([
      '成功禁言{at}{duration}，但你也被禁言{selfDuration}',
      '{username}被禁言{duration}，你被禁言{selfDuration}，双赢！',
      '禁言执行成功！对方{duration}，你{selfDuration}'
    ]).role('table'),
    biuSuccessMsg: Schema.array(Schema.string()).description('轮盘逃过提示消息').default([
      '恭喜你逃过一劫！',
      '运气不错，这次安全了',
      '命大，下次小心点'
    ]).role('table'),
    biuFailureMsg: Schema.array(Schema.string()).description('轮盘失败提示消息').default([
      '{at}很不幸，你被禁言{duration}',
      '砰！{username}中弹了，禁言{duration}',
      '运气不好，{username}被禁言{duration}'
    ]).role('table'),
    repeatMuteMsg: Schema.array(Schema.string()).description('复读禁言提示消息').default([
      '{at}复读被抓，禁言{duration}',
      '检测到复读，{username}被禁言{duration}',
    ]).role('table'),
    randomMuteMsg: Schema.array(Schema.string()).description('随机禁言提示消息').default([
      '{at}被随机禁言{duration}',
      '运气不好，{username}被随机禁言{duration}',
    ]).role('table'),
  }).description('消息配置'),
])

export function apply(ctx: Context, config: Config) {
  if (config.enabled) registerSleep(ctx, config)
  if (config.clagEnabled) registerClag(ctx, config)
  if (config.repeatEnabled) registerRepeat(ctx, config)
  if (config.randomEnabled) registerRandom(ctx, config)
}