# M2 current 公开诊断基线 v0.1

## 结论

M2 选择的业务问题和 formal-cash 治理边界没有跑偏，跑偏的是工程投入顺序：C1–C3 已经证明继续增加模型复杂度没有形成发布级收益，而产品 runtime、覆盖率和可移植工具链此前仍未收口。因此当前方向固定为 `coverage_and_runtime_contract_before_model_complexity`。

本基线只整合仓库内已有的公开、聚合证据，不读取 private 行级数据，不连接数据库，不调用 provider，不训练模型，不打开 final holdout、embargo shadow 或 deferred labels。

## 已冻结事实

| 项目 | 当前公开证据 |
|---|---:|
| 全库作品 | 3,053 |
| formal-cash 模型作品 | 824 |
| formal-cash case | 7,851 |
| 模型作品占比 | 26.99% |
| 全库 forecastable cash coverage | 73.9647% |
| Top1 / Top5 / Top10 coverage | 78.4826% / 77.4320% / 75.9413% |
| coverage 观察线 | 90% |
| B4 WAPE / signed bias | 0.55648454 / +0.08911106 |
| C3-A WAPE / signed bias | 0.55394517 / +0.08273913 |
| C3 model quality / business coverage | FAIL / CONDITIONAL |

活动切片也说明问题不能只靠整体 WAPE 描述：dense 为 5,174 cases、WAPE 0.5017；intermittent 为 1,844 cases、WAPE 1.1640；dormant 为 833 cases、WAPE 1.0002。后两类必须单独诊断，不能继续被整体平均值遮蔽。

## 当前阻断

机器可读 gate 为 `BASELINE_ONLY_BLOCKED`，阻断项为：

- 全库和 Top10 cash coverage 均低于 90%；
- 最新模型质量仍为 FAIL，业务覆盖仍为 CONDITIONAL；
- 尚无新的 current candidate；
- final holdout 继续 sealed；
- 业务抽检和批准未完成。

这些状态不会被本次结构重构改写。`candidateSelectionAuthorized=false`、`modelTrainingAuthorized=false`、`holdoutAuthorized=false`、`releaseAuthorized=false`、`m3FormalAuthorized=false`。

## 新的 canonical core

`src/domain/m2Current/` 现在提供七个可组合、无 I/O 的边界：

- `loader`：只接收并校验公开聚合证据；
- `case`：锁定 origin、route 和 3/6/12/18/24 月 case identity；
- `target`：保持 formal-cash 三套 actual 守恒，pure-buyout 无 cutoff 承诺时返回 null abstention；
- `comparator`：强制 candidate 与 B4 case-key/actual 完全一致；
- `metrics`：point-only WAPE、signed bias 和切片计算，禁止 null→0；
- `gate`：覆盖、质量、paired-CI、seals 和业务批准 fail-closed；
- `report`：生成不含作品标识、private 路径或区间端点的公开诊断。

C1、legacy C2-R、C2-R.1、C2、C3 保留为历史 replay 和失败证据，不再作为新开发的复制模板。B4 继续是 comparator/fallback，不是 release approval。

## 可复现命令

```bash
npm run diagnose:m2:current
npm run verify:m2:current
node --test --test-concurrency=1 test/m2-current-core.test.js
```

机器可读快照见 `docs/analysis/m2-current/M2-current-public-diagnostic-baseline-v0.1.json`；其输出由公开 source files 确定性生成，可在不具备任何 private artifact 的新电脑上复验。
