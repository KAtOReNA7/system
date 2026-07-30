# M2 LG01 头部现金残差校准实现就绪报告 v0.1

截至 2026-07-30，LG01 头部现金残差校准模型 v0.1
（LG01 Head-Cash Residual Calibration Model v0.1，`M2-WORK-HCRC01`）
已经完成执行检查点 K1（实现与合成验证，
`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/K1`），机器状态为
`M2_LG01_HEAD_CASH_RESIDUAL_IMPLEMENTED_SYNTHETIC_VERIFIED_OUTER_UNREAD`。
本状态只表示实现和公共 synthetic 门禁就绪；本轮 private outer outcome 仍未读取
（`OUTER_OUTCOME_UNREAD`），没有候选成绩、晋升或上线结论。

## 已实现

- 全局有界残差混合实验臂 C2
  （Global Bounded Residual Blend，
  `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`）：
  正 base 下限、q05/q95 双侧残差截断、仅用更早 inner origin 的
  `alpha ∈ {0.25, 0.50, 0.75, 1.00}` 字典序选择。
- 头部现金带保护的有界残差混合实验臂 C3
  （Head-Cash-Band Protected Bounded Residual Blend，
  `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`）：
  只按 forecast origin 可见 trailing-12 分成现金划分 H50/M30/L20，
  边界作品整体留在较高现金带；带级 alpha 按独立时间块、有效现金覆盖、
  现金 Kish ESS 与数值稳定性向全局 alpha 收缩，不使用 50/100 部作品门槛。
- 非有限 base/raw/scale/bound 不传播；原始候选记录失败原因，selected 只回退到
  冻结 LG01。原始候选（raw candidate）和回退后管线（selected pipeline）
  分别计算、分别报告，回退不得创造通过。
- 作品聚类 bootstrap 固定为完整作品 2,000 次；Strict Core80 为三个月主评价，
  Strict Core90 为敏感性；Primary 保持不可比较
  （`NOT_COMPARABLE`），不补造预测增值（forecast value added，FVA）。
- capability-scoped 输入缓存缺失时按
  `CACHE_MISS_REBUILDABLE` 自动重建。冻结 LG01 与冻结 CHAM01 B3 三个月行将从
  权威源和冻结代码确定性重建，并在任何新 outer outcome 形成前逐格核对既有冻结
  公开聚合；核对失败会 fail closed，不会产生候选结果。

## Synthetic 验证

公共 synthetic smoke 使用 540 条合成输入，覆盖两类 rolling family、
Core80/Core90、九个 origin 和四个固定实验臂；产生 2,160 条预测与 18 条
outer selection。验证结果：

| 验证项 | 状态 |
|---|---|
| 有界残差与 q05/q95 | 通过 |
| 非有限值回退且 raw 失败仍可见 | 通过 |
| forecast-origin 未来泄漏检查 | 通过 |
| H50/M30/L20 现金带与边界作品 | 通过 |
| 小型人口不依赖 50/100 部作品阈值 | 通过 |
| inner/outer 隔离 | 通过 |
| 输入顺序反转后的预测确定性 | 通过 |
| raw 与 selected 分离 | 通过 |
| 缺失派生缓存自动重建并再次命中 | 通过 |
| 公开 payload 防作品身份、本机路径和 private 路径泄漏 | 通过 |

可复现 synthetic 结果摘要 digest 为
`caecc0925b11cab0bd16534dca01398a10af8c250f552bb018604398ecc992fe`。
该 digest 只绑定公开合成验证输出，不是私有文件 digest，也不构成跨电脑硬门禁。

## 执行边界

不可替代私有权威源在 K0 能力盘点中可用；历史冻结行缓存缺失是可重建缓存缺失
（`CACHE_MISS_REBUILDABLE`），历史收据缺失只是可选溯源告警
（`OPTIONAL_PROVENANCE_MISSING`）。本检查点没有调用私有重建入口，没有读取任何
outer outcome，也没有执行授权的一次 private development evaluation。

只有本检查点的普通 commit、push 与 exact-head Linux/Windows CI 全部成功后，
才允许执行一次私有开发评价。当前仍为：

- `activeCandidate=null`
- `approvedForAutomation=null`
- production 未改变
- 6、12、36 个月新候选、新作品、未来首次渠道、渠道分配、taxonomy、provider、
  数据库、later-origin、final holdout、Canary/full160、release、M3 formal 和
  PR 合并均未执行。
