# koishi-plugin-sleep

[![npm](https://img.shields.io/npm/v/koishi-plugin-sleep?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-sleep)

提供丰富的禁言娱乐功能：包括精致睡眠、禁言轮盘、禁言反弹等等

## 功能简介

- **精致睡眠**：指定时间段内可用，自动禁言自己一段时间，适合睡觉打卡。
- **禁言指令（clag）**：尝试禁言他人，有概率反弹禁言自己，支持多种模式。
- **禁言轮盘（biu）**：类似俄罗斯轮盘，有概率禁言自己，支持概率递增。
- **自定义消息**：支持自定义禁言成功、失败等提示消息。

## 指令说明

- `clag <目标> [时长]`：尝试禁言目标用户，时长单位为分钟（可选）。
- `clag.biu`：禁言轮盘，随机决定是否禁言自己。
- `sleep`：进入精致睡眠模式，自动禁言自己。

## 配置项

| 配置项             | 说明                         | 默认值/示例           |
|--------------------|------------------------------|-----------------------|
| enabled            | 启用精致睡眠                 | false                 |
| sleepMode          | 睡眠模式（static/until）      | static                |
| sleepTimeRange     | 允许睡眠的时间段（HH-HH）     | 20-8                  |
| sleepDuration      | 固定睡眠时长（小时）          | 8                     |
| sleepUntil         | 睡眠截止时间（HH:MM）         | 08:00                 |
| clagEnabled        | 启用禁言指令                  | false                 |
| clagMode           | 禁言模式（random_success/both_mute） | random_success |
| clagProbability    | 禁言成功基础概率              | 0.5                   |
| clagMaxDuration    | 最大禁言时长（分钟）          | 15                    |
| biuEnabled         | 启用禁言轮盘                  | false                 |
| biuMode            | 轮盘模式（fixed/increasing）  | fixed                 |
| biuProbability     | 轮盘初始禁言概率              | 0.2                   |
| biuMaxDuration     | 轮盘最大禁言时长（分钟）      | 15                    |
| sleepSuccessMsg    | 精致睡眠提示消息              | 见源码                |
| clagSuccessMsg     | 禁言成功提示消息              | 见源码                |
| clagFailureMsg     | 禁言失败提示消息              | 见源码                |
| clagSelfMuteMsg    | 禁言自我提示消息              | 见源码                |
| biuSuccessMsg      | 轮盘逃过提示消息              | 见源码                |
| biuFailureMsg      | 轮盘失败提示消息              | 见源码                |

## 消息模板占位符

- `{at}`：目标用户的 at 元素
- `{username}`：用户名
- `{duration}`：禁言时长
- `{selfDuration}`：自身禁言时长（仅部分模式）
