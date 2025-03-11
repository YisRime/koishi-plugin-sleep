/**
 * 消息模板
 * 包含各种场景的随机提示消息
 */
export const templates = {
  /**
   * 禁言相关消息
   */
  mute: {
    // 禁言成功的消息
    success: [
      '{target}已被禁言{minutes}分钟{seconds}秒',
      '已将{target}禁言{minutes}分钟{seconds}秒',
      '{target}被禁声{minutes}分钟{seconds}秒，安静是一种美德',
      '{target}将会安静{minutes}分钟{seconds}秒',
      '嘘！{target}已进入{minutes}分钟{seconds}秒的沉默模式'
    ],

    // 自我禁言的消息
    self: [
      '已将你禁言{minutes}分钟{seconds}秒',
      '你选择了沉默，禁言时间为{minutes}分钟{seconds}秒',
      '你将安静{minutes}分钟{seconds}秒',
      '你已被禁言{minutes}分钟{seconds}秒，好好反省吧',
      '禁言{minutes}分钟{seconds}秒，享受片刻宁静'
    ],

    // 禁言失败/反弹的消息
    backfire: [
      '哎呀！{user}的禁言魔法反弹了！将被禁言{minutes}分钟{seconds}秒',
      '魔法失控！{user}自食其果！禁言{minutes}分钟{seconds}秒',
      '禁言反噬！{user}尝到了自己的魔法！持续{minutes}分钟{seconds}秒',
      '反弹！{user}成了禁言的受害者！禁声{minutes}分钟{seconds}秒',
      '机会女神眷顾了{target}，{user}自己被禁言{minutes}分钟{seconds}秒！'
    ]
  },

  /**
   * 特殊效果相关消息
   */
  effects: {
    // 暴击效果的消息
    critical: [
      '暴击！{target}被禁言{minutes}分钟{seconds}秒，时间翻倍！',
      '致命一击！{target}遭受双倍禁言，持续{minutes}分钟{seconds}秒！',
      '命中要害！{target}被禁言{minutes}分钟{seconds}秒！',
      'Critical Hit! {target}被禁言{minutes}分钟{seconds}秒！',
      '禁言暴击！{target}运气不佳，禁言{minutes}分钟{seconds}秒！'
    ],

    // 随机目标选择的消息
    randomTarget: [
      '命运之轮转动，{target}成为了被选中的幸运儿！',
      '禁言魔法随机发动，{target}中招了！',
      '禁言之箭射向了随机目标，{target}中箭了！',
      '感谢{target}自愿成为今天的沉默代表',
      '恭喜{target}获得特别禁言体验'
    ],

    // 成功施放禁言
    success: [
      '{user}成功使{target}禁言{minutes}分钟{seconds}秒！',
      '{user}的禁言咒语生效了！{target}将安静{minutes}分钟{seconds}秒',
      '{user}的魔法禁言生效了！{target}禁声{minutes}分钟{seconds}秒',
      '{user}使用了禁言卷轴，{target}被禁言{minutes}分钟{seconds}秒！',
      '在{user}的指挥下，{target}被禁言{minutes}分钟{seconds}秒！'
    ],

    // 自我惩罚消息
    selfPunish: [
      '自食其果！禁言{minutes}分钟{seconds}秒',
      '这是一次勇敢的自我约束，持续{minutes}分钟{seconds}秒',
      '自我禁言{minutes}分钟{seconds}秒，修行开始！',
      '这是自律的表现，禁言{minutes}分钟{seconds}秒',
      '自我禁言{minutes}分钟{seconds}秒，静心思过'
    ]
  },

  /**
   * 禁言轮盘相关消息
   */
  roulette: {
    // 轮盘结果的消息
    result: [
      "砰！命运的子弹已经发射！",
      "轮盘转动，命运已定！",
      "禁言之轮已经旋转完毕！",
      "命运女神已经做出选择！",
      "禁言弹无情地射出！"
    ],

    // 轮盘禁言消息
    mute: [
      "🎯 {target} 中弹了！被禁言{minutes}分钟{seconds}秒",
      "砰！{target} 成为了禁言轮盘的牺牲品，禁言{minutes}分钟{seconds}秒",
      "{target} 运气不佳，获得{minutes}分钟{seconds}秒的沉默时间",
      "命运选中了{target}，禁言{minutes}分钟{seconds}秒",
      "轮盘之神带走了{target}的发言权，持续{minutes}分钟{seconds}秒"
    ],

    // 轮盘幸存消息
    survived: [
      "好险！子弹擦肩而过！",
      "命运眷顾了你，逃过一劫！",
      "今天运气不错，逃过禁言！",
      "恭喜你活下来了！",
      "禁言之神放过了你！"
    ]
  },

  /**
   * 神秘口球魔法相关消息
   */
  magicMute: {
    // 触发口球魔法时的消息
    triggered: [
      "🎲 恭喜{target}！触发了神秘口球魔法！本次概率: {probability}%，禁言{minutes}分钟{seconds}秒",
      "✨ {target}中奖啦！口球魔法发动，当前概率: {probability}%，禁言{minutes}分钟{seconds}秒",
      "🎯 口球魔法选中了{target}！(概率: {probability}%)，禁言{minutes}分钟{seconds}秒",
      "🔮 深夜口球魔法降临，{target}成为幸运儿！概率: {probability}%，禁言{minutes}分钟{seconds}秒",
      "👻 夜间口球魔法发动，{target}中奖！当前概率: {probability}%，禁言{minutes}分钟{seconds}秒"
    ]
  }
}
