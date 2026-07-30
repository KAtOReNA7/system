# M2 当前状态索引 v0.43

截至 2026-07-30，作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）的当前角色、技术复现
表述和登记表历史断言已经完成纠偏。

## 当前结论

**OA03 同公式在当前 Core 老品合同下重新执行完成；没有复现历史数值，因为 actual、
训练支持和人口合同不同。**

| 项目 | 当前状态 | 中文解释 |
|---|---|---|
| OA03 技术执行 | `OA03_CURRENT_SCOPE_REPLICATION_COMPLETE` | canonical 公式在当前合同下重新执行完成，不等于历史数值复现 |
| Primary 3/6/12 月 | `OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE` | 主要研究参考不可重建，因此不可评价，空值保持 `null` |
| Strict 3/6/12 月 | `OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED` | 三个周期均不支持 OA03 |
| Core90 敏感性 | `SAME_DIRECTION_NO_ROLE_CHANGE` | 没有改变“不支持／不可评价”的方向 |
| 总结状态 | `M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_MIXED` | `PERFORMANCE_MIXED` 只表示机器证据状态并存，不是业务整体通过 |

Primary/Core80 是 194 个正例、0 个非正例，ROC-AUC 不可定义。Core90 和 Strict
也接近全正例，PR-AUC 接近 1 主要受 prevalence 影响。OA03 没有原生保存条件正金额
预测；当前 Core 老品的主要问题是金额，而不是是否继续发生收入。

## 当前模型角色

- 兼容性现行运行回退：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 当前 Core 老品 3/6/12 月金额实验的主要研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动实验：无（`activeExperiment=null`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

OA03 不是当前开发冠军或当前范围最优模型。历史 champion 断言保留原文和来源，但在
Model Registry 中标记为历史且已由当前范围证据取代。现行运行路由没有改变，也没有
production 晋升。

## 冻结状态与权威

OA03 预注册配置中的 `P1_IMPLEMENTED_AWAITING_EXACT_HEAD_CI` 是不可变历史快照；
当前完成状态由私有结果 manifest、Model Registry 和本索引表达，不能回填冻结配置。

本索引取代 v0.42 作为当前阅读入口，但不改写 v0.42 的历史执行和成绩记录。

## 当前证据

- `docs/analysis/m2-current/M2-oa03-current-role-correction-v0.1.md`
- `docs/analysis/m2-current/M2-oa03-current-scope-replication-development-v0.1.json`
- `docs/analysis/m2-current/M2-oa03-current-scope-replication-development-v0.1.md`
- `docs/analysis/m2-current/M2-oa03-trailing12-observed-channel-allocation-v0.1.json`
- `docs/analysis/m2-current/M2-oa03-trailing12-observed-channel-allocation-v0.1.md`

## Public / Private 与授权边界

- 公开仓库只包含代码、合同、测试和脱敏聚合；没有 private 行级数据、身份、金额、
  缓存、收据、路径或凭据。
- 本索引不授权新模型执行、渠道分配、production、later/final holdout、
  Canary/full160、release、M3 formal 或 PR merge。
- 当前机器权威：`config/m2-model-registry.v1.json`。
- 中文阅读视图：`docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`。

