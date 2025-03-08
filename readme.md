# koishi-plugin-sleep

[![npm](https://img.shields.io/npm/v/koishi-plugin-sleep?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-sleep)

精致睡眠与禁言插件

## 功能特点

- 精致睡眠计划管理 (支持固定时长、指定时间和随机时长)
- 禁言功能 (支持自己和他人)
- 灵活的配置选项
- 国际化支持

## 命令

### 睡眠命令

- `sleep` (别名: `jzsm`、`精致睡眠`) - 执行睡眠

### 禁言命令

- `mute [时长]` - 随机选择目标禁言
- `mute.me [时长]` - 禁言自己
- `mute.user <目标> [时长]` - 禁言指定目标

## 配置项

```yaml
sleep:
  # 睡眠模式: static(固定时长) | until(指定时间) | random(随机时长)
  type: static

  # 固定时长模式配置
  duration: 8  # 睡眠时长(小时)

  # 指定时间模式配置
  until: "08:00"  # 睡眠结束时间

  # 随机时长模式配置
  min: 6  # 最短睡眠时间(小时)
  max: 10  # 最长睡眠时间(小时)

mute:
  # 禁言模式: static(固定时长) | random(随机时长)
  type: static

  # 固定时长模式配置
  duration: 5  # 禁言时长(分钟)

  # 随机时长模式配置
  min: 0.1  # 最短禁言时间(分钟)
  max: 10   # 最长禁言时间(分钟)

# 允许的时间范围 (格式: "开始时间-结束时间", 24小时制)
allowedTimeRange: "20-8"

# 最大允许禁言时长(分钟)
maxAllowedDuration: 1440

# 是否启用提示消息
enableMessage: false

# 是否允许禁言他人
enableMuteOthers: true

# 禁言反弹概率 (0-1)
probability: 0.5
```
