# 决策登记表

M2 当前授权与停止边界只由用户最新明确指令和
`docs/analysis/m2-v2/M2-v2-current-state-index-v0.21.md` 给出。下列历史记录中
出现的“已授权”“当前”或 next step 不构成 provider、resume、Canary、full160、
holdout 或新开发授权。

| 决策 | 状态 | 当前结论 | ADR |
|---|---|---|---|
| DEC-019 | 当前 | commercial-state information gain、data readiness、source discovery 与 source acquisition audit 已完成。现有 `standard_work_status_history`、`basic_info_version`、`mapping_change_record`、transfer archive 和 loader 均不能恢复合规历史商业状态；work/channel/contract/month 历史覆盖为 0，`canonicalEventLedgerGenerated=false`。决定 `NO_RECOVERABLE_COMPLIANT_HISTORICAL_COMMERCIAL_SOURCE_ACQUIRED`；业务系统提供 capability-scoped immutable export 并重新审计前，不创建 event ledger、不开发或训练 commercial-state 模型 | `docs/analysis/m2-current/M2-historical-commercial-source-acquisition-audit-v0.1.md` |
| DEC-018 | 当前 | lifecycle-aware revenue forecast v0.1 已完成五状态、状态条件 occurrence、log-amount 与 top-revenue 诊断。raw challenger primary/strict WAPE 为 0.50139298/0.62275977，劣于 learnedGlobal baseline 0.44022495/0.41191878；revival-only post-hoc 管线只改善 0.0145%/0.0048%，低于 1% materiality，头部收入作品无改善。结论 `LIFECYCLE_AWARE_DEVELOPMENT_FAIL_TRIVIAL_POSTHOC_GAIN`，不替换 exact v0.3、不进入 production | `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.md` |
| DEC-017 | 当前 | v1.0 later-origin 资格审计确认 2023-01 至 2023-04 虽已 36 个月标签成熟，但必须作为 1 个连续块，且 2023-03 已进入既有辅助评估、选择证据读取到 2025-12，整块不独立；原运行完整 frozen state 缺失，未读取指标、未消耗窗口。最早可能独立 origin 为 2026-01，需账单完整到 2029-01 且取得原 frozen state | `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md` |
| DEC-015 | 当前 | M2 只预测未来分成收入现金；全部买断现金（包括 cutoff 已确认买断应收）在预测范围外。人工账单分区是现金类型唯一权威；133 个渠道原始组合已归并为 74 个 canonical 渠道。v0.9 在 25-origin 诊断恶化、在 7,083 served case 仅改善 0.0118%，结论 `REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK` | `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md` |
| DEC-016 | 当前 | 人工主力/边缘渠道算法是新模型唯一结构主干和 fallback。v1.0 从全部 3,053 部权威作品建立资格账本，在 1,125 部独立作品、12,039 个成熟 36 个月 case 上较人工原式改善 17.16%，但 WAPE 0.44022707、bias -0.12366598，分群、作品聚类 bootstrap 与 later-origin 门禁失败；冻结 v1.0，继续 exact v0.3 fallback | `docs/analysis/m2-current/M2-current-human-anchored-research-and-decision-v0.1.md` |
| DEC-014 | 历史收口声明（已被 PR #7 独立外审修复轮 supersede） | v0.1 summary 记录当时的 verifier/private-state 收口声明；独立外审随后识别 merge blockers，因此该行只作历史追溯、`not authorization`。当前状态只见 current-state-index-v0.2；PR #7 保持 Draft/open/unmerged，`nextDevelopmentReadiness=NOT_AUTHORIZED` | `docs/analysis/m2-v2/M2-v2-integrity-remediation-summary-v0.1.md` |
| DEC-013 | 历史原始决定 + 已被后续修复轮 supersede 的 restatement v0.2 | V2-B.1 至 V2-B.8 全部保留为历史 checkpoint；V2-B.8 原始结论仍为 `CANARY_CONDITIONAL`。v0.2 restatement 的 `CANARY_FAIL` 只保留为版本化历史，不是当前授权；当前 restatement/authority 只经 current-state-index-v0.2 解析。`full160Authorized=false` | `docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.2.md` |
| DEC-012 | 历史（V2-B initial fail-closed checkpoint） | 当时冻结 160 部 immutable 样本与 evidence pilot framework，640 个计划 query 未外发，判 `PILOT_CONDITIONAL`、V2-C `NOT_READY`。该 checkpoint 后续已由 B.2–B.8 推进替代；其 provider resume 句不构成当前授权，当前以 DEC-013/014 为准 | `docs/analysis/m2-v2/M2-v2-evidence-pilot-summary-v0.1.md` |
| DEC-011 | 历史授权（V2-B evidence pilot only；已执行并 superseded） | 2026-07-17 指令曾授权 V2-B prospective evidence pilot；该授权已执行并被 B.2–B.8/完整性修复 supersede，只作历史追溯，`not authorization`，不得据此调用 provider 或 resume。V2-B 从未授权训练、B4 变更、final holdout、V2-C/V2-D/C4/M3 或 release | `docs/prd/m2-v2/README.md` |
| DEC-010 | 已完成（C3 development FAIL） | C3-A overall WAPE 0.55394517、signed bias +0.08273913，模型质量 FAIL、业务覆盖 CONDITIONAL；B4 继续为 comparator/fallback。C3 不得重复执行，所有 seals 保持关闭，结果 `not_for_formal_decision` | `docs/analysis/m2-real-data/M2-C3-development-validation-v1.md` |
| DEC-009 | 已完成（历史 development checkpoint） | formal-cash comparator 在固定 7851-case 模型人口上冻结 B4，Gate B 14/14；C2-R.1 的 45 候选 development 验证为 13/23、结论 FAIL。后续 C2/C3 的授权和结果由 DEC-010/011 现行化；final holdout 与 release 始终未授权 | `docs/analysis/m2-real-data/M2-C2R1-development-validation-v1.md` |
| DEC-008 | 历史（被 DEC-015 取代） | 旧 formal-cash target 曾纳入 cutoff-confirmed future receivables；该现金目标已被用户改为分成收入现金，不能继续作为 current 预测合同。买断月均等效值仍只可用于评级/历史背景 | `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md` |
| DEC-001 | 已确认 | 评估尝试状态仅保留成功、失败 | ADR-0001 |
| DEC-002 | 已确认 | 标准作品上线时间取所有业务形态最早首笔实销月 | ADR-0002 |
| DEC-003 | 已确认 | 账单当前只保留实销金额，不存在两个非统计金额字段 | ADR-0003 |
| DEC-004 | 已确认 | 详细规则采用单一权威文档，v0.1覆盖记录转历史 | ADR-0004 |
| DEC-005 | 已确认 | 大型账单要求业务原子性，不限定为单个数据库长事务 | ADR-0005 |
| DEC-006 | 已冻结（本地校准） | M2 正式合同仅输出单点值、年度拆分、confidence、limitation；内部 80% PI 不外发；最终候选仍为 `not_for_formal_decision` | `docs/analysis/m2-real-data/M2-final-forecast-calibration-decision-v1.md` |
| DEC-007 | 已冻结（历史计分修正） | M2 回测拆分 statistically-scoreable、model-prediction-available、business-serving-eligible 与 abstained；blocked/null 不得按 0 混入模型 WAPE。旧 top10 served-revenue 90% 仅保留为原分母上的非回归审计参考，不是 v1.2 Gate A、C1 或 C2-R.1 gate，且 eligibility 不得为达到比例而移动 | `docs/analysis/m2-real-data/M2-calibration-scoring-eligibility-correction-decision-v1.md` |
