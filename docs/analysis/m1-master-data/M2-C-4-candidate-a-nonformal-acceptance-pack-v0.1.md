# M2-C-4 candidate-a 非正式算法验收包 v0.1

## 1. 当前算法候选版本

当前可验收的非正式算法候选为 `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`。

该候选来自 M2-C-0 至 M2-C-3 的聚合级校准链路：真实清洗账单算法校准探索、非正式参数 guarded integration、真实聚合输入 dry-run，以及 candidate-a 参数迭代。它只用于 M2 非正式候选验收，不是正式业务结论。

| 项目 | 当前值 |
|---|---|
| algorithmCandidateVersion | `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a` |
| calibration source | M2-C-0 / C-1 / C-2 / C-3 aggregate-only outputs |
| latestCompleteMonth | 2026-04 |
| excludedIncompleteMonths | 2026-05 |
| notForFormalDecision | true |
| formalEvaluationAllowed | false |

## 2. 当前覆盖范围

candidate-a 已在聚合级覆盖 3,054 部标准作品，账单月份范围为 2017-06 至 2026-05，其中正式完整数据截止月份仍为 2026-04，2026-05 只保留事实但不进入正式截止月判断。

| 覆盖项 | 聚合结果 |
|---|---:|
| evaluated works | 3,054 |
| business forms | 2 |
| audio_product rows | 135,297 |
| audio_copyright rows | 57,575 |
| blocking manual review | 513 |
| advisory-only review | 2,331 |
| works with copyright fallback | 2,207 |
| channel concentration | 1,944 |

## 3. 评级分布

S/S+ 是高优先级候选，不是自动投放结论。D/E 是低投入、观察或下架候选，不是自动下架结论。所有高风险边界仍会被 manual review 覆盖。

| 评级 | 数量 | 占比 |
|---|---:|---:|
| S+ | 7 | 0.23% |
| S | 30 | 0.98% |
| A | 160 | 5.24% |
| B | 647 | 21.19% |
| C | 704 | 23.05% |
| D | 395 | 12.93% |
| E | 1,111 | 36.38% |

业务解释：

- S+/S/A 可作为运营优先关注池，但必须结合风险、版权期限和人工复核结果。
- B/C 更适合常规维护、包装和渠道策略判断。
- D/E 更适合低投入、观察或下架候选池，但不得自动执行。
- candidate-a 对异常峰值、一次性收入、版权缺口和版权临期设置了评级 cap，避免高风险样本被直接解释为高优先级。

## 4. 生命周期分布

| 生命周期 | 数量 | 占比 | 运营含义 |
|---|---:|---:|---|
| growth | 540 | 17.68% | 可进入增长候选池，但需排除异常峰值和版权缺口 |
| stable | 872 | 28.55% | 适合维持、复包或渠道优化判断 |
| declining | 394 | 12.90% | 适合降投入、观察或复核是否存在外部事件 |
| long_tail | 132 | 4.32% | 适合低成本维护或渠道/定价试验 |
| inactive | 800 | 26.20% | 适合观察、低投入或下架候选池 |
| rebound | 270 | 8.84% | 适合检查是否有回升信号，可考虑小规模验证 |
| insufficient_history | 46 | 1.51% | 历史不足，默认不作高置信正式判断 |

需要人工复核的生命周期主要集中在：高价值但版权缺口、异常峰值、一次性收入、历史不足但被评为较高优先级的样本。

## 5. 风险分布与阻断边界

candidate-a 将风险拆成三类：

- blocking risk：进入正式化前人工复核队列；
- advisory risk：进入页面或报告提示，不阻断非正式候选验收；
- non-blocking warning：仅作为解释性背景。

| 风险项 | 数量 | 当前解释 |
|---|---:|---|
| missing_copyright_end | 2,207 | 版权到期日缺失；高价值样本阻断，低价值样本提示 |
| aggregate_projection_gap | 2,207 | 因缺失版权期限使用聚合 fallback |
| channel_concentration | 64 | 达到 candidate-a 的渠道集中风险阈值 |
| channel_concentration_advisory | 1,880 | 渠道集中但按金额/形态仅提示 |
| copyright_expiry | 363 | 版权临期或已接近到期 |
| abnormal_spike | 382 | 单月峰值异常，需要防止一次性收入污染评级 |
| buyout_or_oneoff_income | 328 | 疑似买断或一次性收入候选 |
| inactive_tail | 932 | 长尾或不活跃 |
| revenue_decline | 394 | 近期收入下行 |

阻断复核原因聚合如下：

| 阻断原因 | 数量 |
|---|---:|
| high_value_with_data_gap | 444 |
| high_value_with_expiry | 60 |
| abnormal_spike | 7 |
| insufficient_history | 6 |
| buyout_or_oneoff_income | 2 |
| channel_structure_unclear | 2 |

提示复核原因聚合如下：

