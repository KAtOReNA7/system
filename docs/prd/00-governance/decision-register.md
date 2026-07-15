# 决策登记表

| 决策 | 状态 | 当前结论 | ADR |
|---|---|---|---|
| DEC-008 | 已冻结（formal cash target） | M2 正式点值只预测未来实销现金与 cutoff 时已确认、可审计的未来应收；pure-buyout 无未来买断应收时必须 abstain/null，其他 route 仍计入所有 cutoff-confirmed future receivables；买断月均等效值仅用于评级和历史价值 | `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md` |
| DEC-001 | 已确认 | 评估尝试状态仅保留成功、失败 | ADR-0001 |
| DEC-002 | 已确认 | 标准作品上线时间取所有业务形态最早首笔实销月 | ADR-0002 |
| DEC-003 | 已确认 | 账单当前只保留实销金额，不存在两个非统计金额字段 | ADR-0003 |
| DEC-004 | 已确认 | 详细规则采用单一权威文档，v0.1覆盖记录转历史 | ADR-0004 |
| DEC-005 | 已确认 | 大型账单要求业务原子性，不限定为单个数据库长事务 | ADR-0005 |
| DEC-006 | 已冻结（本地校准） | M2 正式合同仅输出单点值、年度拆分、confidence、limitation；内部 80% PI 不外发；最终候选仍为 `not_for_formal_decision` | `docs/analysis/m2-real-data/M2-final-forecast-calibration-decision-v1.md` |
| DEC-007 | 已冻结（历史计分修正） | M2 回测拆分 statistically-scoreable、model-prediction-available、business-serving-eligible 与 abstained；blocked/null 不得按 0 混入模型 WAPE。旧 top10 served-revenue 90% 仅保留为原分母上的非回归审计参考，不是 v1.2 Gate A、C1 或 C2-R.1 gate，且 eligibility 不得为达到比例而移动 | `docs/analysis/m2-real-data/M2-calibration-scoring-eligibility-correction-decision-v1.md` |
