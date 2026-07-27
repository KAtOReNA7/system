# M2 当前状态索引 v0.21

日期：2026-07-26

状态：current repository governance entry

## 唯一当前结论

M2 只预测未来分成收入现金。买断、其他非分成现金和 commitment 均在模型外；
pure-buyout 必须 `null abstain`。人工拆分的分成账单继续是特征、标签和 actual
的唯一现金权威，exact v0.3 继续是作品级 fallback。

冻结 v1.0、TSB occurrence challenger 和本轮 lifecycle-aware challenger 均未通过
development。当前不存在 champion 替换、自动化、Canary 或 release 证据。

后续 commercial-state information gain、data readiness、source discovery 与
source acquisition audit 已完成。当前没有取得可恢复、合规、具备
`effectiveAt`/`availableAt`/版本/lineage 的历史商业状态源，不得进入 event
ledger 物化或模型开发。

## Lifecycle-aware v0.1

本轮用户明确授权算法重构，不授权发布门禁建设。实现和实验均与 production
loader、route、forecast API 隔离：

- lifecycle encoder 只读取 origin 当时的分成正向现金历史，互斥输出
  `active/stable/decline/dormant/revival`；
- occurrence 使用 ridge logistic 与 lifecycle×horizon 收缩发生率；
- positive amount 评估 Huber `log1p`、baseline-offset log、state log-ratio
  与截断/不截断版本；
- reversal 复用共同的 human-anchored reversal 层；
- 新增 revenue-weighted WAPE、五状态分群指标和 top 1%/5%/10% 收入作品误差；
- 每轮保存 dataset version、feature version、model config 和 evaluation result。

数据与切分：

- dataset：`M2-human-anchored-sales-share-development-2021-2025-v0.1`；
- 3,053 部权威作品，2,682 部有 2021—2025 分成事实；
- primary：1,125 部独立作品、12,039 个 36 月成熟 case，deterministic
  cross-work 5-fold；
- strict auxiliary：74,320 个 earlier-origin/earlier-label 可评分 case；
- buyout、pre-2021、post-2025 使用均为 false；
- 未成熟标签零填充为 0，未观察月份不补 0。

四个 raw 快速实验均失败：

| raw 实验 | primary WAPE | 相对 baseline | strict WAPE | 相对 baseline |
|---|---:|---:|---:|---:|
| direct Huber log | 0.75589798 | +71.71% | 0.70375953 | +70.85% |
| baseline-offset Huber log | 0.69860444 | +58.69% | 0.61937716 | +50.36% |
| capped state log-ratio | 0.71085206 | +61.47% | 0.68796569 | +67.01% |
| uncapped state log-ratio | 0.50139298 | +13.89% | 0.62275977 | +51.19% |
| learnedGlobal baseline | 0.44022495 | — | 0.41191878 | — |

仅 `revival` 使用 challenger、其余状态回退 baseline 的诊断来自已看见的
development 指标，不是独立选模。它的 primary/strict WAPE 为
`0.44016120 / 0.41189883`，相对改善仅 `0.0145% / 0.0048%`，低于 1%
materiality；top 1%/5%/10% 收入作品 WAPE 均与 baseline 相同。

5,203 个 exact v0.3 overlap case 上，raw lifecycle/selected/learnedGlobal/exact
v0.3 WAPE 为 `0.27458711 / 0.27723899 / 0.27723899 / 0.37610234`。这是同窗
子集诊断，不是独立 later-origin，不能覆盖 primary 与 strict 的 raw 失败。

最终决定：

- `LIFECYCLE_AWARE_DEVELOPMENT_FAIL_TRIVIAL_POSTHOC_GAIN`
- `modelUpgradeSupported=false`
- `exactV03ReplacementSupported=false`
- 五状态配置、快速实验与失败结论冻结，不继续同窗调参。

## Commercial-state data/source audit

lifecycle-aware 失败后的信息增益分析认为，下一轮更可能改善作品级预测的信号是
cutoff 时真实可得的渠道上下架、合同可售和权利续约状态，而不是继续从同一现金
序列派生特征。数据与来源调查依次得出：

- `NEEDS_DATA_MATERIALIZATION_FIRST`
- `NO_COMPLIANT_HISTORICAL_COMMERCIAL_STATE_SOURCE_FOUND_IN_INSPECTED_SCOPE`
- `NO_RECOVERABLE_COMPLIANT_HISTORICAL_COMMERCIAL_SOURCE_ACQUIRED`

实际证据：

- `m1.standard_work_status_history` 每部作品只有一条 current row，所有
  `validFrom` 相同且没有关闭记录；
- `basic_info_version` 只有一个有效填充快照，不能构成版本链；
- `mapping_change_record` 为 0 行，且其 schema 面向技术映射变更；
- transfer archives 与当前 master/dump 字节一致，只是 current-state portability
  copy；
- 没有取得下架反馈、平台上下架、合同变更、续约、CRM/ERP、audit log、
  CDC/binlog 或 archive snapshot 的合规历史导出。

当前合规 historical commercial-state 覆盖为 work `0/3053`、channel
`0/74`（实际分成渠道 `0/39`）、contract `0`、month `0`。
`canonicalEventLedgerGenerated=false`。禁止创建空 ledger、零填充或把 current
状态事后回填。下一步只能由业务系统 owner 提供 capability-scoped immutable
export，包含 stable identity、before/after、`effectiveAt`、`availableAt`、来源
版本、lineage、撤销/更正语义与完整性权威；取得后先重新审计，再决定是否开发。

## 既有失败与 later-origin

v1.0 及 TSB occurrence 的既有失败结论不变。raw candidate、pre-fallback candidate
与 selected pipeline 必须继续分开报告；安全回退后的 0 不得解释为候选增量。

独立 later-origin 资格仍为：

- `decision=NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN`
- `metricsRead=false`
- `laterOriginConsumed=false`
- `trainingPerformed=false`
- 最早可能时间独立的 origin 为 2026-01；
- 36 个月标签要求账单完整到 2029-01；
- 原运行时 frozen v1 state 仍缺失。

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

本轮 lifecycle-aware 算法重构授权已执行完毕。provider、远端/共享/staging-like
数据库、Canary、full160、release 和 M3 formal 继续未授权。代码实现不等于模型
发布。

本轮 commercial-state proposal 与三轮 source investigation 也已执行完毕；未授权
schema、event ledger、模型实现或训练。

## 当前入口

- `docs/analysis/m2-current/M2-current-model-structure-and-lifecycle-aware-proposal-v0.1.md`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-public-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-current-feature-information-gain-and-commercial-state-model-proposal-v0.1.md`
- `docs/analysis/m2-current/M2-commercial-state-data-readiness-audit-v0.1.md`
- `docs/analysis/m2-current/M2-commercial-state-data-readiness-audit-v0.1.json`
- `docs/analysis/m2-current/M2-commercial-state-source-discovery-v0.1.md`
- `docs/analysis/m2-current/M2-commercial-state-source-discovery-v0.1.json`
- `docs/analysis/m2-current/M2-historical-commercial-source-acquisition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-historical-commercial-source-acquisition-audit-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

v0.20 及更早 current-state 文件保留作历史审计，不是新的执行入口。PR #7 的
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

缺少 private 只能阻断对应 private development；不得阻断公共 clone、安装、测试、
lifecycle-aware synthetic diagnostic、其他公共诊断或启动。
