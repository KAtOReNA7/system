# M2 当前状态索引 v0.49

截至 2026-07-30，LG01 头部现金残差校准模型 v0.1
（LG01 Head-Cash Residual Calibration Model v0.1，`M2-WORK-HCRC01`）的
首个完整私有开发结果已经冻结。最终机器状态为开发失败
（`M2_LG01_HEAD_CASH_RESIDUAL_FAIL`）。

失败不是因为缺少私有权威源，也不是因为模型输出了非有限值，而是因为全部 16 个
外层选择单元都没有任何合格的混合系数（alpha）。全局有界残差混合
（Global Bounded Residual Blend，
`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`）与头部现金带保护的有界残差混合
（Head-Cash-Band Protected Bounded Residual Blend，
`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`）都没有形成原始候选案例；
回退后管线全部等于冻结 LG01，不能创造通过。

## 当前角色与结论

| 对象 | 当前状态 | 中文解释 |
|---|---|---|
| HCRC01 首个完整结果 | `M2_LG01_HEAD_CASH_RESIDUAL_FAIL` | 两个新实验臂都没有原始候选证据，开发门禁失败；不得重跑或同窗调参 |
| HCRC01 活动候选 | `null` | 失败模型没有晋升 |
| HCRC01 自动化批准 | `null` | 没有自动化、production 或发布权限 |
| 现行运行回退 | `M2-WORK-OA03` | 作品发生—金额校准模型 v0.3 继续只是兼容性现行运行回退 |
| 研究比较基线 | `M2-WORK-LG01` | 冻结 LG01 继续是研究比较基线，不等于 production champion |
| CHAM01 性能结论 | `M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL` | 3、6、12 个月性能失败保持冻结，没有重跑或改写 |
| CHAM01 数值稳定性 | `M2_CHAM01_PRIMARY_CORE90_NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION` | 五个有限极端外推单元格继续单独登记；数值失败与性能失败不是同一结论 |

## 一页业务答案

