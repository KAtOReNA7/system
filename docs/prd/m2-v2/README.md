# M2 Forecast Intelligence v2 PRD 文档集

## 状态

- 阶段：`V2_B_INTEGRITY_REMEDIATION_COMPLETE_PENDING_EXTERNAL_REVIEW`
- 决策状态：`not_for_formal_decision`
- 发布状态：未批准
- 实现状态：V2-A 已完成；V2-B.1 至 V2-B.8 为历史 checkpoint；V2-B.8 原始业务结论为 `CANARY_CONDITIONAL`，修复合同的离线 restatement 为 `CANARY_FAIL`
- 完整性状态：verifier/private-state 修复、离线恢复、全量验证与 100% 复审已经收口；结果以版本化 summary、restatement 和 current-state index 为准
- 扩量状态：`full160Authorized=false`；V2-C/V2-D 未开始

本目录保留 M2 Forecast Intelligence v2 从 V2-A 到 V2-B.8 的产品合同与历史 checkpoint。当前导航只见 `docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md`；旧 index、旧 NEXT/next-step、旧 decision 和 PRD 授权语句均为 `historical / superseded / not authorization`。PR #7 必须保持 Draft/open/unmerged。它不修改当前 M2 正式结果，不替代 B4，也不授权 provider、Canary、训练、full160、V2-C/V2-D、C4、final holdout、release 或 M3。

## 权威边界

当前 formal-cash 决策、单点输出、pure-buyout null abstention、无自动运营动作和全部 seals 保持不变。V2 文档只定义未来合同；在后续明确批准前，现行 v1 结果与 `not_for_formal_decision` 状态不变。

若本目录与旧三情景、suggestion 或未来买断周期文档冲突，本目录仅代表 V2 设计方向；它不自动迁移数据库或改变运行时。正式实施仍需单独授权、migration 评审、端到端测试和发布批准。

## 文档索引

| 文档 | 作用 |
|---|---|
| `M2-forecast-intelligence-v2-prd-v0.1.md` | V2 产品目标、输出、指标、门禁和非目标 |
| `M2-v2-data-policy-v0.1.md` | 自动获取、禁止人工输入、解释专用和预测可用边界 |
| `M2-v2-human-baseline-prd-v0.1.md` | Human-vs-AI 抽样、reviewer 流程、指标与防泄漏规则 |
| `M2-v2-v2a-traceability-v0.1.md` | 需求到设计、未来测试和门禁的追踪矩阵 |
| `M2-v2-evidence-pilot-prd-v0.1.md/json` | V2-B evidence-only pilot scope、population、预算和 gate |

技术设计位于 `docs/technical-design/m2-v2/`。

## V2-A 完成定义

本轮完成：

- 五个产品目标及其互斥边界；
- External Evidence Layer schema、provider、时点、confidence 和冲突合同；
- Human baseline 预注册框架；
- API、DB、export 的设计合同；
- 自动获取、禁止人工输入、解释专用数据策略；
- machine-readable JSON Schema 与合同 manifest；
- planned acceptance tests 和 traceability。

本轮未完成且不属于本轮：

- provider 采购、法律意见或来源许可批准；
- evidence pilot、全库搜索或 prospective snapshot；
- commercial-value 权重或 trend 阈值的业务批准；
- 任何模型训练、C4、final holdout 或 release；
- migration、API、repository、页面或导出实现。

因此 V2-A 的文档包已就绪。2026-07-17 的用户指令曾历史性授权在 V2-A checkpoint 合入并确认 main CI 后启动 V2-B External Evidence Pilot；该授权已经执行并被 V2-B.2–B.8 与后续完整性修复 supersede，只作追溯，**不构成当前 provider、resume、Canary 或任何新执行授权**。当前授权边界只由 current-state-index-v0.2 与用户最新明确指令给出。
