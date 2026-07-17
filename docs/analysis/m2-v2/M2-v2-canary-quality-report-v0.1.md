# M2 v2 Canary 质量报告 v0.1

## 质量结论

Provider contract success 20.00%（relay 旧口径 81.67%）；entity resolution 0.00%；evidence accepted 0。空分母不会被记为 100%。

## Evidence 漏斗

- candidate / accepted / rejected：109 / 0 / 109；
- citation candidate alignment：0.00%；
- capturedAt / availableAt / eventTime（primary candidate 分母 109）：100.00% / 38.53% / 41.28%；
- source allowlist：`empty_fail_closed`，未批准域名不会成为 accepted evidence；
- contradiction raw conflict groups / admissible conflict groups：17 / 0；rejected claim 不得否决 admissible claim；
- repeat raw-claim consistency：0.00%（5 个样本的 raw/rejected candidate 口径）；admissible evaluable works=0，admissible consistency=不可评估。
- Luna synthetic 对照与 canary 指标严格分离且不可直接比较；建议为 `NO_MODEL_SWITCH_DECISION_IN_THIS_CANARY; LUNA_SYNTHETIC_NOT_COMPARABLE; RETEST_REQUIRES_SEPARATE_FULL_CAPABILITY_AND_CITATION_GATE`。

## 验证

项目验证 6/6 通过；private ignored/untracked=true，review workbook present/XLSX-container-valid=true，public privacy leak count=0。未使用官方 OpenAI 价格估算第三方 relay 成本；价格不可得时成本 gate 不作通过处理。