1. **三个月小幅信号仍只存在于冻结诊断参考。** 冻结 CHAM01 B3 三个月诊断参考
   （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`）在 Strict Core80 的配对 FVA
   点估计为 2.66%，但作品聚类 bootstrap 95% 区间为
   `[-15.32%, 21.41%]`，跨 0；两个新候选没有把它转化为原始输出。
2. **没有证明保护 H50 头部现金。** 两个新候选的原始 H50 案例数均为 0。
   冻结参考的 H50 只有 9 部作品，误差金额按隐私合同抑制公开，不能宣称门禁通过。
3. **没有消除系统性低估。** 冻结 CHAM01 B3 的 signed bias 为
   `-0.0498485`，比冻结 LG01 的 `-0.0269017` 更负；两个新候选没有原始 bias。
4. **不能认定彻底避免 Primary 极端外推。** 冻结 CHAM01 B3 的
   Primary/Core90 仍有 396/396 个数值失败案例。两个新候选没有传播极端值，
   是因为没有合格原始输出并全量回退，不是候选数值稳定性通过的证据。
5. **结果是开发失败，不是未确认的正信号。** 当前状态为
   `M2_LG01_HEAD_CASH_RESIDUAL_FAIL`。
6. **下一步停止这条同窗方向。** 不应继续在同一现金特征和同一评价窗内做残差微调，
   也不应自动增加实验臂或启动 later-origin。

## Strict Core80 三个月主评价

| 实验臂（完整作用域） | 结果版本 | cases | WAPE | signed bias | 配对 FVA | bootstrap 95% | 改善 time block |
|---|---|---:|---:|---:|---:|---:|---:|
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） | 原始/回退后相同 | 577 | 0.258167 | -0.0269017 | 0.00% | [0.00%, 0.00%] | 0/11 |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） | 原始 | 577 | 0.251288 | -0.0498485 | 2.66% | [-15.32%, 21.41%] | 6/11 |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 原始 | 0 | — | — | — | — | — |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 回退后 | 577 | 0.258167 | -0.0269017 | 0.00% | [0.00%, 0.00%] | 0/11 |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 原始 | 0 | — | — | — | — | — |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 回退后 | 577 | 0.258167 | -0.0269017 | 0.00% | [0.00%, 0.00%] | 0/11 |

冻结 CHAM01 B3 的最大单作品绝对误差占比为 23.48%，冻结 LG01 为 14.24%；
top 10 作品绝对误差占比为 65.34% 对 58.65%。两项都恶化，不能由总体 WAPE
小幅下降掩盖。

## Strict Core90 三个月敏感性

| 实验臂（完整作用域） | 结果版本 | cases | WAPE | signed bias | 配对 FVA | fallback |
|---|---|---:|---:|---:|---:|---:|
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） | 原始/回退后相同 | 1,288 | 0.280318 | -0.0424386 | 0.00% | 0 |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） | 原始 | 1,288 | 0.267361 | -0.0607260 | 4.62% | 0 |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 原始 | 0 | — | — | — | 1,288 |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 回退后 | 1,288 | 0.280318 | -0.0424386 | 0.00% | 1,288 |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 原始 | 0 | — | — | — | 1,288 |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 回退后 | 1,288 | 0.280318 | -0.0424386 | 0.00% | 1,288 |

## 起点可见现金带

| 冻结参考 / 现金带 | cases / works | 起点现金覆盖 | WAPE | signed bias | 绝对误差 | 相对 LG01 改善 |
|---|---:|---:|---:|---:|---:|---:|
| 冻结 LG01 / H50 | 60 / 9 | 51.76% | 隐私抑制 | 隐私抑制 | 隐私抑制 | 隐私抑制 |
| 冻结 CHAM01 B3 / H50 | 60 / 9 | 51.76% | 隐私抑制 | 隐私抑制 | 隐私抑制 | 隐私抑制 |
| 冻结 LG01 / M30 | 196 / 44 | 28.65% | 0.321739 | 0.0871283 | 2,637,482.15 | 0.00% |
| 冻结 CHAM01 B3 / M30 | 196 / 44 | 28.65% | 0.253164 | 0.0784116 | 2,075,335.15 | 21.31% |
| 冻结 LG01 / L20 | 321 / 70 | 19.59% | 0.343500 | -0.189888 | 2,656,838.74 | 0.00% |
| 冻结 CHAM01 B3 / L20 | 321 / 70 | 19.59% | 0.291560 | -0.135567 | 2,255,103.78 | 15.12% |

全局有界残差混合与头部现金带保护的有界残差混合在 H50、M30、L20 的原始
案例数均为 0，因此上表中的冻结参考局部信号不能作为新候选通过证据。

## Primary/Core90 数值诊断

| 实验臂（完整作用域） | raw cases | WAPE / signed bias | prediction/base max | 数值失败 | 解释 |
|---|---:|---:|---:|---:|---|
| 冻结 LG01 三个月同案例基线（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`） | 396 | 0.312766 / -0.203467 | 1.0 | 0 | 数值稳定 |
| 冻结 CHAM01 B3 三个月原始诊断参考（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`） | 396 | 1.50560e+52 / 1.50560e+52 | 1.69024e+55 | 396 | 冻结有限极端外推失败 |
| 全局有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`） | 0 | — | — | 0 | 396 个案例全部回退；无 raw 证据 |
| 头部现金带保护的有界残差混合（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`） | 0 | — | — | 0 | 396 个案例全部回退；无 raw 证据 |

公开评价 JSON 中冻结 CHAM01 B3 的通用聚合字段仍显示
`NUMERIC_STABILITY_PASS`，但同一行同时保存了 396 个数值失败计数。当前解释以
未改写的冻结 CHAM01 数值披露为准：
`NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`。该聚合字段不能覆盖原始
失败事实；两个新候选的 0 个 raw case 也不能解释为候选稳定性通过。

## CHAM01 有限极端外推披露

原始冻结 JSON、预测和审计记录均未改写、截断、置零或重跑。

| 周期 / 实验臂 | cases | WAPE | signed bias | MAE | median AE | 最大单作品误差占比 |
|---|---:|---:|---:|---:|---:|---:|
| 3 个月 / B1 | 396 | 5.49443e+33 | 5.49443e+33 | 1.52448e+38 | 1,986.38 | 100.00% |
| 3 个月 / B2 | 396 | 2.73967e+61 | 2.73967e+61 | 7.60146e+65 | 2,160.19 | 100.00% |
| 3 个月 / B3 | 396 | 1.50560e+52 | 1.50560e+52 | 4.17742e+56 | 2,119.00 | 100.00% |
| 6 个月 / B1 | 396 | 9.36648e+12 | 9.36648e+12 | 5.10270e+17 | 4,597.69 | 约 100.00% |
| 6 个月 / B2 | 396 | 8.27111e+28 | 8.27111e+28 | 4.50597e+33 | 4,717.40 | 100.00% |

根因是 fold-local 标准化没有外层支持范围/预测比率护栏，超出支持范围的变换空间
外推又被无界 `signed-expm1` 逆变换放大；不是空支持、非有限传播或序列化损坏。
这不改变既有 3、6、12 个月性能失败，但构成独立的数值稳定性失败。

## 执行完整性与私有能力

- 不可替代权威输入可用（`SOURCE_AUTHORITY_AVAILABLE`）。
- 冻结派生缓存起始为可重建缓存缺失（`CACHE_MISS_REBUILDABLE`），已由冻结代码
  自动重建并封存（`CACHE_MISS_REBUILT_AND_FROZEN`）。
- 历史运行收据可用（`PROVENANCE_AVAILABLE`），但它不是执行输入或跨电脑前提。
- 第一次尝试在任何完整指标形成前因 trailing-12 接线错误停止；收据记录为
  `PRE_OUTCOME_INFRASTRUCTURE_FAILURE_RETRY_ALLOWED`，没有消耗科学窗口。
- 接线修复后的评价提交为 `728b602a3c921560b7db65f3b1988709a35df0c5`，
  Linux/Windows CI run `30552523854` 均成功，并形成唯一的首个完整结果。
- 首个完整结果写入私有冻结 manifest 后，公开报告因 bootstrap 方法元数据误触
  防泄漏守卫而中止。结果保持冻结、禁止重跑；报告恢复提交
  `f8c1443899bbaadb280582d942050f5f10e94f3a` 的 Linux/Windows CI run
  `30556104936` 均成功。
- 当前公开报告只在逐文件字节数与 SHA-256 绑定核验后读取 16 个冻结评价单元格和
  16 个冻结选择单元格，状态为
  `POST_OUTCOME_PUBLIC_REPORT_RECOVERED_NO_REEVALUATION`；没有重新执行模型或
  bootstrap。
- 行级作品、actual、预测、选择、bootstrap、manifest 和收据继续留在 Git ignored
  capability 目录，未进入公开 artifact。

## 当前证据

- `config/m2-current-lg01-head-cash-residual.v0.1.json`
- `docs/analysis/m2-current/M2-lg01-head-cash-residual-preregistration-v0.1.md`
- `docs/analysis/m2-current/M2-lg01-head-cash-residual-implementation-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-lg01-head-cash-residual-development-v0.1.json`
- `docs/analysis/m2-current/M2-lg01-head-cash-residual-development-v0.1.md`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-numeric-stability-disclosure-v0.1.json`
- `config/m2-model-registry.v1.json`

本索引取代 v0.48 作为当前阅读入口，但不改写 v0.48、历史 ID、schema、digest、
冻结预测或冻结成绩。本索引所在最终 exact HEAD 的 Linux/Windows CI 状态由
GitHub Actions 与 Draft PR 记录，文档不预写尚未产生的 run id。

本轮没有执行 6/12/36 个月新候选、新作品、未来首次渠道、渠道分配、taxonomy、
production、provider、数据库、later-origin、final holdout、Canary/full160、
release、M3 formal 或 PR 合并。首个完整结果已冻结，第二次评价未授权。
