# Sleep & Clag 插件

一个功能丰富的睡眠与禁言管理插件，包含精致睡眠和随机禁言功能。

## 功能介绍

### 精致睡眠

帮助用户在特定时间段进行自我禁言，培养良好作息习惯。

- 支持多种模式：固定时长、指定截止时间、随机时长
- 可设置允许使用的时间段
- 理想的晚间自律工具

### 随机禁言 (Clag)

为群聊增添乐趣的随机禁言功能，拥有多种创意玩法。

#### 基础功能

- 随机禁言：随机选择目标或随机反弹
- 自我禁言：禁言自己
- 指定禁言：禁言特定用户

#### 高级功能

1. **禁言轮盘**
   - 随机从参与者中选择一名"幸运儿"禁言
   - 命令: `clag.roulette [参与人数]`
   - 默认包含指令发起者和随机的其他成员

2. **连锁禁言**
   - 被禁言后获得"复仇权"，可以对其他人使用连锁禁言
   - 命令: `clag.chain @用户`
   - 连锁禁言威力比普通禁言更强

3. **特殊效果**
   - 暴击效果：随机触发，禁言时间翻倍
   - 免疫护盾：被禁言后小概率获得临时免疫权
   - 节日特效：特殊日期有独特的禁言效果和提示语

## 使用方法

sleep - 根据配置的模式进行睡眠禁言
clag [时长] - 随机禁言(自己或他人)
clag.me [时长] - 禁言自己
clag.user @用户 [时长] - 禁言指定用户
clag.roulette [人数] - 禁言轮盘(默认3人)
clag.chain @用户 - 使用复仇禁言

## 配置说明

### 睡眠设置

- `type`: 睡眠模式 (`static`/`until`/`random`)
- `duration`: 固定禁言时长（小时）
- `until`: 禁言截止时间(HH:MM)
- `min`/`max`: 随机模式的最短/最长时长（小时）

### Clag 设置

- `min`/`max`: 最小/最大禁言时长（分钟）
- `enableSpecialEffects`: 是否启用特殊效果
- `enableRoulette`: 是否启用禁言轮盘
- `enableChainReaction`: 是否启用连锁禁言
- `enableSeasonalEvents`: 是否启用节日特效
- `immunityProbability`: 获得免疫的概率
- `criticalHitProbability`: 暴击概率
- `rouletteSize`: 默认轮盘人数
- `chainReactionExpiry`: 连锁禁言权利有效期（小时）

### 通用设置

- `allowedTimeRange`: 允许睡眠的时间段(HH-HH)
- `maxAllowedDuration`: 最大普通禁言限制（分钟）
- `enableMessage`: 是否启用禁言提示
- `enableMuteOthers`: 是否允许禁言他人
- `probability`: 禁言成功概率