| 提示原因 | 数量 |
|---|---:|
| channel_structure_unclear | 1,942 |
| copyright_missing | 1,763 |
| abnormal_spike | 375 |
| buyout_or_oneoff_income | 326 |
| high_value_with_expiry | 303 |
| insufficient_history | 40 |

## 6. 建议分布

以下是候选建议，不等于自动执行。运营策略确认前，不应触发导入、激活、下架、投放、重试或导出动作。

| 建议 | 数量 | 当前解释 |
|---|---:|---|
| promote | 442 | 增投或重点运营候选 |
| maintain | 707 | 维持运营候选 |
| reduce_investment | 252 | 降投入候选 |
| repackage | 509 | 复包或形态/渠道重组候选 |
| pricing_or_channel_adjustment | 402 | 定价或渠道调整候选 |
| renewal_review | 209 | 续约评审候选 |
| observe_only | 429 | 观察候选 |
| downlist_or_suspend | 744 | 下架或暂停候选，必须人工确认 |
| manual_review_required | 513 | 正式化前阻断复核队列 |

## 7. 当前可验收项

以下 M2 目标已经形成非正式候选能力，可交给运营做业务验收：

- 老品 work-level 评估：可验收，非正式候选。
- 生命周期识别：可验收，非正式候选。
- 历史收入摘要：可验收，聚合与 fixture 能力已形成。
- 三情景预测：可验收，非正式候选。
- 评级：可验收，candidate-a 已带风险 cap。
- 风险：可验收，已区分阻断、提示和非阻断警告。
- 建议：可验收，明确不是自动执行。
- 回测 / dry-run 聚合验证：可验收，已形成 C0-C4 链路。
- fixture/admin 展示：已完成 fixture-only 工程闭环。
- 非正式参数版本：可验收，版本为 `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`。

## 8. 当前不可验收项

以下仍不能作为 M2 正式评估验收：

- formal evaluation；
- 正式数据 readiness；
- `mapping_version` activation；
- 数据库写入与正式评估持久化；
- evaluation task API；
- export API；
- 运营确认结果正式应用；
- 权限、审计、版本发布流程；
- 自动投放、自动下架、自动续约或自动策略执行。

## 9. 需要业务确认的问题

建议业务/运营侧集中确认以下 10 个问题，不再继续拆技术线小任务：

1. S/S+/A 是否作为资源优先级池，以及每档资源边界。
2. D/E 是否对应降投入、观察或下架候选。
3. `manual_review_required=513` 的阻断复核规模是否可接受。
4. advisory-only review 是否进入页面提示或运营说明。
5. channel concentration 对天然单渠道作品是否应降权或仅提示。
6. copyright fallback 是否允许用于非正式预测。
7. 缺失版权到期日的 2,207 部作品如何补齐。
8. `downlist_or_suspend=744` 是否必须逐项人工确认。
9. `renewal_review=209` 的提前期是否符合业务节奏。
10. 正式评估前是否必须补齐 basic info / copyright end。

## 10. 技术产物索引

| 类型 | 文件或命令 |
|---|---|
| 参数文件 | `src/domain/oldProductEvaluation/calibratedParameters.js` |
| fixture engine | `src/domain/oldProductEvaluation/fixtureEngine.js` |
| 非正式 dry-run | `tools/m2-calibration/run_nonformal_dry_run.py` |
| API 契约 | `docs/api/M2-old-product-evaluation-api-contract-v0.1.md` |
| API addendum | `docs/api/M2-old-product-evaluation-api-contract-addendum-v0.1.md` |
| M2-B 收口 | `docs/technical-design/M2-B-fixture-old-product-evaluation-stage-closeout-report-v0.1.md` |
| C0 校准报告 | `docs/technical-design/M2-C-0-cleaned-bill-algorithm-calibration-exploration-report-v0.1.md` |
| C1 集成报告 | `docs/technical-design/M2-C-1-calibrated-parameters-guarded-integration-report-v0.1.md` |
| C2 dry-run 报告 | `docs/technical-design/M2-C-2-nonformal-aggregate-dry-run-report-v0.1.md` |
| C3 参数迭代报告 | `docs/technical-design/M2-C-3-aggregate-dry-run-parameter-iteration-report-v0.1.md` |
| C4 验收包 | `docs/analysis/m1-master-data/M2-C-4-candidate-a-nonformal-acceptance-pack-v0.1.md` |
| fixture 命令 | `npm run evaluate:m2:old-products:fixture` |
| calibrated 命令 | `npm run evaluate:m2:old-products:calibrated` |
| profile compare 命令 | `npm run compare:m2:old-products:calibration` |
| candidate-a dry-run | `python tools/m2-calibration/run_nonformal_dry_run.py --variant candidate-a` |

## 11. 验收结论

M2 可以按“非正式算法候选阶段”收口。当前不建议继续技术线参数微调，除非运营验收发现严重业务解释错误或算法事故。

下一阶段不应是 C5/C6 参数微调，而应转为：运营线验收 candidate-a、确认 formal readiness 前置条件、决定哪些阻断复核和基础信息缺口必须在正式评估前完成。
