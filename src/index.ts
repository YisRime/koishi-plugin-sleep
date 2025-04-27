import { Context, Schema } from 'koishi'
import { registerSleep } from './sleep'
import { MuteMode, setupMute } from './clag'
import { setupMonitor, ProbMode, ListenMode } from './repeat'

export const name = 'sleep'

export const usage = `
<div style="border-radius: 10px; border: 1px solid #ddd; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; color: #4a6ee0;">📌 插件说明</h2>
  <p>📖 <strong>使用文档</strong>：请点击左上角的 <strong>插件主页</strong> 查看插件使用文档</p>
  <p>🔍 <strong>更多插件</strong>：可访问 <a href="https://github.com/YisRime" style="color:#4a6ee0;text-decoration:none;">苡淞的 GitHub</a> 查看本人的所有插件</p>
</div>

<div style="border-radius: 10px; border: 1px solid #ddd; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; color: #e0574a;">❤️ 支持与反馈</h2>
  <p>🌟 喜欢这个插件？请在 <a href="https://github.com/YisRime" style="color:#e0574a;text-decoration:none;">GitHub</a> 上给我一个 Star！</p>
  <p>🐛 遇到问题？请通过 <strong>Issues</strong> 提交反馈，或加入 QQ 群 <a href="https://qm.qq.com/q/PdLMx9Jowq" style="color:#e0574a;text-decoration:none;"><strong>855571375</strong></a> 进行交流</p>
</div>
`

/**
 * 插件配置接口
 * @interface
 */
export interface Config {
  /** 是否启用精致睡眠功能 */
  enabled: boolean
  /** 睡眠设置，可以是小时数或截止时间 */
  sleepSetting?: string | number
  /** 睡眠时间范围，格式为"开始-结束" */
  sleepTime?: string
  /** 是否启用禁言指令 */
  clagEnabled: boolean
  /** 禁言模式 */
  clagMode?: MuteMode
  /** 最大禁言时长（分钟） */
  maxDuration?: number
  /** 是否显示返回消息 */
  showMessage: boolean
  /** 睡眠消息模板数组 */
  sleepMsg?: string[]
  /** 禁言消息模板数组 */
  Message?: Array<{Success: string, Failure: string}>
  /** 监听模式：关闭、复读禁言或随机禁言 */
  listenMode: ListenMode
  /** 复读禁言目标设置：数字为禁言最后几个人，字符串为随机禁言多人 */
  repeatMuteTarget?: number | string
  /** 监听时间范围，格式为"开始-结束" */
  listenTime?: string
  /** 概率模式：固定或递增 */
  probabilityMode: ProbMode
  /** 初始概率值 */
  probabilityInitial: number
}

/**
 * 插件配置模式定义
 */
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    clagEnabled: Schema.boolean().default(true).description('启用禁言指令'),
    enabled: Schema.boolean().default(true).description('启用精致睡眠指令'),
    sleepTime: Schema.string().description('精致睡眠开启时段').default('20-8')
      .pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/),
    listenMode: Schema.union([
      Schema.const(ListenMode.OFF).description('关闭'),
      Schema.const(ListenMode.REPEAT).description('复读禁言'),
      Schema.const(ListenMode.RANDOM).description('随机禁言')
    ]).description('启用监听禁言').default(ListenMode.OFF),
    listenTime: Schema.string().description('监听开启时段').default('22-6')
      .pattern(/^([01]?[0-9]|2[0-3])-([01]?[0-9]|2[0-3])$/)
  }).description('开关配置'),
  Schema.object({
    maxDuration: Schema.number().description('最大禁言时长（分钟）').default(15).min(1),
    probabilityInitial: Schema.number().description('初始概率').default(0.2).min(0).max(1),
    probabilityMode: Schema.union([
      Schema.const(ProbMode.FIXED).description('固定'),
      Schema.const(ProbMode.INCREASING).description('递增')
    ]).description('概率模式').default(ProbMode.FIXED),
    clagMode: Schema.union([
      Schema.const(MuteMode.RANDOM_SUCCESS).description('概率反噬'),
      Schema.const(MuteMode.BOTH_MUTE).description('两败俱伤')
    ]).description('禁言模式').default(MuteMode.RANDOM_SUCCESS),
    sleepSetting: Schema.union([
      Schema.number().description('固定时长（小时）').default(8),
      Schema.string().description('截止时间(HH:MM)').default('08:00')
        .pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    ]).description('精致睡眠模式'),
    repeatMuteTarget: Schema.union([
      Schema.number().description('最后几人').default(1),
      Schema.string().description('随机多人').default('2')
    ]).description('复读禁言目标')
  }).description('功能配置'),
  Schema.object({
    showMessage: Schema.boolean().default(true).description('启用消息提示'),
    sleepMsg: Schema.array(Schema.string()).description('精致睡眠提示')
      .default([
        '晚安，做个好梦~',
        '休息一下吧，明天见！',
        '夜深了，该睡觉了哦~',
        '睡个好觉，明天元气满满！',
        '已开启精致睡眠，请勿打扰~'
      ]).role('table'),
    Message: Schema.array(Schema.object({
      Success: Schema.string().description('禁言成功'),
      Failure: Schema.string().description('禁言失败')
    })).description('禁言提示').default([
      {Success: '{at}被禁言{duration}', Failure: '禁言失败！作为惩罚，{at}被禁言{duration}'},
      {Success: '成功禁言{username}{duration}！', Failure: '{username}你太倒霉了，被禁言{duration}'},
      {Success: '{username}被禁言{duration}，安静一会吧~', Failure: '哎呀，失败了！你被禁言{duration}'},
      {Success: '{username}需要冷静一下，禁言{duration}', Failure: '反弹！{username}被禁言{duration}'},
      {Success: '送{username}一份{duration}的禁言套餐~', Failure: '失败了，但{username}仍被禁言{duration}'},
      {Success: '{username}获得了{duration}的沉默术', Failure: '禁言魔法反噬，{username}被禁言{duration}'},
      {Success: '恭喜{username}获得{duration}的发言冷却时间', Failure: '禁言失败，命运的齿轮转向了{username}，禁言{duration}'},
      {Success: '{username}的发言权被暂时没收{duration}', Failure: '天道好轮回，{username}被禁言{duration}'}
    ]).role('table')
  }).description('消息配置'),
])

/**
 * 插件应用函数
 * @param ctx Koishi上下文
 * @param config 插件配置
 */
export function apply(ctx: Context, config: Config) {
  if (config.enabled) registerSleep(ctx, config)
  if (config.clagEnabled) setupMute(ctx, config)
  if (config.listenMode !== ListenMode.OFF) setupMonitor(ctx, config)
}