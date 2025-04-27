# koishi-plugin-sleep

[![npm](https://img.shields.io/npm/v/koishi-plugin-sleep?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-sleep)

提供丰富的禁言娱乐功能：精致睡眠、禁言反噬、复读监控等多种模式

## 功能简介

- **精致睡眠**：在指定时间段内可自我禁言到指定时间或持续特定时长，适合睡觉打卡
- **禁言指令（clag）**：支持多种禁言模式
  - **概率反噬**：尝试禁言他人，但有概率反弹到自己身上
  - **两败俱伤**：同时禁言目标和自己
- **禁言轮盘（biu）**：概率自我禁言，支持固定概率或递增概率
- **消息监控**：自动监控聊天消息并进行禁言
  - **复读禁言**：监控复读行为并禁言参与者
  - **随机禁言**：随机概率禁言发言者

## 指令说明

- `sleep`：进入精致睡眠模式，禁言自己到设定的时间
- `clag <目标> [时长]`：尝试禁言目标用户，时长为可选的分钟数
- `clag.biu`：玩一次禁言轮盘，有一定概率被禁言
- `clag.me [时长]`：自我禁言指定或随机时长

## 配置项

### 开关配置

| 配置项 | 说明 | 默认值 |
|-------|------|-------|
| enabled | 启用精致睡眠功能 | true |
| clagEnabled | 启用禁言指令 | true |
| sleepTime | 精致睡眠可用时段 (HH-HH) | 20-8 |
| listenMode | 监听模式 (off/repeat/random) | off |
| listenTime | 监听开启时段 (HH-HH) | 22-6 |

### 功能配置

| 配置项 | 说明 | 默认值 |
|-------|------|-------|
| maxDuration | 最大禁言时长（分钟） | 15 |
| probabilityInitial | 初始禁言概率 | 0.2 |
| probabilityMode | 概率模式 (fixed/increasing) | fixed |
| clagMode | 禁言模式 (random_success/both_mute) | random_success |
| sleepSetting | 睡眠设置（小时数或HH:MM格式） | 8或08:00 |
| repeatMuteTarget | 复读禁言目标设置 | 1 |

### 消息配置

| 配置项 | 说明 | 默认值 |
|-------|------|-------|
| showMessage | 是否显示禁言消息 | true |
| sleepMsg | 精致睡眠消息模板 | 多个预设消息 |
| Message | 禁言成功/失败消息模板 | 多组预设消息 |

## 消息模板占位符

支持在消息模板中使用以下占位符：

- `{at}`: 目标用户的at标签
- `{username}`: 用户名
- `{duration}`: 禁言时长的友好显示
