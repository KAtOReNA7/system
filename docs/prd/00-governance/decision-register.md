# 决策登记表

| 决策 | 状态 | 当前结论 | ADR |
|---|---|---|---|
| DEC-011 | 已授权（V2-B evidence pilot only） | M2 v2 V2-A 五头 PRD、字段字典、External Evidence、Human Baseline、API/DB/export、schema 和 traceability 作为架构 checkpoint；普通 merge 并确认 main CI 后只允许执行 V2-B prospective evidence pilot。V2-B 不训练模型、不改变 B4、不打开 final holdout、不进入 V2-C/V2-D/C4/M3、不 release；缺 provider/private 身份源时 fail-closed | `docs/prd/m2-v2/README.md` |
| DEC-010 | 已完成（C3 development FAIL） | C3-A overall WAPE 0.55394517、signed bias +0.08273913，模型质量 FAIL、业务覆盖 CONDITIONAL；B4 继续为 comparator/fallback。C3 不得重复执行，所有 seals 保持关闭，结果 `not_for_formal_decision` | `docs/analysis/m2-real-data/M2-C3-development-validation-v1.md` |
| DEC-009 | 已完成（历史 development checkpoint） | formal-cash comparator 在固定 7851-case 模型人口上冻结 B4，Gate B 14/14；C2-R.1 的 45 候选 development 验证为 13/23、结论 FAIL。后续 C2/C3 的授权和结果由 DEC-010/011 现行化；final holdout 与 release 始终未授权 | `docs/analysis/m2-real-data/M2-C2R1-development-validation-v1.md` |
| DEC-008 | 已冻结（formal cash target） | M2 正式点值只预测未来实销现金与 cutoff 时已确认、可审计的未来应收；pure-buyout 无未来买断应收时必须 abstain/null，其他 route 仍计入所有 cutoff-confirmed future receivables；买断月均等效值仅用于评级和历史价值 | `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md` |
| DEC-001 | 已确认 | 评估尝试状态仅保留成功、失败 | ADR-0001 |
| DEC-002 | 已确认 | 标准作品上线时间取所有业务形态最早首笔实销月 | ADR-0002 |
| DEC-003 | 已确认 | 账单当前只保留实销金额，不存在两个非统计金额字段 | ADR-0003 |
| DEC-004 | 已确认 | 详细规则采用单一权威文档，v0.1覆盖记录转历史 | ADR-0004 |
| DEC-005 | 已确认 | 大型账单要求业务原子性，不限定为单个数据库长事务 | ADR-0005 |
| DEC-006 | 已冻结（本地校准） | M2 正式合同仅输出单点值、年度拆分、confidence、limitation；内部 80% PI 不外发；最终候选仍为 `not_for_formal_decision` | `docs/analysis/m2-real-data/M2-final-forecast-calibration-decision-v1.md` |
| DEC-007 | 已冻结（历史计分修正） | M2 回测拆分 statistically-scoreable、model-prediction-available、business-serving-eligible 与 abstained；blocked/null 不得按 0 混入模型 WAPE。旧 top10 served-revenue 90% 仅保留为原分母上的非回归审计参考，不是 v1.2 Gate A、C1 或 C2-R.1 gate，且 eligibility 不得为达到比例而移动 | `docs/analysis/m2-real-data/M2-calibration-scoring-eligibility-correction-decision-v1.md` |
