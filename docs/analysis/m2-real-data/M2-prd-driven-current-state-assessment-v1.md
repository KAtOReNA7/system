# M2 PRD-driven current state assessment v1

本报告用于在继续修改 M2 评级/规则前，先按 PRD 和当前仓库证据确认 M2 状态。报告只使用聚合信息和文档证据，不包含真实作品名、作者名、渠道名或原始账单行。

## 1. 输入与边界

- PRD 基准：`docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md`
- 系统范围：`docs/prd/00-governance/scope.md`
- M1 主数据基准：`docs/prd/10-data-foundation/work-master-data.md`、`docs/prd/10-data-foundation/classification-and-tags.md`、`docs/prd/70-acceptance/M1.md`
- 当前进度：`README.md`、`AGENTS.md`、`NEXT-CODEX-INSTRUCTION.md`
- 本轮不修改代码、不生成新任务包、不进入 M3、不连接远端生产/共享/staging-like 数据库。
- `src/domain/oldProductEvaluation/forecastModelSelector.js` 不存在；当前可读规则代码为 `forecastabilityGate.js` 及其他 M2 domain 模块。

## 2. M2 PRD 能力状态

| PRD 能力 | 当前实现状态 | 证据 | 完成度 | 是否阻塞 M2 收口 |
|---|---|---|---|---|
| 收入分析 | 已具备初步候选，收入模式按行为识别；v3 用户反馈合理率 88.0%。 | `M2-revenue-model-classification-v2.json`、`M2-rating-standard-v3-operator-validation-summary-v1.json`、`revenueModelClassifier.js` | 部分完成 | 是，因边界仍需用户确认 |
| 生命周期 | 已在 M2 评估和 forecastability 中使用，但阈值仍是本地候选。 | `M2-old-product-evaluation-prd-v0.1.md`、`forecastabilityGate.js` | 基本具备 | 否，除非用于正式发布 |
| forecast | v1.1 conditional 通过完整性检查；只适用于 forecastable cohort。 | `M2-v1.1-backtest-integrity-audit.md`、`M2-v1.1-conditional-baseline-freeze-decision.json` | 条件完成 | 是，formal 完成仍阻塞 |
| 回测 | backtest integrity 为 PASS，v1.1 WAPE 优于 baseline。 | `M2-v1.1-backtest-integrity-audit.md` | 基本具备 | 否，但 formal 仍需授权 |
| 风险 | 风险/复核提示仍保留，并作为建议删除后的替代输出。 | `M2-suggestion-removal-boundary-v1.json`、`suggestionCalibration.js` | 基本具备 | 否 |
| 评级 | rating-standard-v3 未通过业务复核；v4 是定向候选，仍未获得用户确认。 | `M2-rating-standard-v3-operator-validation-summary-v1.json`、`M2-rating-standard-v4-targeted-correction-summary.json` | 未收口 | 是，核心阻断 |
| 运营建议 | PRD 要求建议，但当前自动运营建议主输出已删除，仅保留风险/复核提示。 | `M2-suggestion-removal-boundary-v1.json` | 明确降级 | 是，需要用户确认是否接受 M2 暂删 |
| 版本/快照 | 本地 DB-backed / candidate 证据存在，但不等于正式发布审批。 | `README.md`、`NEXT-CODEX-INSTRUCTION.md` | 本地具备 | formal 收口阻塞 |
| 导出/正式发布 | PRD 设计要求存在，但当前 formal readiness blocked，不授权正式 export/write/task API。 | `M2-v1.1-business-readiness-after-dual-source-staging-v1.json` | 未完成 | 是，formal 阻断 |

## 3. 关键阻塞

1. Forecast 仍是 conditional：`FREEZE_CONDITIONAL`，只允许 forecastable cohort 的有限业务复核，不是最终生产发布。
2. M1 dual-source 结果仍是 limited local staging，不是正式主数据写入；formal readiness 仍 blocked。
3. rating-standard-v3 评级合理率仅 8.0%，纯买断和买断+实销是主要失败域。
4. 自动运营建议主输出已删除，与 PRD 中“建议”能力存在阶段性偏差，需要用户确认是否作为 M2 收口边界接受。
5. 仍未进入 M3，且 `M3 allowed = false`。

## 4. 决策分工

| 类型 | 内容 | 处理方式 |
|---|---|---|
| 必须由用户业务决策 | 收入模式边界、买断折算口径、买断+实销合成、货架/版权状态置信、单一前台评级、运营建议是否推迟到 M4、M2 收口条件 | 由用户在问题包中回答 |
| Codex 可自动实现 | 将用户答案固化为规则、测试、报告、任务包字段和校验脚本 | 用户回答后一次性实施 |
| 应延后到 M4 | 自动运营建议恢复、案例池长期校准、复杂异常规则修复闭环、规则反馈沉淀机制 | M2 只保留标记和证据 |

## 5. 当前判断

M2 工程与本地数据开发已经具备较多候选能力，但 M2 不能按 PRD 完整收口。下一步不应继续让用户反复填 Excel，而应先让用户回答业务规则问题包，再由 Codex 一次性实施规则收口。

