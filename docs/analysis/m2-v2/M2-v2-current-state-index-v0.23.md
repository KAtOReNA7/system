# M2 当前状态索引 v0.23

日期：2026-07-27

状态：current repository governance entry

## 唯一当前结论

M2 只预测未来分成收入现金。买断、其他非分成现金和 commitment 均在模型外；
pure-buyout 必须 `null abstain`。人工拆分的分成账单继续是特征、标签和 actual
的唯一现金权威，exact v0.3 继续是作品级 fallback。

channel/mechanism hierarchical challenger v0.1 的 development 失败决定继续
保持：

```text
CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3
```

本轮只读 architecture failure audit 没有重跑训练、调参或修改冻结 A0–A6。
它确认 v0.1 实现与“独立渠道时间生成器”理论不一致：

```text
CHANNEL_EXPERT_V01_IMPLEMENTATION_MISMATCH_CONFIRMED
```

v0.1 实际把 learnedGlobal 已生成的渠道正向现金分量乘以机制 factor 和一个金额
calibration scale；taxonomy 是直接金额 ratio correction 及其 shrinkage，不是
生成器参数 prior。第一处 WAPE 恶化在 A1→A2；primary 最大增量来自 A4→A5，
strict 最大增量来自 A2→A3。该审计不证明原渠道生成理论正确，只支持下一步：

```text
PREREGISTER_GENERATIVE_V02
```

该决定只允许预注册，不授权 v0.2 实现、训练、调参、候选选择、final holdout 或
release。

## 资产处置

继续复用：

- work-channel 物化和 positive/reversal/net 三项守恒；
- future-first-seen-channel exclusion；
- canonical platform mapping、mechanism taxonomy 和 nested work folds；
- learnedGlobal channel decomposition，作为 G0、守恒 comparator 和
  unsupported-cell fallback；
- common reversal 层。

经修正后复用：

- content taxonomy，只能作为生成器参数的 hierarchical prior；
- A0–A6 evaluation harness，保留切分与评分，下一候选须改成 G0–G6 生成器
  ablation；
- public/private reporting。

从下一候选退役：

- current scalar shrinkage；
- factor/calibration multiplier implementation；
- five-platform scalar partial pooling。

三个 raw mechanism factor 只保留作 v0.1 failure diagnostic。

## 当前业务与授权 gate

- `currentDecision=CANARY_FAIL`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=LATER_ORIGIN_NOT_QUALIFIED_2029_01_COMPLETE_LABELS_AND_ORIGINAL_FROZEN_STATE_REQUIRED`
- `developmentReplayAuthorized=true`
- `modelTrainingAuthorized=false`
- `newCandidateFamilyDevelopmentAuthorized=false`
- `candidateSelectionAuthorized=false`
- `laterOriginValidationExecuted=false`
- `finalHoldoutAuthorized=false`
- `full160Authorized=false`
- `releaseAuthorized=false`

provider、远端/共享/staging-like 数据库、Canary、full160、release 和 M3 formal
继续未授权。production loader、route、API 和 exact v0.3 均未修改。

## 当前入口

- `docs/analysis/m2-current/M2-current-channel-experts-architecture-failure-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-channel-experts-architecture-failure-audit-v0.1.json`
- `docs/analysis/m2-current/M2-current-channel-experts-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-current-channel-experts-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-channel-experts-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-channel-experts-public-diagnostic-v0.1.json`
- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.22.md`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

v0.22 及更早 current-state 文件保留作历史审计，不是新的执行入口。PR #7 的
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

缺少 private 只能阻断对应 private audit capability；不得阻断公共 clone、安装、
测试、channel-expert synthetic diagnostic、其他公共诊断或启动。
