# M2 当前状态索引 v0.20

日期：2026-07-26

状态：current repository governance entry

## 唯一当前结论

M2 只预测未来分成收入现金。买断、其他非分成现金和 commitment 均在模型外；
pure-buyout 必须 `null abstain`。人工拆分的分成账单继续是特征、标签和 actual
的唯一现金权威，exact v0.3 继续是作品级 fallback。

冻结 v1.0 和本轮唯一的
`M2-current-human-anchored-tsb-occurrence-challenger-v0.1` 都未通过
development 门禁。当前不存在 champion 替换、自动化、Canary 或 release 证据。

## learnedGlobal + TSB 候选

本轮在公开预注册提交 `8557080` 后执行；未根据 outer 指标扩大网格或修改公式：

- learnedGlobal 人工公式、参数名称和原网格冻结；
- 四专家与 hierarchy 层关闭；
- canonical TSB occurrence smoothing：`0.05 / 0.10 / 0.20`；
- canonical TSB positive-amount smoothing：`0.05 / 0.10 / 0.20`；
- learnedGlobal→TSB blend：`0 / 0.25 / 0.50`；
- `lambda=0` 始终是安全 fallback；
- 零发生月更新 occurrence，positive amount 只在正向分成现金月更新；
- 冲销独立，并在 comparator 与 candidate 间使用相同训练折状态。

受控 private development 完整性：

- 3,053 部权威作品；
- 2,682 部在 2021—2025 有分成事实；
- 167,972 条现代窗口分成事实；
- mapping coverage 100%，金额守恒差 0；
- buyout/pre-2021/post-2025 使用均为 false；
- 未成熟标签零填充和未观察月份零填充均为 0/false。

36 个月主评估为 1,125 部、12,039 case：

- learnedGlobal common-reversal WAPE/bias：
  `0.44022495 / -0.12377106`；
- raw TSB WAPE/bias：`0.54346231 / 0.22068122`；
- pre-fallback blend WAPE/bias：`0.45348237 / 0.03777402`；
- blend business loss 改善 `4.10%`，但 WAPE 恶化 `3.01%`；
- raw/blend absolute WAPE FVA：
  `-0.10323736 / -0.01325742`；
- 拒绝后 selected-pipeline FVA 为 `0`，只表示安全回退。

生命周期结果：

- active WAPE：`0.36836955 → 0.40697875`，恶化 `10.48%`；
- intermittent WAPE：`0.82752663 → 0.70411859`，改善 `14.91%`；
- dormant WAPE：`1.00000000 → 1.82646345`，恶化 `82.65%`；
- dormant bias 从 `-1` 改为 `-0.12830012`，但不能用 bias 改善替代绝对误差。

组件诊断：

- occurrence Brier/log loss：`0.02951497 / 0.66099129`；
- positive-amount 条件 WAPE/bias：`0.54127579 / 0.21852003`；
- reversal WAPE/bias：`1.00794961 / -0.89110354`；
- 中央 80% 区间覆盖：`0.79774068`。

严格短周期 74,320 case 上 blend WAPE 为 `0.44487050`，learnedGlobal 为
`0.41191878`，恶化 `8.00%`。11 个季度 origin 各为一个非相邻时间块，仅 3 个
改善。作品聚类 bootstrap 的相对 WAPE 95% 区间为 `[-2.85%, 9.26%]`。

5,203 个 exact-v0.3 重叠 case 使用相同 work fold 选择、没有按 overlap 指标重选：

- exact v0.3 WAPE：`0.37610234`；
- learnedGlobal common-reversal WAPE：`0.27723899`；
- blend WAPE：`0.26352433`。

这个同窗子集改善不能覆盖总体、active/dormant、bootstrap 和时间块失败，也不是
独立 later-origin。最终决定为 `TSB_OCCURRENCE_DEVELOPMENT_FAIL`，参数空间、
公式和失败结论冻结；不得现场开发第二候选。

## v1.0 与 FVA 语义

v1.0 的 17.16% development 相对改善只支持“人工公式主干 + 全局校准”方向具有
研究价值，不构成成熟或发布证据。v1.0 的 raw/candidate/selected FVA 已分开：

- learnedGlobal → hierarchicalPositive candidate FVA `-0.015177`；
- selected hierarchy → occurrenceAndReversal candidate FVA `-0.001034`；
- selected-pipeline 的 0 是回退值，不是候选层真实增量。

本轮 TSB 候选沿用同一语义：raw TSB、pre-fallback blend 和 selected pipeline
分开报告；回退后的 0 不得掩盖负 candidate FVA。

## later-origin 独立性

独立 later-origin 资格仍为：

- `decision=NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN`
- `metricsRead=false`
- `laterOriginConsumed=false`
- `trainingPerformed=false`
- 最早可能时间独立的 origin 为 2026-01；
- 36 个月标签要求账单完整到 2029-01；
- 原运行时 frozen v1 state 仍缺失并继续作为阻断项。

2023-01 至 2023-04 是一个连续时间块，因 2023-03 已用于既有辅助评估且选择证据
使用到 2025-12，整块不独立。本轮没有打开、拆分或读取该块。

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

本轮一次 TSB 候选 development 授权已经执行完毕。provider、远端/共享/
staging-like 数据库、Canary、full160、release 和 M3 formal 继续未授权。代码
合并不等于模型发布。

## 当前入口

- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-decision-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-code-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-public-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.13.json`
- `docs/analysis/m2-current/M2-current-human-anchored-fva-semantics-remediation-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

v0.19 及更早 current-state 文件保留作历史审计，不是新的执行入口。PR #7 的
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
TSB synthetic diagnostic、其他公共诊断或启动。
