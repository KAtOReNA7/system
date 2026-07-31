# M2 当前状态索引 v0.52

截至 2026-07-31，LG01 头部保护分段路由模型 v0.1（LG01 Head-Protected
Segmented Router Model v0.1，`M2-WORK-HPSR01`）已经产生首个合法、完整且冻结的
真实回溯开发评价结果。机器状态为
`M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2`，中文含义是：
回溯开发证据不支持该模型，按预冻结合同在独立评价检查点前停止。

这份证据使用任务开始前已经打开且权威账单完整的 2025-11 预测起点，只属于回溯
开发评价，不是独立后期起点证据，也不是最终留出集。模型没有成为活动候选，没有
获得自动化、生产或发布批准。

## 首页结论

| 问题 | 当前答案 |
|---|---|
| 实现与合成验证检查点是否完成？ | 是；canonical implementation 与公开 synthetic/fixture 验证均已完成 |
| 回溯评价是否真正执行？ | 是；唯一一次完整回溯候选评价和 2,000 次作品聚类 bootstrap 已执行并冻结 |
| 纳入哪些预测起点？ | 仅 `2025-11`；57 个作品、57 个唯一同案例键 |
| 回溯结果 | 不支持（`RETROSPECTIVE_UNSUPPORTED`）；状态为 `M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2` |
| 是否为独立证据？ | 否；明确标记为 `RETROSPECTIVE_DEVELOPMENT_NOT_INDEPENDENT` |
| 独立评价数据是否成熟？ | 否；动态首个独立起点为 `2026-03`，所需账单完整到 `2026-06`，当前只完整到 `2026-04` |
| 独立评价检查点是否执行？ | 否；仍缺 `2026-05`、`2026-06`，且回溯不支持已经触发停止条件 |
| prospective final holdout | 动态预留起点当前为 `2026-06`，outcome 仍未打开 |
| 是否值得继续等待 HPSR01 的独立评价？ | 否；本模型已按回溯失败合同停止，不再以等待新账单作为下一步 |
| 当前活动候选 / 自动化批准 | `null` / `null` |

## 回溯人口冻结

人口由 ledger 动态构造，没有写死候选月份，也没有使用固定 50 或 100 部作品门槛。

| 起点 | 所需账单完整到 | 是否纳入 | 中文原因 |
|---|---:|---|---|
| `2025-10` | `2026-01` | 否 | 任务开始前没有打开该起点 actual |
| `2025-11` | `2026-02` | 是 | actual 已在任务前打开，三个月权威账单完整，且不属于隔离 outcome |
| `2025-12` | `2026-03` | 否 | 属于历史隔离 outcome，且任务开始前没有打开 actual |
| `2026-01` | `2026-04` | 否 | 任务开始前没有打开该起点 actual |
| `2026-02` | `2026-05` | 否 | 三个月权威账单窗口不完整 |

2025-11 起点共有 2,653 部成熟合格作品；按起点可见 trailing-12 分成现金动态选择的
Core80 为 57 部，覆盖该起点 actual 现金的 81.7104%，捕获起点可见现金的
80.2242%。Core80 cutoff 有 1 个同额 tie，边界作品整体纳入，没有拆分作品。

| 现金带 | 作品数 | Core80 内 actual 现金占比 |
|---|---:|---:|
| H50 头部 50% 现金带 | 5 | 55.5497% |
| M30 中部 30% 现金带 | 19 | 26.1260% |
| L20 尾部 20% 现金带 | 33 | 18.3243% |

## 冻结同案例成绩

只评价三个月 horizon。冻结 LG01 同案例基线
（`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/R0`）、冻结公式 CHAM01 B3
原始诊断（同实验 `D1`）和 HPSR01 唯一原始候选（同实验 `R1`）使用完全相同的
57 个案例。

| 实验臂 | WAPE | signed bias | absolute bias | MAE | median AE | 相对 R0 paired FVA |
|---|---:|---:|---:|---:|---:|---:|
| R0 冻结 LG01 同案例基线 | 14.3234% | -6.6974% | 6.6974% | 7,811.99 | 2,266.84 | — |
| D1 冻结 CHAM01 B3 原始诊断 | 28.6024% | -17.1296% | 17.1296% | 15,599.83 | 2,558.88 | -99.6909% |
| R1 HPSR01 唯一原始候选 | 14.2019% | -8.7333% | 8.7333% | 7,745.77 | 2,319.94 | 0.8477% |

R1 相对 R0 的 2,000 次作品聚类 bootstrap FVA 95% 区间为
[-18.3441%, 20.0303%]，中位数为 1.0641%；区间跨 0。唯一时间块的 R1 WAPE
方向改善，但一个时间块不足以形成跨时间稳定支持。

