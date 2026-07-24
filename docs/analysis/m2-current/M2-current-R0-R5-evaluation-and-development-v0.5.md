# M2 current R0–R5 评估与开发复验 v0.5

> 历史检查点：当前正式目标已于 2026-07-25 改为纯分成收入。当前入口为
> `M2-v2-current-state-index-v0.12.md`。

日期：2026-07-24
状态：`CANDIDATE_DEVELOPMENT_FAIL_BLOCKED`
用途：冻结 development 诊断；不是 final holdout、Canary 或 release 结论

## 结论

R0–R5 评估能力已经实现，但本轮没有产生可升级的新模型。全局 hurdle GLM、
Tweedie gradient boosting、hurdle GBM、MinT 和受约束 ensemble 均经过严格
earlier-origin 选择；没有一个家族稳定通过 nested WAPE 与 bias 门禁。因此
`M2-current-global-distributional-ensemble-v0.4` 在所有五个权威 outer origin
都回退到 exact v0.3：

| 模型或结果 | WAPE | signed bias | 结论 |
|---|---:|---:|---|
| B4 | 0.55648454 | 0.08910997 | comparator |
| v0.3 | 0.50557140 | -0.01198958 | 当前 development champion |
| v0.4 gated result | 0.50557140 | -0.01198958 | exact v0.3 fallback |
| global hurdle GLM | 1.14324252 | 0.14962976 | 失败 |
| Tweedie boosted stumps | 3.01164614 | 2.47005885 | 严重失败 |
| hurdle boosted stumps | 0.86512643 | -0.73304615 | 失败 |

v0.4 相对 v0.3 的 relative WAPE 和 paired CI 均为 0。这不是“新模型与 v0.3
同样优秀”，而是所有 challenger 被门禁拒绝后返回 v0.3。当前 champion 不变，
绝对 WAPE 仍高于 0.30；intermittent WAPE 0.90732841，dormant WAPE/bias
1.00018361 / -0.99972006。自动化结论保持 `AUTOMATION_BLOCKED`。

## R0：目标与数据合同

正式目标没有改变：

1. `forecastableCashActual = sales cash + cutoff-known committed cash`；
2. 未承诺 future buyout 属于 surprise，不进入预测；
3. pure-buyout 没有同作品、已签署、已确认、证据在 cutoff 前可得且预计入账月
   位于 horizon 内的 commitment snapshot 时，必须 `null abstain`；
4. occurrence 定义为 `forecastableCashActual > 0`；负现金保留在金额误差中，
   但 occurrence 记为 0；
5. 只有在 evaluation cutoff 已成熟且可得的 label 才评分；未闭合窗口为
   `right_censored`，业务排除与无效 label 分开记录。

commitment snapshot 现在强制校验：

- exact `standardWorkId` 与 `commitmentId`；
- `signedAsOf <= confirmedAsOf <= availableAsOf <= origin`；
- `outstandingAmount <= confirmedAmount`；
- `expectedPostingMonth` 位于预测 horizon；
- `status=confirmed`、`signed=true`、`auditable=true`；
- 至少一个 evidence reference。

旧 120 部人工评估已按用户决定完全跳过：不重建、不重放、不生成新样本；历史
JSON 只保留追溯，不是 current 依赖。

## R1：评估器

权威 7,851-case population 原来只有五个半年 origin。本轮不再把它错误描述为
“月度 rolling-origin”。新增次级 development diagnostic：

- 824 部冻结 work；
- 2020-12 至 2022-12，共 25 个逐月 origin；
- 3/6/12 月 horizon；
- label 最晚到 2023-06；
- 56,856 个成熟 case；
- 47,611 个 sales-route scoreable case；
- 9,245 个 route abstention case；
- 不移动权威 824/7,851 决策人口。

月度诊断只读取 Git ignored 的已验证 authority cache，复用既有 formal-cash
truth 与 route 实现；没有 provider、数据库、final holdout、embargo shadow 或
60-month deferred label。

评估器现已报告：

- outer rolling origin 与 inner rolling selection；
- work×origin paired bootstrap 及 segment/horizon CI；
- WAPE、signed bias、MASE、RMSSE；
- occurrence rate 与 Brier；
- positive-amount WAPE；
- quantile score、WIS、CRPS approximation；
- eligibility、cash observability、served、abstention、risk–coverage。

## R2：强基线

强制 comparator 现在包括：

- zero；
- seasonal naive；
- classic Croston；
- SBA；
- TSB；
- ADIDA；
- B4；
- v0.3。

新模型不能因为胜过一个随意弱基线而升级。它必须在同 case、同 origin、同成熟
标签上通过 nested selection，并稳定胜过当前 champion。月度 rolling baseline
champion 的结果为：

- WAPE 0.66335800；
- signed bias -0.30206120；
- Brier 0.24324211；
- 80% interval coverage 0.64363277。

这说明简单基线也不可用，同时揭示稀疏 origin 上的 0.5056 不能代表逐月稳定性。

## R3：复合候选

三个全局共享家族全部使用严格 as-of history：

1. regularized hurdle GLM：logistic occurrence × positive log-amount；
2. Tweedie compound-mean gradient boosted stumps；
3. hurdle GBM：logistic occurrence × boosted positive amount。

超参数只在 outer origin 之前的 inner origins 选择。预测加非负与 as-of
history cap，防止极端外推；cap 不读取 outer actual。结果表明：

