# M2 当前状态索引 v0.22

日期：2026-07-27

状态：current repository governance entry

## 唯一当前结论

M2 只预测未来分成收入现金。买断、其他非分成现金和 commitment 均在模型外；
pure-buyout 必须 `null abstain`。人工拆分的分成账单继续是特征、标签和 actual
的唯一现金权威，exact v0.3 继续是作品级 fallback。

本轮 channel/mechanism hierarchical challenger 已按用户授权完成真实 private
development 训练、bounded nested selection、A0–A6 primary/strict/top-revenue
全量评价，并被门禁拒绝。它不得替换 learnedGlobal development baseline 或 exact
v0.3；不得进入自动化、Canary、final holdout 或 release。

v0.21 的 lifecycle-aware、commercial-state source audit、v1.0、TSB occurrence
和 later-origin 结论全部继续有效。本文件只增加本轮已冻结的 channel expert
证据和最新导航。

## Channel/mechanism hierarchical challenger v0.1

实现边界：

- canonical core：
  `src/domain/m2Current/channelExperts.js`；
- 复用既有 human-anchored materializer、runner、learnedGlobal 参数学习和共同
  reversal 层；
- production loader、route 和 API 均未导入 challenger；
- 允许的 development-only 静态特征仅为 canonical channel identity、用户确认的
  revenue mode 和作品固有二级分类；
- 未来首次出现渠道只作 label-only 误差归因，预测恒为 0，身份不进入特征；
- A6 shrinkage strength 仅在各 outer training 内的确定性 inner work holdout
  从 `{20, 80, 240}` 选择；outer validation、exact v0.3、later-origin 和 final
  holdout 均未进入选择。

work-channel 物化：

- primary：12,039 个 work-origin-horizon case；
- auxiliary：97,490 个成熟 case，strict 实际评分 74,320 个 case、11 个 origin；
- 物化 387,175 条 work-channel label，其中 287,914 条渠道在 origin 已观察；
- 99,261 条未来首次出现渠道为 label-only；
- positive、reversal、net 三项逐 work case 守恒差均为 0；
- buyout、pre-2021、post-2025、未成熟标签补 0 使用均为 false；
- 五个平台 observed label 总数为：喜马拉雅 98,763、微信读书 10,001、
  番茄畅听 32,579、猫耳 3,326、漫播（canonical 为克拉漫播）695。

预注册 ablation：

| ID | 含义 | primary WAPE | primary bias | 相对 A0 | strict WAPE | strict bias | 相对 A0 |
|---|---|---:|---:|---:|---:|---:|---:|
| A0 | learnedGlobal work baseline | 0.44022495 | -0.12377106 | — | 0.41191878 | -0.03847401 | — |
| A1 | learnedGlobal 逐渠道精确分解/重组 | 0.44022495 | -0.12377106 | 0.00% | 0.41191878 | -0.03847401 | 0.00% |
| A2 | raw membership/advertising/transactional experts | 0.44893186 | -0.04262673 | +1.98% | 0.41847102 | -0.01612311 | +1.59% |
| A3 | mechanism calibrated experts | 0.45885403 | -0.08161723 | +4.23% | 0.54680086 | 0.24602743 | +32.74% |
| A4 | five-platform partial pooling | 0.45901148 | -0.07957886 | +4.27% | 0.59230448 | 0.30641822 | +43.79% |
| A5 | platform-specific intrinsic-category taxonomy | 0.58080898 | -0.14853127 | +31.93% | 0.66353355 | 0.35974293 | +61.12% |
| A6 | nested-selected hierarchical shrinkage | 0.53776683 | -0.12709804 | +22.16% | 0.65865324 | 0.35717601 | +59.90% |

A0 与 A1 在 primary 和 strict 的最大绝对差均为 0，证明 learnedGlobal 的逐渠道
贡献分解严格守恒。A2 虽改善 bias，但 WAPE 在两个窗口都恶化；A3/A4 出现显著
strict 正偏，A5/A6 的 category hierarchy 进一步恶化，不能解释为模型升级。

机制层 A0→A6 WAPE：

| 机制 | primary | strict |
|---|---:|---:|
| membership | 0.42309139 → 0.52550457 | 0.41635043 → 0.57900022 |
| advertising | 0.80449907 → 1.06713660 | 0.59979272 → 0.73308934 |
| transactional | 0.95990729 → 1.35588654 | 0.85560236 → 2.38266632 |

平台层 A0→A6 WAPE：

| 平台 | primary | strict |
|---|---:|---:|
| 喜马拉雅 | 0.39416124 → 0.50117465 | 0.36091878 → 0.50129999 |
| 微信读书 | primary 无已观察可评分渠道 | 0.63428753 → 0.99519487 |
| 番茄畅听 | 0.80449907 → 1.06713660 | 0.59916049 → 0.73252642 |
| 猫耳 | 0.99315479 → 1.38400942 | 0.86301914 → 2.59102473 |
| 漫播 | 0.63651007 → 1.08233635 | 0.81077238 → 1.23266627 |

Top-revenue 也没有支持升级：

| 收入层 | primary A0→A6 | strict A0→A6 |
|---|---:|---:|
| top 1% | 0.21139493 → 0.38885953 | 0.16492920 → 0.35584053 |
| top 5% | 0.28610442 → 0.42039498 | 0.25168161 → 0.50564311 |
| top 10% | 0.31951057 → 0.44417879 | 0.25829057 → 0.50598434 |

最终决定：

- `CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3`
- `M2_NOT_MATURE`
- work-channel 与 A0/A1 守恒门禁通过；
- primary/strict 相对改善、primary 绝对 WAPE、primary 绝对 bias 和独立
  later-origin 门禁失败；
- A0–A6 raw 结果、五个平台模型、taxonomy 路由、inner selection 与失败结论
  全部冻结，不得用 post-hoc fallback 隐藏，不得继续同窗调参。

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

本轮 channel expert 的 local private development 训练与 bounded nested selection
授权已经执行完毕，不再授予新的同窗候选或调参。provider、远端/共享/staging-like
数据库、Canary、full160、release 和 M3 formal 继续未授权。

## 当前入口

- `docs/analysis/m2-current/M2-current-channel-experts-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-current-channel-experts-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-channel-experts-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-channel-experts-public-diagnostic-v0.1.json`
- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.21.md`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

v0.21 及更早 current-state 文件保留作历史审计，不是新的执行入口。PR #7 的
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
channel-expert synthetic diagnostic、其他公共诊断或启动。
