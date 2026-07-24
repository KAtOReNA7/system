# M2 v2 当前状态索引 v0.6

## 当前结论

本索引取代 v0.5 作为仓库治理入口。PR #7 的 cryptographic authority 仍由不可变的 `M2-v2-current-state-index-v0.3.json` 提供，本文件不改写其绑定。

2026-07-24 用户授权在本机 authority input 上执行 M2 current 受约束候选开发。授权已按以下边界完成：

- 只使用冻结的 824 部作品、7,851 个 formal-cash development case；
- B4 身份、case key、actual、horizon 和人口不变；
- 只读严格更早且在 outer origin 已成熟的标签；
- 未调用 provider、数据库，未打开 final holdout，未进入 release 或 M3 formal。

当前状态：

- `currentDecision=CANARY_FAIL`
- `nextDevelopmentReadiness=BUSINESS_SAMPLE_REQUIRED`
- `currentCandidateDecision=PARTIAL_PASS`
- `full160Authorized=false`
- `finalHoldoutAuthorized=false`
- `releaseAuthorized=false`

## 代码与测试入口

新实现只位于 `src/domain/m2Current/**`，历史 C1–C3 runner 保持 archive-only。默认测试不再运行 60 项历史 M2 replay 合同；它们由独立 `historical-m2-audit` 工作流在相关路径变化时运行，避免普通开发被重复历史证据拖慢。

公共基线继续为：

```bash
npm ci
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

本机具备 authority capability 且有授权时，复现 exact candidate：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

## 覆盖原因

3,053 部全库已对账为：

| 状态 | 作品数 |
|---|---:|
| 冻结模型人口 | 824 |
| 所有冻结 origin 均不可观察 | 1,610 |
| 所有可用 origin 均历史不足 | 399 |
| formal-cash route 排除 | 220 |

逐作品原因 ledger 保存在 Git ignored private output；公开报告只保留聚合和互补抑制后的 route 信息。现金可观察性仍是独立问题：全库 73.96%，Top10 75.94%，低于 90% 门槛。

## Current candidate

`M2-current-segmented-downward-calibration-v0.1` 的 development 结果：

| 指标 | B4 | candidate |
|---|---:|---:|
| WAPE | 0.55648454 | 0.53184893 |
| signed bias | +0.08910997 | +0.03680632 |
| relative WAPE | — | -4.4270% |

paired work×origin bootstrap 95% CI 为 [-9.4630%, -1.2818%]。3/6/12/18/24 月 horizon 的 bias 均在门槛内。dense 和 intermittent 分别相对改善 3.63% 和 10.59%；dormant 没有改善，受控复活规则未激活并回退 B4。

因此 overall/horizon/paired CI 已通过，但 dormant、业务抽检、现金可观察性、final holdout 和 release 尚未通过。不得把该候选表述为正式模型或上线批准。

## 下一步

1. 脱敏业务抽检 exact current candidate。
2. 单独建立 cutoff 可审计 commitment snapshot 数据角色。
3. 没有新 as-of 信息时，dormant 保持 B4 fallback。
4. 不再扩建证据框架或候选家族；业务抽检通过后再申请 final holdout 授权。

当前证据：

- `docs/analysis/m2-current/M2-current-quality-convergence-v0.1.md`
- `docs/analysis/m2-current/M2-current-segmented-candidate-v0.1.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.2.json`
