# M2 当前状态索引 v0.42

截至 2026-07-30，作品发生—金额校准模型 v0.3 当前范围复现与已有渠道分配验证 v0.1
（M2 Occurrence-Amount Calibration v0.3 Current-Scope Replication and
Observed-Channel Allocation Validation v0.1，
`M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01`）已经完成首个完整、可解释结果并冻结。

本轮没有开发新模型，没有改变现行运行回退，没有创建活动候选，也没有授权自动化。

## 当前新增结论

| 能力 | 当前机器状态 | 中文解释 |
|---|---|---|
| OA03 技术复现 | `OA03_CURRENT_SCOPE_REPLICATION_COMPLETE` | canonical 公式在当前 actual、动态 Core80/Core90、Primary/Strict 和 3/6/12 月范围内完整执行 |
| OA03 作品总额 | `OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE` | Primary 的主要研究参考没有合法 3/6/12 月合同；Strict 三个周期均不支持 |
| OA03 原冻结重合 | `NOT_COMPARABLE_DIFFERENT_CONTRACT` | 公式相同，但 actual 与训练支持不同，不得要求预测相等 |
| trailing-12 已有成熟渠道分配 3 月 | `OA03_TRAILING12_CHANNEL_ALLOCATION_MIXED` | Primary 有局部点估计信号但区间跨 0，Strict 退化 |
| trailing-12 已有成熟渠道分配 6 月 | `OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_SUPPORTED` | Primary 和 Strict 都不支持 |
| trailing-12 已有成熟渠道分配 12 月 | `OA03_TRAILING12_CHANNEL_ALLOCATION_MIXED` | Primary 有局部信号但区间与 Strict 证据冲突 |
| 总结状态 | `M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_MIXED` | 技术完成，性能证据混合/不支持/不可评价并存 |

## Core80 主评价摘要

| 评价族 | 周期 | WAPE / signed bias | 对主要参考配对 FVA | 95% 区间 | 时间块改善占比 | 结论 |
|---|---:|---:|---:|---:|---:|---|
| Primary | 3 月 | 0.341898 / -0.089382 | 不可计算 | 不可计算 | 不可计算 | 主要参考不可重建 |
| Primary | 6 月 | 0.351915 / -0.060737 | 不可计算 | 不可计算 | 不可计算 | 主要参考不可重建 |
| Primary | 12 月 | 0.394571 / -0.014640 | 不可计算 | 不可计算 | 不可计算 | 主要参考不可重建 |
| Strict | 3 月 | 0.374801 / -0.151588 | -48.99% | [-91.96%, -8.73%] | 0% | 不支持 |
| Strict | 6 月 | 0.381191 / -0.119813 | -42.62% | [-82.55%, -1.31%] | 0% | 不支持 |
| Strict | 12 月 | 0.435475 / -0.066970 | -42.50% | [-88.42%, 6.59%] | 0% | 不支持 |

Primary 的次要人工规则比较在 12 月得到支持、3 月混合、6 月不支持，但次要参考不能
替代预注册的人工锚定可学习全局主要参考。

Core90 敏感性没有改变方向：Primary 仍不可评价，Strict 3/6/12 月对主要参考的配对
FVA 分别为 -44.81%、-40.22%、-40.29%，时间块改善占比均为 0。

## 渠道分配摘要

- 7,025 个作品分配全部成功，形成 36,484 条成熟渠道预测。
- 12 个 Core80/Core90 × Primary/Strict × 3/6/12 cell 的最大守恒差均为 0 分。
- 7,286 个渠道级合法弃权保持 null：未来首次渠道 5,543，起点未成熟渠道 1,743。
- Core80 Primary 的第一匿名主要渠道贡献约 66%–69% 绝对误差；
  Strict 约为 60%–63%，误差集中明显。
- 没有比较 trailing-3/6，没有按结果改窗口，没有等分或未来份额。

## 技术恢复与冻结

第一次 attempt 在完整结果形成前因公开摘要空值序列化失败，保留了允许技术恢复的
失败收据。修复没有改变模型公式、参数、特征、fold、窗口或评价门，并在新的
exact-head Linux/Windows CI 成功后执行恢复 attempt。第二次 attempt 形成首个完整
结果并冻结，之后没有再次运行。

## 数据与执行规模

- 5 项不可替代 source authority 全部存在；
- 本实验从权威来源重建 8 项派生缓存；
- 83,525 行基础物化与 OA03 拟合预测；
- 70,604 行已服务评价预测；
- 79,170 行作品/渠道 private 同案例评价；
- 48 行 bootstrap 摘要，每个可评价比较 2,000 次重采样；
- private 行、receipt、manifest 和 digest 均保持 Git ignored。

## 当前模型角色

- 现行运行回退：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动实验：无（`activeExperiment=null`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

技术复现成功没有把 `M2-WORK-OA03` 晋升为 production champion。作品总额、渠道
分配、组合预测、排序和风险区间继续作为不同能力报告。

## 当前证据

- `docs/analysis/m2-current/M2-oa03-current-scope-replication-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-oa03-current-scope-replication-development-v0.1.json`
- `docs/analysis/m2-current/M2-oa03-current-scope-replication-development-v0.1.md`
- `docs/analysis/m2-current/M2-oa03-trailing12-observed-channel-allocation-v0.1.json`
- `docs/analysis/m2-current/M2-oa03-trailing12-observed-channel-allocation-v0.1.md`
- `docs/analysis/m2-current/M2-oa03-current-scope-artifact-readiness-v0.1.md`

## Public / Private 与停止边界

- 公开仓库只包含代码、合同、测试、中文解释和达到隐私阈值的聚合。
- Core80 与 Core90、Primary 与 Strict、作品与渠道、不同 horizon 均分开报告。
- 原冻结 OA03 与当前 v2.2 actual 不在同一可比组。
- 没有打开 later/final holdout、provider、production、共享数据库、Canary/full160、
  release 或 M3 formal。
- 首个结果已经冻结，本索引不授权第二版、收入加权训练、新模型或 PR merge。

## 当前权威入口

- 用户首页：`README.md`
- 机器模型权威：`config/m2-model-registry.v1.json`
- 中文模型目录与成绩总账：
  `docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`
- 仓库长期规则：`AGENTS.md`
- M2 canonical core 局部规则：`src/domain/m2Current/AGENTS.md`