- occurrence Brier 约 0.058–0.060，看似较好；
- 金额部分严重失效，足以使总 WAPE 和 bias 不可接受；
- “发生概率可估”不等于“现金金额可估”；
- 当前主要瓶颈是 positive amount、复活事件和业务可观察性，不是分类器缺失。

## R4：概率、conformal 与层级协调

v0.4 生成 0.05/0.10/0.25/0.50/0.75/0.90/0.95 quantiles，并只使用更早成熟
residual 做 rolling split conformal。权威冻结人口结果：

| 指标 | 结果 |
|---|---:|
| WIS | 4366.44338848 |
| CRPS approximation | 4366.44338848 |
| 90% interval coverage | 0.89542733 |
| 80% interval coverage | 0.82397147 |
| 50% interval coverage | 0.55254108 |

总体 coverage 接近 nominal 不能覆盖点预测失败。dormant 的 80% calibration
error 仍为 0.05354；月度诊断的 80% coverage 只有 0.64363，说明时间漂移下
区间明显过窄。

MinT 使用 total→dense/intermittent/dormant 层级和 strictly earlier residual
variance。每个 cell 都实现非负 coherent reconciliation，但 nested application
在五个 outer origin 上都选择 weight 0，因此 MinT 只保留为已验证 challenger，
没有改写 current champion。

## R5：risk–coverage、业务损失与 FVA

自动化 gate 同时要求绝对 WAPE、segment WAPE、80% calibration、相对 champion
稳定改善和 full-coverage evaluation。结果：

- absolute WAPE：失败；
- each-segment WAPE：失败；
- 80% calibration：通过；
- stable improvement vs v0.3：失败；
- full coverage evaluation：完成；
- 最终：`AUTOMATION_BLOCKED`。

FVA 以不对称业务损失（低估 1.5、过估 1.0、abstention 2.0）计算：

| comparator | business-loss FVA | WAPE FVA |
|---|---:|---:|
| v0.3 | 0 | 0 |
| B4 | 5.70% | 9.15% |
| strongest simple baseline | 57.67% | 49.44% |

结果只证明 v0.3 比旧 comparator 和简单基线好，不能证明其绝对可用。

## 为什么复杂模型没有解决问题

1. **可识别信号不足。** dormant 复活主要由少数事件主导，cutoff 时没有稳定、
   可审计的驱动变量。
2. **发生与金额难度不同。** Brier 尚可，但 positive amount 的重尾误差和
   underforecast 使总现金失效。
3. **权威 origin 太稀。** 五个半年 origin 会弱化月间漂移；25-origin 诊断暴露
   WAPE、bias 和 interval coverage 的明显恶化。
4. **cash observability 仍不足。** 全库/Top10 约 73.96%/75.94%，低于 90%。
5. **层级协调不创造信息。** MinT 能强制 coherence，但无法弥补缺失的
   as-of signal 或错误的 bottom-level amount。
6. **模型家族不是主要约束。** GLM、Tweedie、GBM 均失败，继续堆叠同类模型
   很可能只是增加方差和治理负担。

## 下一步开发方向

下一 readiness 为
`AUDITABLE_AS_OF_SIGNAL_AND_CASH_OBSERVABILITY_REQUIRED`。在补充数据前，
停止新增候选家族和大规模调参。优先级：

1. 建立真实、版本化、exact-work 的 cutoff commitment snapshot；
2. 为 sales cash 补充 cutoff 时可得的可审计驱动变量，例如已发布集数、可售状态、
   合同状态变化和渠道运行状态；没有历史 snapshot 的 current 状态不得回填；
3. 对 intermittent/dormant 建立 occurrence 与 positive amount 的数据缺口 ledger，
   量化每项新信号能覆盖多少 work/origin；
4. 信号进入后先在 25-origin 次级诊断验证，再回到 7,851-case 权威人口做 nested
   challenger；没有稳定胜过 v0.3 时继续 fallback；
5. 只有绝对质量、segment、risk–coverage 和业务损失都通过，才讨论 final
   holdout 授权；Canary、release 和 M3 formal 仍是独立授权。

## 理论依据

- rolling-origin 与多 test period：
  [Tashman (2000)](https://doi.org/10.1016/S0169-2070(00)00065-0)
- Croston bias 与 SBA：
  [Syntetos & Boylan (2001)](https://doi.org/10.1016/S0925-5273(00)00143-2)
- proper scoring rules、Brier 与 CRPS：
  [Gneiting & Raftery (2007)](https://doi.org/10.1198/016214506000001437)
- conformalized quantile regression：
  [Romano, Patterson & Candès (2019)](https://proceedings.neurips.cc/paper/2019/hash/5103c3584b063c431bd1268e9b5e76fb-Abstract.html)
- MinT：
  [Wickramasuriya, Athanasopoulos & Hyndman (2019)](https://robjhyndman.com/publications/mint/)
- Forecast Value Added：
  [Gilliland, FVA reality check](https://forecasters.org/wp-content/uploads/FVA_A-Reality-Check_Foresight29.pdf)

## 可复现入口

公共电脑：

```bash
npm run verify:m2:current
```

具备已验证 private authority capability 的本地 development：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

公开证据：

- `docs/analysis/m2-current/M2-current-global-distributional-candidate-v0.4.json`
- `docs/analysis/m2-current/M2-current-automated-evaluation-v0.2.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.5.json`

private rows、dense cases、history 和 manifests 均留在 Git ignored
`data/private-output/**`。公共 clone 不需要它们，公共诊断只读取已提交的聚合证据。
