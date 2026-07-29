# M2 核心老品已有渠道份额分配验证报告 v0.1

## 结论

本报告属于实验“M2 核心老品全周期同案例证据补齐、按周期模型路由与已有渠道分配验证 v0.1”
（M2 Core Legacy Full-Horizon Same-Case Evidence Completion, Horizon Router and Observed-Channel Allocation Validation v0.1，`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01`）的
已有渠道份额分配阶段（`K3_OBSERVED_CHANNEL_ALLOCATION_COMPLETE`）。渠道分配总判定为
渠道分配证据混合
（`CHANNEL_ALLOCATION_MIXED`）。任务、同案例证据、按周期路由器和渠道分配
是四种不同对象；本报告不会把任一开发证据解释为现行回退、活动候选、自动化批准或
生产授权。

首次有效同案例私有评价身份（`evaluationHead`）为
`f30fbc0660d90197bd44e516a0c07439fe08219b`；按周期路由器执行身份（`routerExecutionHead`）为
`fdb82d56560a0c7736acaa3605f45cb1f74e62cb`；本次渠道分配执行身份
（`allocationExecutionHead`）为 `e3dc070dc7945ce5ffbba3676f2107061d533d6c`，对应
Linux/Windows 精确提交 CI `30465820862`。最终文档身份
（`finalDocumentationHead`）将在包含本报告、注册表、中文目录与新状态索引的
最终远端提交通过双平台 CI 后单独报告。

## 冻结分配合同

- 只在预测起点已经成熟、已观察的 canonical 渠道间分配；不得新增渠道，也不得读取
  未来渠道收入。
- 作品总额来源分别保留作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）、人工锚定可学习
  全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）、核心收入人工
  规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，
  `M2-WORK-CRMR01`）和按预测周期滚动模型路由器 v0.1
  （Rolling Horizon Model Router v0.1，`M2-WORK-HR01`）。
- 固定保留已有直接渠道模型（`C0_DIRECT`）、最近 3/6/12 个完整账单月非负收入
  份额（`C1_TRAILING_3`、`C2_TRAILING_6`、`C3_TRAILING_12`）和
  人工锚定可学习全局模型隐含份额（`C4_LG01_IMPLIED`）的全部原始结果。
- 份额分母为零时，仅可回退到最近 12 个月内最后一个非零月份；仍无合法份额时
  弃权（`ABSTAIN_CHANNEL_ALLOCATION`），禁止平均分配。
- 没有根据外层结果选择 3/6/12 个月窗口。主确认合同要求 Core80、主滚动评价
  （Primary rolling，`PRIMARY_ROLLING`）、作品发生—金额校准模型 v0.3
  总额来源下的三个固定历史窗口同时通过预注册门禁。

## 各预测周期的主确认判定

| horizon（月） | 判定 | 三个固定历史窗口 |
| ---: | --- | --- |
| 3 | 渠道分配证据混合 (`CHANNEL_ALLOCATION_MIXED`) | 最近 3 个完整账单月渠道份额：WAPE `0.294286` / bias `-3.65%` / 相对直接渠道模型改善 `0.78%`；最近 6 个完整账单月渠道份额：WAPE `0.296735` / bias `-3.65%` / 相对直接渠道模型改善 `-0.05%`；最近 12 个完整账单月渠道份额：WAPE `0.294089` / bias `-3.65%` / 相对直接渠道模型改善 `0.84%` |
| 6 | 渠道分配未确认 (`CHANNEL_ALLOCATION_NOT_CONFIRMED`) | 最近 3 个完整账单月渠道份额：WAPE `0.317783` / bias `0.08%` / 相对直接渠道模型改善 `-7.81%`；最近 6 个完整账单月渠道份额：WAPE `0.316020` / bias `0.08%` / 相对直接渠道模型改善 `-7.22%`；最近 12 个完整账单月渠道份额：WAPE `0.315692` / bias `0.08%` / 相对直接渠道模型改善 `-7.10%` |
| 12 | 渠道分配证据混合 (`CHANNEL_ALLOCATION_MIXED`) | 最近 3 个完整账单月渠道份额：WAPE `0.294126` / bias `0.83%` / 相对直接渠道模型改善 `30.92%`；最近 6 个完整账单月渠道份额：WAPE `0.286287` / bias `0.83%` / 相对直接渠道模型改善 `32.76%`；最近 12 个完整账单月渠道份额：WAPE `0.286101` / bias `0.83%` / 相对直接渠道模型改善 `32.81%` |
| 36 | 渠道分配不可评价 (`CHANNEL_ALLOCATION_NOT_EVALUABLE`) | 最近 3 个完整账单月渠道份额：WAPE `NA` / bias `NA` / 相对直接渠道模型改善 `NA`；最近 6 个完整账单月渠道份额：WAPE `NA` / bias `NA` / 相对直接渠道模型改善 `NA`；最近 12 个完整账单月渠道份额：WAPE `NA` / bias `NA` / 相对直接渠道模型改善 `NA` |

