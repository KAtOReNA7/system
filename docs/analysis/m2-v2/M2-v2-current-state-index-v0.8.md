# M2 v2 当前状态索引 v0.8

## 当前结论

本索引取代 v0.7 作为仓库治理入口。PR #7 的 cryptographic authority 仍由不可变的
`M2-v2-current-state-index-v0.3.json` 提供，本文件不改写其绑定。

2026-07-24 已在冻结 authority development population 上完成 M2 current v0.2
可靠预测模型开发。实现只扩展 `src/domain/m2Current/**`，没有新建 evidence
runtime、历史 runner 或平行候选流水线。

同日用户明确调整评价方向：取消独立人工数值预测基线和当前 120 部样本的强制
逐行复核。人工不再与模型比赛，只在自动化技术门禁通过后对小规模代表性最终结果
做接受、有限接受或拒绝。

当前状态：

- `currentDecision=CANARY_FAIL`
- `nextDevelopmentReadiness=AUTOMATED_BACKTEST_AND_BUSINESS_COVERAGE_REQUIRED`
- `currentCandidateDecision=PARTIAL_PASS`
- `currentCandidate=M2-current-hierarchical-robust-calibration-v0.2`
- `humanNumericBaselineRequired=false`
- `full160Authorized=false`
- `finalHoldoutAuthorized=false`
- `releaseAuthorized=false`

## 数据人口

3,053 部权威作品继续冻结为：

| 状态 | 作品数 |
|---|---:|
| 冻结模型人口 | 824 |
| 所有冻结 origin 均不可观察 | 1,610 |
| 所有可用 origin 均历史不足 | 399 |
| formal-cash route 排除 | 220 |

模型开发人口为 824 部、7,851 个 formal-cash case。全库和 Top10 现金可观察性仍为
73.96% 和 75.94%，低于 90%；该问题没有通过移动人口或猜测未承诺现金来掩盖。

## v0.2 candidate

`M2-current-hierarchical-robust-calibration-v0.2` 使用严格成熟 earlier labels，
dense 按 as-of `spike_candidate`、intermittent 按 as-of `value_band` 做带最小样本
约束的层级向下校准。dormant 没有可识别 as-of 信号时固定回退 B4。

| 指标 | B4 | v0.1 | v0.2 |
|---|---:|---:|---:|
| WAPE | 0.55648454 | 0.53184893 | 0.51114966 |
| signed bias | +0.08910997 | +0.03680632 | -0.00586227 |
| 相对 B4 WAPE | — | -4.4270% | -8.1467% |

v0.2 对 B4 的 paired work×origin bootstrap 95% CI 为
[-15.7461%, -2.9082%]。v0.2 对 v0.1 的点估计改善为 3.8919%，但 paired 95% CI
[-11.8298%, +1.0519%] 穿过零，因此不得声称 v0.2 已统计确定地优于 v0.1。

overall bias、5 个 horizon bias 和相对 B4 paired CI 均通过；dormant 未改善，
所以 development 结论仍为 `PARTIAL_PASS`。

## 120 部样本的正确角色

已生成的 120 部唯一作品包含：

- 60 部确定性代表性样本；
- 30 部最大低估诊断样本；
- 30 部最大高估诊断样本。

后两类 stress 样本使用 actual 选取，只能用于 post-hoc 误差诊断。整组样本不是
自然业务人口的代表性验收样本，也不适合要求人工进行盲视数值预测。公开仓库继续
只保留聚合分布；候选 runner 不再生成或要求 private 人工复核工作簿。

## 当前评价合同

下一阶段先建立可复现的自动化评价，不训练新候选：

1. 增加月度 rolling origin。
2. 在相同人口比较全零、seasonal naive、SBA、TSB、ADIDA、B4、v0.1 和 v0.2。
3. 分开评估现金是否发生和发生后的正金额。
4. 同时报告 WAPE、signed bias、MASE、RMSSE，并按 horizon、segment 和 route
   切片。
5. eligibility、cash observability、served coverage 和 abstention 分开报告。
6. 只接收 cutoff 时已签署、确认且可审计的 commitment snapshot；没有真实承诺
   就保持缺失或 abstain，不由模型猜测。

技术门禁通过后，才创建小规模代表性最终结果用于人工接受、有限接受或拒绝。人工
不填写预测金额，其结果不得回流调节同一批 case。

## 当前入口

公共开发：

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

具备 authority input 且只需复现 exact v0.2 时：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

该入口不再生成 private 人工复核样本。final holdout、provider、数据库、
Canary/full160、新候选训练、release 和 M3 formal 仍需各自单独授权。

当前证据：

- `docs/analysis/m2-current/M2-current-reliable-model-development-v0.3.md`
- `docs/analysis/m2-current/M2-current-reliable-candidate-v0.2.json`
- `docs/analysis/m2-current/M2-current-business-sample-diagnostic-v0.2.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.3.json`
