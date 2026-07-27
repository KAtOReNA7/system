# M2 当前状态索引 v0.24

日期：2026-07-27

状态：current repository governance entry

## 唯一当前结论

M2 只预测未来分成收入现金。买断、其他非分成现金和 commitment 均在模型外；
pure-buyout 必须 `null abstain`。人工拆分的分成账单继续是特征、标签和 actual
的唯一现金权威，exact v0.3 继续是作品级 fallback。

channelExperts v0.1 的冻结失败和 architecture audit 结论继续有效：

```text
CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3
CHANNEL_EXPERT_V01_IMPLEMENTATION_MISMATCH_CONFIRMED
```

本轮只完成 Channel Generative v0.2 最小可证伪预注册：

```text
GENERATIVE_V02_PREREGISTRATION_COMPLETE_IMPLEMENTATION_NOT_AUTHORIZED
```

没有实现、训练、调参或读取 v0.2 候选结果。当前仍为：

```text
implementationAuthorizationRequired=true
safeToStartImplementation=false
```

## 冻结的最小候选

- `G0`：frozen learnedGlobal channel component 与 common reversal，不重拟合；
- `G1`：三个 mechanism parent 的独立逐未来月
  occurrence × conditional-amount generator，不使用 G0 offset；
- `G2`：occurrence 独立；conditional amount 只使用 frozen G0 作为
  `log1p` structured offset，学习随未来月变化且向 0 收缩的 residual；
- `G3`：outer training 内选择 raw core 与 alpha 的 convex blend，只作部署风险
  诊断，不构成理论证据；
- `G4`：mechanism parent + bounded platform parameter deviation；
- `G5`：taxonomy 只作 generator parameter prior；
- `G6`：eligible generator + frozen G0 fallback composition。

G1/G2 必须分别完整报告。platform 或 taxonomy 均不得成为金额倍率。

## 顺序停止

顺序固定为：

```text
core → platform → taxonomy → composition
```

- 没有 G1/G2 raw candidate 同时通过 primary、strict、horizon、strict time
  block、top-revenue、bias、paired uncertainty、coverage 和 mechanism safety
  门时，状态为 `GENERATIVE_V02_CORE_FAIL`，停止 G4–G6；
- raw fail、G3 blend-only pass 只能记为
  `RAW_CORE_FAIL_BLEND_ONLY_SIGNAL`，仍在 core 停止；
- G4 只有在 raw core pass 且取得新授权后才可开始；
- G5 只有在 G4 相对 raw core 的 incremental gate 通过且取得新授权后才可开始；
- G6 只有在 G5 incremental gate 通过且取得新授权后才可开始；
- 任一层失败必须保留 raw 结果和前一层，不得由 routing/fallback 隐藏。

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
继续未授权。production loader、route、API、exact v0.3、frozen A0–A6 均未修改。

## 当前入口

- `docs/analysis/m2-current/M2-current-channel-generative-v0.2-preregistration.md`
- `docs/analysis/m2-current/M2-current-channel-generative-v0.2-preregistration.json`
- `docs/analysis/m2-current/M2-current-channel-experts-architecture-failure-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-channel-experts-architecture-failure-audit-v0.1.json`
- `docs/analysis/m2-current/M2-current-channel-experts-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-channel-experts-public-diagnostic-v0.1.json`
- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.23.md`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

v0.23 及更早 current-state 文件保留作历史审计，不是新的执行入口。PR #7 的
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

缺少 private 只能阻断对应 capability；不得阻断公共 clone、安装、测试、
synthetic diagnostic、其他公共诊断或启动。