36 个月仍完整报告，但作品发生—金额校准模型 v0.3 不支持该周期，因此不用于主确认
合同，也不会用其他周期参数补造。

## Core80 主滚动评价的作品总额来源结果

| horizon（月） | 分配臂 | 状态 | 作品数 | 渠道行数 | 总额 WAPE | 总额 bias | 渠道 WAPE | 渠道 bias | 份额 MAE | 主渠道识别率 | 排序准确率 | 最大守恒差（分） | 判定 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 3 | 已有直接渠道模型 (`C0_DIRECT`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 3 | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | `COMPUTED` | 65 | 192 | 0.262460 | -3.65% | 0.294286 | -3.65% | 0.053233 | 92.31% | 85.82% | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 3 | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | `COMPUTED` | 65 | 192 | 0.262460 | -3.65% | 0.296735 | -3.65% | 0.055104 | 93.85% | 86.07% | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 3 | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | `COMPUTED` | 65 | 192 | 0.262460 | -3.65% | 0.294089 | -3.65% | 0.055977 | 92.31% | 82.09% | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 3 | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 6 | 已有直接渠道模型 (`C0_DIRECT`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 6 | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | `COMPUTED` | 65 | 192 | 0.283949 | 0.08% | 0.317783 | 0.08% | 0.055933 | 90.77% | 86.07% | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 6 | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | `COMPUTED` | 65 | 192 | 0.283949 | 0.08% | 0.316020 | 0.08% | 0.052583 | 95.38% | 87.31% | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 6 | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | `COMPUTED` | 65 | 192 | 0.283949 | 0.08% | 0.315692 | 0.08% | 0.055370 | 90.77% | 82.59% | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 6 | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 12 | 已有直接渠道模型 (`C0_DIRECT`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 12 | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | `COMPUTED` | 47 | 141 | 0.248919 | 0.83% | 0.294126 | 0.83% | 0.055756 | 91.49% | 86.75% | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 12 | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | `COMPUTED` | 47 | 141 | 0.248919 | 0.83% | 0.286287 | 0.83% | 0.049809 | 95.74% | 88.08% | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 12 | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | `COMPUTED` | 47 | 141 | 0.248919 | 0.83% | 0.286101 | 0.83% | 0.052586 | 89.36% | 82.12% | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 12 | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 36 | 已有直接渠道模型 (`C0_DIRECT`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 36 | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 36 | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 36 | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 36 | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | `NOT_EVALUABLE` | 0 | 0 | NA | NA | NA | NA | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |

所有已分配尝试在分配前后的作品总额预测与评价指标完全不变；最大作品总额点预测差为
`0`。渠道预测按货币最小单位
分配，最大金额守恒差为
`0` 分。弃权尝试没有生成
渠道预测，因此不把“未分配总额”误记为渠道金额守恒差。

## 全部原始评价单元

| 评价族 | 人口 | horizon（月） | 作品总额来源 | 分配臂 | 作品数 | 渠道行数 | 渠道 WAPE | 渠道 bias | 份额 MAE | 最大守恒差（分） | 判定 |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 65 | 192 | 0.294286 | -3.65% | 0.053233 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 65 | 192 | 0.296735 | -3.65% | 0.055104 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 65 | 192 | 0.294089 | -3.65% | 0.055977 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 65 | 192 | 0.296593 | 24.65% | 0.056519 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 65 | 192 | 0.295266 | 24.65% | 0.053233 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 65 | 192 | 0.299043 | 24.65% | 0.055104 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 65 | 192 | 0.292804 | 24.65% | 0.055977 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 65 | 192 | 0.294286 | -3.65% | 0.053233 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 65 | 192 | 0.296735 | -3.65% | 0.055104 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 65 | 192 | 0.294089 | -3.65% | 0.055977 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 65 | 192 | 0.317783 | 0.08% | 0.055933 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 65 | 192 | 0.316020 | 0.08% | 0.052583 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 65 | 192 | 0.315692 | 0.08% | 0.055370 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 65 | 192 | 0.294751 | 11.39% | 0.052583 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 65 | 192 | 0.292805 | 11.39% | 0.055933 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 65 | 192 | 0.294751 | 11.39% | 0.052583 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 65 | 192 | 0.297896 | 11.39% | 0.055370 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 65 | 192 | 0.305215 | 4.85% | 0.055933 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 65 | 192 | 0.303216 | 4.85% | 0.052583 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 65 | 192 | 0.303643 | 4.85% | 0.055370 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 47 | 141 | 0.294126 | 0.83% | 0.055756 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 47 | 141 | 0.286287 | 0.83% | 0.049809 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 47 | 141 | 0.286101 | 0.83% | 0.052586 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 47 | 141 | 0.425795 | 30.97% | 0.061843 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 47 | 141 | 0.432588 | 30.97% | 0.055756 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 47 | 141 | 0.428194 | 30.97% | 0.049809 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 47 | 141 | 0.419337 | 30.97% | 0.052586 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 47 | 141 | 0.294126 | 0.83% | 0.055756 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 47 | 141 | 0.286287 | 0.83% | 0.049809 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 47 | 141 | 0.286101 | 0.83% | 0.052586 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 408 | 1357 | 0.337945 | 7.56% | 0.048102 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 408 | 1357 | 0.311365 | 7.56% | 0.037288 | 0 | `CHANNEL_ALLOCATION_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 408 | 1357 | 0.321629 | 7.56% | 0.041023 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 408 | 1357 | 0.333934 | 7.56% | 0.046263 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 408 | 1357 | 0.337945 | 7.56% | 0.048102 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 488 | 1985 | 20.194858 | 2012.26% | 0.043878 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 488 | 1985 | 20.174519 | 2012.26% | 0.030842 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 488 | 1985 | 20.183893 | 2012.26% | 0.034375 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 488 | 1985 | 20.198549 | 2012.26% | 0.040402 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 408 | 1357 | 18.696213 | 1861.46% | 0.048102 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 408 | 1357 | 0.311365 | 7.56% | 0.037288 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 408 | 1357 | 0.321629 | 7.56% | 0.041023 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 408 | 1357 | 0.333934 | 7.56% | 0.046263 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 408 | 1357 | 0.337945 | 7.56% | 0.048102 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 158 | 427 | 0.323540 | -1.58% | 0.042712 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 158 | 427 | 0.326918 | -1.58% | 0.046931 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 158 | 427 | 0.325295 | -1.58% | 0.052395 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 158 | 427 | 0.311030 | 24.79% | 0.043085 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 158 | 427 | 0.310847 | 24.79% | 0.042712 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 158 | 427 | 0.314578 | 24.79% | 0.046931 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 158 | 427 | 0.310538 | 24.79% | 0.052395 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 158 | 427 | 0.323540 | -1.58% | 0.042712 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 158 | 427 | 0.326918 | -1.58% | 0.046931 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 158 | 427 | 0.325295 | -1.58% | 0.052395 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 158 | 427 | 0.350281 | 1.88% | 0.046030 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 158 | 427 | 0.349275 | 1.88% | 0.047252 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 158 | 427 | 0.350238 | 1.88% | 0.055484 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 158 | 427 | 0.326520 | 13.15% | 0.049599 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 158 | 427 | 0.323748 | 13.15% | 0.046030 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 158 | 427 | 0.326520 | 13.15% | 0.047252 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 158 | 427 | 0.331055 | 13.15% | 0.055484 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 158 | 427 | 0.336839 | 6.18% | 0.046030 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 158 | 427 | 0.335642 | 6.18% | 0.047252 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 158 | 427 | 0.337386 | 6.18% | 0.055484 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 115 | 319 | 0.345981 | 3.04% | 0.049370 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 115 | 319 | 0.339756 | 3.04% | 0.048957 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 115 | 319 | 0.341667 | 3.04% | 0.058537 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 115 | 319 | 0.452419 | 30.72% | 0.055173 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 115 | 319 | 0.457675 | 30.72% | 0.049370 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 115 | 319 | 0.453962 | 30.72% | 0.048957 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 115 | 319 | 0.448669 | 30.72% | 0.058537 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 115 | 319 | 0.345981 | 3.04% | 0.049370 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 115 | 319 | 0.339756 | 3.04% | 0.048957 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 115 | 319 | 0.341667 | 3.04% | 0.058537 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 927 | 2690 | 0.385743 | 7.75% | 0.057274 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 927 | 2690 | 0.358569 | 7.75% | 0.040581 | 0 | `CHANNEL_ALLOCATION_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 927 | 2690 | 0.367878 | 7.75% | 0.042210 | 0 | `CHANNEL_ALLOCATION_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 927 | 2690 | 0.379252 | 7.75% | 0.047059 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 927 | 2690 | 0.385743 | 7.75% | 0.057274 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 1030 | 3470 | 12.495123 | 1236.31% | 0.051738 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 1030 | 3470 | 12.473465 | 1236.31% | 0.035778 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 1030 | 3470 | 12.483174 | 1236.31% | 0.037626 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 1030 | 3470 | 12.495792 | 1236.31% | 0.043358 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 927 | 2690 | 10.611078 | 1046.53% | 0.057274 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 927 | 2690 | 0.358569 | 7.75% | 0.040581 | 0 | `CHANNEL_ALLOCATION_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 927 | 2690 | 0.367878 | 7.75% | 0.042210 | 0 | `CHANNEL_ALLOCATION_CONFIRMED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 927 | 2690 | 0.379252 | 7.75% | 0.047059 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 主滚动评价 (`PRIMARY_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 927 | 2690 | 0.385743 | 7.75% | 0.057274 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 36 | 130 | 0.310925 | -12.14% | 0.036764 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 36 | 130 | 0.310705 | -12.14% | 0.028098 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 36 | 130 | 0.314420 | -12.14% | 0.036242 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 36 | 130 | 0.320692 | -12.14% | 0.041411 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.310925 | -12.14% | 0.036764 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 41 | 177 | 0.682149 | 53.71% | 0.033947 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 41 | 177 | 0.685855 | 53.71% | 0.023597 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 41 | 177 | 0.691533 | 53.71% | 0.029796 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 41 | 177 | 0.708875 | 53.71% | 0.032581 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.732995 | 57.19% | 0.036764 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 36 | 130 | 0.310705 | -12.14% | 0.028098 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 36 | 130 | 0.314420 | -12.14% | 0.036242 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 36 | 130 | 0.320692 | -12.14% | 0.041411 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.310925 | -12.14% | 0.036764 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 36 | 130 | 0.352599 | -11.36% | 0.037785 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 36 | 130 | 0.351372 | -11.36% | 0.028945 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 36 | 130 | 0.354250 | -11.36% | 0.036090 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 36 | 130 | 0.361123 | -11.36% | 0.043031 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.352599 | -11.36% | 0.037785 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 41 | 177 | 0.327723 | 14.35% | 0.029522 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 41 | 177 | 0.317589 | 14.35% | 0.024064 | 0 | `CHANNEL_ALLOCATION_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 41 | 177 | 0.327723 | 14.35% | 0.029522 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 41 | 177 | 0.343765 | 14.35% | 0.033651 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.342747 | 15.53% | 0.037785 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 36 | 130 | 0.351372 | -11.36% | 0.028945 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 36 | 130 | 0.354250 | -11.36% | 0.036090 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 36 | 130 | 0.361123 | -11.36% | 0.043031 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.352599 | -11.36% | 0.037785 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 36 | 130 | 0.329332 | -6.47% | 0.042195 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 36 | 130 | 0.328980 | -6.47% | 0.033653 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 36 | 130 | 0.332394 | -6.47% | 0.040124 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 36 | 130 | 0.334954 | -6.47% | 0.046297 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.329332 | -6.47% | 0.042195 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 41 | 177 | 0.812874 | 61.50% | 0.034411 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 41 | 177 | 0.813391 | 61.50% | 0.027651 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 41 | 177 | 0.819522 | 61.50% | 0.032613 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 41 | 177 | 0.824851 | 61.50% | 0.036056 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.850637 | 65.39% | 0.042195 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 36 | 130 | 0.328980 | -6.47% | 0.033653 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 36 | 130 | 0.332394 | -6.47% | 0.040124 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 36 | 130 | 0.334954 | -6.47% | 0.046297 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 36 | 130 | 0.329332 | -6.47% | 0.042195 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE80 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 75 | 236 | 0.368407 | -17.23% | 0.045923 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 75 | 236 | 0.368038 | -17.23% | 0.036450 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 75 | 236 | 0.371686 | -17.23% | 0.042081 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 75 | 236 | 0.378083 | -17.23% | 0.048901 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.368407 | -17.23% | 0.045923 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 82 | 300 | 0.679587 | 39.80% | 0.042512 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 82 | 300 | 0.682090 | 39.80% | 0.031065 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 82 | 300 | 0.687488 | 39.80% | 0.035938 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 82 | 300 | 0.703381 | 39.80% | 0.040195 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.724142 | 42.33% | 0.045923 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 75 | 236 | 0.368038 | -17.23% | 0.036450 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 75 | 236 | 0.371686 | -17.23% | 0.042081 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 75 | 236 | 0.378083 | -17.23% | 0.048901 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 3 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.368407 | -17.23% | 0.045923 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 75 | 236 | 0.381268 | -13.77% | 0.044192 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 75 | 236 | 0.380569 | -13.77% | 0.035038 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 75 | 236 | 0.384038 | -13.77% | 0.041815 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 75 | 236 | 0.390783 | -13.77% | 0.048858 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.381268 | -13.77% | 0.044192 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 82 | 300 | 0.374529 | 13.13% | 0.035390 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 82 | 300 | 0.361957 | 13.13% | 0.029603 | 0 | `CHANNEL_ALLOCATION_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 82 | 300 | 0.374529 | 13.13% | 0.035390 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 82 | 300 | 0.387603 | 13.13% | 0.040426 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.385446 | 13.69% | 0.044192 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 75 | 236 | 0.380569 | -13.77% | 0.035038 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 75 | 236 | 0.384038 | -13.77% | 0.041815 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 75 | 236 | 0.390783 | -13.77% | 0.048858 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 6 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.381268 | -13.77% | 0.044192 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 75 | 236 | 0.358941 | -7.47% | 0.050130 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 75 | 236 | 0.357952 | -7.47% | 0.039894 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 75 | 236 | 0.360664 | -7.47% | 0.044378 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 75 | 236 | 0.364147 | -7.47% | 0.052195 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.358941 | -7.47% | 0.050130 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 82 | 300 | 0.798540 | 53.93% | 0.043760 | 0 | `DIRECT_CHANNEL_REFERENCE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 82 | 300 | 0.795914 | 53.93% | 0.034263 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 82 | 300 | 0.800322 | 53.93% | 0.038035 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 82 | 300 | 0.807405 | 53.93% | 0.043782 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.831767 | 57.23% | 0.050130 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 75 | 236 | 0.357952 | -7.47% | 0.039894 | 0 | `CHANNEL_ALLOCATION_MIXED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 75 | 236 | 0.360664 | -7.47% | 0.044378 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 75 | 236 | 0.364147 | -7.47% | 0.052195 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 12 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 75 | 236 | 0.358941 | -7.47% | 0.050130 | 0 | `CHANNEL_ALLOCATION_NOT_CONFIRMED` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 已有直接渠道模型 (`C0_DIRECT`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 3 个完整账单月渠道份额 (`C1_TRAILING_3`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 6 个完整账单月渠道份额 (`C2_TRAILING_6`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 最近 12 个完整账单月渠道份额 (`C3_TRAILING_12`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |
| 严格滚动评价 (`STRICT_ROLLING`) | CORE90 | 36 | 按预测周期滚动模型路由器 v0.1（Rolling Horizon Model Router v0.1，`M2-WORK-HR01`） | 人工锚定可学习全局模型隐含渠道份额 (`C4_LG01_IMPLIED`) | 0 | 0 | NA | NA | NA | NA | `CHANNEL_ALLOCATION_NOT_EVALUABLE` |

完整机器结果还逐单元保留渠道层假阳性与漏报误差、主渠道识别率、成对排序准确率、
按作品分配误差、2,000 次作品聚类配对 bootstrap、匿名渠道桶、独立时间块胜负、
直接渠道比较模型、弃权数和零分母回退次数。公开文件不包含作品 ID、渠道 ID、
case key、origin 或任何 private 路径。

## 治理边界

现行运行回退仍为作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`），研究比较基线仍为
人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）。
活动候选（`activeCandidate`）和自动化批准
（`approvedForAutomation`）均为空。本阶段没有训练、调参、结果后选窗、修改
fallback、读取 later-origin/final holdout、写数据库或 production。
