# M2 核心老品按预测周期滚动模型路由报告 v0.1

## 结论

本报告属于实验“M2 核心老品全周期同案例证据补齐、按周期模型路由与已有渠道分配验证 v0.1”
（M2 Core Legacy Full-Horizon Same-Case Evidence Completion, Horizon Router and Observed-Channel Allocation Validation v0.1，`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01`）的
按预测周期滚动模型路由阶段（`K2_ROLLING_HORIZON_ROUTER_COMPLETE`）。路由器整体判定为
`HORIZON_ROUTER_NOT_CONFIRMED`；这是开发候选证据，不是现行运行回退、活动候选、
自动化批准或 production 授权。

首次有效私有评价身份（`evaluationHead`）为 `f30fbc0660d90197bd44e516a0c07439fe08219b`。
路由器首次有效执行身份（`routerExecutionHead`）为
`fdb82d56560a0c7736acaa3605f45cb1f74e62cb`，对应 Linux/Windows exact-head CI
`30463531260`。最终文档身份（`finalDocumentationHead`）仍为空。

## 各 horizon 的 Core80 作品总额判定

| horizon（月） | 主滚动评价（Primary rolling） | 严格滚动评价（Strict rolling） |
| ---: | --- | --- |
| 3 | 路由器 WAPE `0.262460`，bias `-3.65%`，相对最强单模型 FVA `0.00%`（`HORIZON_ROUTER_NOT_CONFIRMED`） | 路由器 WAPE `0.292427`，bias `-12.14%`，相对最强单模型 FVA `0.00%`（`HORIZON_ROUTER_NOT_CONFIRMED`） |
| 6 | 路由器 WAPE `0.271841`，bias `4.85%`，相对最强单模型 FVA `-2.53%`（`HORIZON_ROUTER_NOT_CONFIRMED`） | 路由器 WAPE `0.333977`，bias `-11.36%`，相对最强单模型 FVA `-10.11%`（`HORIZON_ROUTER_NOT_CONFIRMED`） |
| 12 | 路由器 WAPE `0.248919`，bias `0.83%`，相对最强单模型 FVA `0.00%`（`HORIZON_ROUTER_NOT_CONFIRMED`） | 路由器 WAPE `0.306360`，bias `-6.47%`，相对最强单模型 FVA `0.00%`（`HORIZON_ROUTER_NOT_CONFIRMED`） |
| 36 | 路由器 WAPE `0.284898`，bias `7.56%`，相对最强单模型 FVA `0.00%`（`HORIZON_ROUTER_NOT_CONFIRMED`） | 不可评价（`HORIZON_ROUTER_NOT_EVALUABLE`） |

每个 horizon 独立判定，不强制统一模型。相对 FVA 以完全同案例的最强单模型为
比较对象；事后组合（`POSTHOC_REFERENCE`）只作诊断上限，从未参与内层选择。

## Core80 / Core90 完整同案例结果

| 人口 | 评价族 | horizon（月） | 同案例数 | 路由器 WAPE | 路由器 bias | 最强单模型 | 相对 FVA | 判定 |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| CORE80 | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 65 | 0.262460 | -3.65% | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE80 | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 65 | 0.271841 | 4.85% | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | -2.53% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE80 | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 47 | 0.248919 | 0.83% | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE80 | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 408 | 0.284898 | 7.56% | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE90 | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 158 | 0.292441 | -1.58% | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | -4.29% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE90 | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 158 | 0.303719 | 6.18% | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | -2.78% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE90 | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 115 | 0.302780 | 3.04% | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE90 | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 927 | 0.332402 | 7.75% | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE80 | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 36 | 0.292427 | -12.14% | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE80 | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 36 | 0.333977 | -11.36% | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | -10.11% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE80 | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 36 | 0.306360 | -6.47% | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE80 | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 0 | NA | NA | 无 | NA | `HORIZON_ROUTER_NOT_EVALUABLE` |
| CORE90 | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 75 | 0.348152 | -17.23% | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE90 | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 75 | 0.360216 | -13.77% | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | -5.16% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE90 | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 75 | 0.331856 | -7.47% | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 0.00% | `HORIZON_ROUTER_NOT_CONFIRMED` |
| CORE90 | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 0 | NA | NA | 无 | NA | `HORIZON_ROUTER_NOT_EVALUABLE` |

## 路由选择分布

总选择单元为 60，其中早期回退
52，滚动内层选择
8，弃权
0。

| 被选模型 | 次数 |
| --- | ---: |
| 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 26 |
| 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） | 2 |
| 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 32 |

| 选择原因 | 次数 |
| --- | ---: |
| 成熟历史起点不足，使用现行运行回退（`INSUFFICIENT_MATURE_SELECTION_ORIGINS_OPERATIONAL_FALLBACK`） | 20 |
| 通过偏差护栏后选择历史同案例 WAPE 最低者（`LOWEST_HISTORICAL_SAME_CASE_WAPE_AFTER_BIAS_GUARD`） | 8 |
| 现行回退不支持该单元，使用人工锚定全局模型（`OA03_UNSUPPORTED_FOR_CELL_LG01_FALLBACK`） | 32 |

## 冻结选择合同

- 历史 pseudo-origin 只有在其完整目标窗口于外层 origin 时已经成熟才可读
  （`prior_origin_target_window_fully_observed_by_outer_origin`）。
- 至少需要
  `3`
  个成熟历史选择起点；不足时只允许按作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）→人工锚定可学习
  全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）→弃权的顺序。
- 成熟后先排除 absolute bias 超过 10% 的模型，再比较历史同案例 WAPE；
  WAPE 相差低于 1% 时选择 absolute bias 更小者。
- 当前外层 actual 禁止参与选择
  （`outerActualAllowedForSelection=false`）。

## 确认门禁与治理边界

路由器确认（`HORIZON_ROUTER_CONFIRMED`）必须同时满足 Core80 作品总额相对
最强同案例单模型 WAPE 改善至少 1%、absolute bias 不恶化超过 2 个百分点、
2,000 次作品聚类配对 bootstrap 支持、多数独立时间块改善、单一/前五匿名作品
贡献不越过预注册阈值，且早期 fallback 不掩盖主要结果。

本阶段没有训练或调参，没有修改现行运行回退，没有读取 later-origin 或 final
holdout，没有写入数据库或 production。路由器原始候选、现行回退、每个单模型和
事后诊断参照均分别保留，selected pipeline 没有掩盖 raw candidate。