R1 的 absolute bias 比 R0 恶化 2.0358 个百分点，超过预冻结“不支持”门禁的
2 个百分点。这一项已经独立触发 `RETROSPECTIVE_UNSUPPORTED`；没有按结果修改
参数、边界、现金带、clip 或 fallback。

## 现金带与结构诊断

| 现金带 | R0 WAPE | D1 WAPE | R1 WAPE | clip | numeric fallback | R1 raw coverage |
|---|---:|---:|---:|---:|---:|---:|
| H50 头部 50% 现金带 | 9.2724% | 31.4383% | 9.2724% | 0 | 0 | 100% |
| M30 中部 30% 现金带 | 21.9169% | 27.7447% | 24.6987% | 2 | 0 | 100% |
| L20 尾部 20% 现金带 | 18.8088% | 21.2287% | 14.1800% | 5 | 0 | 100% |

H50 的 5 行 R1 预测逐行严格等于 R0；这是架构组成，不是 fallback。D1 的
nonfinite 行为 0，R1 numeric fallback 为 0，7 行 finite extreme 被预冻结边界
clip 后保持有限。R0 / R1 最大单作品绝对误差占比分别为 28.7559% / 29.0017%，
top 5 分别为 52.4423% / 59.1245%，top 10 分别为 69.4890% / 75.8581%；未触发
灾难性单作品主导门禁。

作品键、起点可见性、actual 与 prediction 金额守恒、有限性、57 个 private 行与
57 个唯一 case-key 的守恒均通过。公开工件只保存脱敏聚合证据。

## 独立评价与最终留出集

fresh metadata-only 审计得到：

- `retrospectiveReplayReady=true`；
- `independentK2Ready=false`；
- private source authority 可用；
- 可重建缓存已就绪；
- 历史 receipt 缺失只记为可选 provenance 告警；
- residual bound provenance 仍有效；
- 权威账单完整到 `2026-04`；
- 动态首个独立起点为 `2026-03`，仍缺 `2026-05` 与 `2026-06`；
- 动态 prospective final holdout 起点当前为 `2026-06`，仍未打开。

本任务虽然曾对数据成熟且回溯不是不支持的情形给予一次条件式独立评价授权，但两个
前置条件都不成立。因此独立评价检查点执行次数为 0，不能用部分账单、替代 actual
或回溯成绩冒充独立证据。回溯结论已经使 HPSR01 停止，未来账单成熟也不会自动恢复
该模型或授权重跑。

## 科学执行与治理

| 活动 | 次数 |
|---|---:|
| 新模型训练 | 0 |
| 冻结公式的 origin-faithful refit | 1 |
| 模型选择 | 0 |
| 超参数搜索 | 0 |
| alpha 搜索 | 0 |
| residual bound 重估 | 0 |
| 完整回溯评价 | 1 |
| 作品聚类 bootstrap | 1 |
| 独立评价检查点 | 0 |
| final holdout 评价 | 0 |

冻结公式 refit 使用固定 `huberDelta=1`、`l2=10`，没有搜索；训练支持为
52,209 行、2,605 部作品、42 个历史起点，最大训练标签可用边界为 2025-11。这不是
新模型、新候选或结果驱动调参。

| 层次 | 当前状态 |
|---|---|
| 已实现 | 是 |
| 已验证 | 公共实现门禁与唯一真实回溯开发评价均完成；独立评价未执行 |
| 已授权 | 本任务的唯一回溯执行已用完；条件式独立评价未满足前置条件且已停止 |
| 可发布 | 否；活动候选、自动化批准、production 与 release 均为空或未授权 |

科学执行绑定的冻结实现 exact HEAD 为
`987f375c0dc8eaa68a3ba10c0af4c74793088e85`，对应 GitHub Actions run
`30606102945` 的 Linux 与 Windows 公共门禁均成功。后续提交只收敛首个冻结结果、
当前映射、中文报告和合同测试，不改变模型、参数、人口或预测。

## 当前权威证据

- `config/m2-current-head-protected-segmented-router.v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-retrospective-readiness-v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-retrospective-development-v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-retrospective-development-v0.1.md`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-k1-implementation-readiness-v0.1.json`
- `config/m2-model-registry.v1.json`

本索引取代 v0.51 作为当前阅读入口，但不改写 v0.51、HCRC01/CHAM01 冻结结果、
历史 ID、schema、digest、receipt、预测或评价。PR #35 继续保持 Draft / Open /
Unmerged。本轮没有执行 6/12/36 个月评价、新作品、未来首次渠道、公司收入、
production loader/route/API、provider、数据库、Canary/full160、release、M3
formal、PR 合并或下一模型开发。
