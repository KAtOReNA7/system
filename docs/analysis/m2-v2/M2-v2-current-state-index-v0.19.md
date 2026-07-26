# M2 当前状态索引 v0.19

日期：2026-07-26

状态：current repository governance entry

## 唯一当前结论

M2 只预测未来分成收入现金。买断、其他非分成现金和 commitment 均在模型外；
pure-buyout 必须 `null abstain`。人工拆分的分成账单继续是特征、标签和 actual
的唯一现金权威，exact v0.3 继续是作品级 fallback。

v1.0 的 17.16% development 相对改善只支持“人工公式主干 + 全局校准”方向具有
研究价值，不构成成熟或发布证据。独立 later-origin 资格审计仍为：

- `decision=NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN`
- `metricsRead=false`
- `laterOriginConsumed=false`
- `trainingPerformed=false`
- 最早可能时间独立的 origin 为 2026-01；
- 36 个月标签要求账单完整到 2029-01，并要求原运行时 frozen v1 state。

2023-01 至 2023-04 是一个连续时间块，因 2023-03 已用于既有辅助评估且选择证据
使用到 2025-12，整块不独立，不得拆月重试。

## FVA 语义修复

历史 development 表中的后两层 FVA=0 是候选被拒绝后的 selected-pipeline
安全回退值，不是候选层真实增量。选择元数据显示：

- learnedGlobal → hierarchicalPositive：
  candidate FVA `-0.015177`，candidate WAPE 恶化 `3.45%`；
- selected hierarchy → occurrenceAndReversal：
  candidate FVA `-0.001034`，candidate WAPE 恶化 `0.23%`。

当前 canonical core 已在不改变冻结预测路径和参数的前提下分开保留：

- 完全 raw 专家预测；
- 选前 occurrence/reversal candidate；
- `candidateFva`；
- `selectedPipelineFva`；
- 连续 calendar origin 时间块审计。

development 门禁使用回退前的 candidate FVA，不再使用回退后必然非负的
selected-pipeline FVA。相邻月份只算一个时间证据块，作品/case 数不能替代
时间块数量。

本次属于评估、报告和门禁语义修复，不是模型训练、参数调整、候选选择或 v1.1
开发。冻结的 2021—2025 development artifact 和失败结论不改写。

## 当前业务与授权 gate

- `currentDecision=CANARY_FAIL`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=LATER_ORIGIN_NOT_QUALIFIED_2029_01_COMPLETE_LABELS_AND_ORIGINAL_FROZEN_STATE_REQUIRED`
- `developmentReplayAuthorized=true`
- `modelTrainingAuthorized=false`
- `newCandidateFamilyDevelopmentAuthorized=false`
- `candidateSelectionAuthorized=false`
- `laterOriginReadinessAuditAuthorized=true`
- `qualifiedLaterOriginValidationAuthorized=true`
- `laterOriginValidationExecuted=false`
- `finalHoldoutAuthorized=false`
- `full160Authorized=false`
- `releaseAuthorized=false`

provider、远端/共享/staging-like 数据库、Canary、full160、release 和 M3 formal
继续未授权。代码合并不等于模型发布。

## 当前入口

- `docs/analysis/m2-current/M2-current-human-anchored-fva-semantics-remediation-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-fva-semantics-remediation-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-code-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.12.json`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-research-and-decision-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

v0.18 及更早 current-state 文件保留作历史审计，不是新的执行入口。PR #7 的
cryptographic authority 仍由不可变的
`docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json` 提供，本索引不改写其
绑定。

## 公共验证

```bash
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run smoke:portable-start
npm run test:e2e
npm run verify:m2:current
```

缺少 private 或原始 frozen v1 state 只能阻断对应 private replay/later-origin
验证，不得阻断公共 clone、安装、测试、诊断或启动。
