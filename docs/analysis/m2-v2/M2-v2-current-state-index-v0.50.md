# M2 当前状态索引 v0.50

截至 2026-07-31，LG01 头部保护分段路由模型 v0.1（LG01 Head-Protected
Segmented Router Model v0.1，`M2-WORK-HPSR01`）只完成了日期级资格盘点与科学
合同预注册。当前机器状态为等待新账单
（`M2_HEAD_PROTECTED_SEGMENTED_ROUTER_WAITING_FOR_NEW_BILLS`）。

该状态不是模型失败：模型尚未实现、训练、选择或评分，也没有 later-origin
bootstrap。附件要求在没有合格 later-origin 时完成公共验证后停止，因此
`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01` 的 K1 实现检查点与 K2
一次性私有评价检查点均为“未执行、等待新账单”。

## 首页结论

| 问题 | 当前答案 |
|---|---|
| 是否存在真正未被历史实验读取的成熟 later-origin？ | 否；`maxPreviouslyOpenedOrigin = 2026-02`，历史 future-actual 日期边界已到 `2026-05`，但完整分成账单只到 `2026-04` |
| 使用了几个非重叠预测起点？ | 0 |
| H50 是否逐行保持 LG01？ | 尚未执行；K0B 合同已冻结为未来 R1 必须逐行完全等于 R0 |
| M30、L20 是否改善？ | 未评价，`null` |
| Core80 现金、WAPE、FVA？ | 未读取，`null` |
| Core90 是否同方向？ | 未评价，`null` |
| B3 数值外推是否出现、R1 是否隔离？ | 未执行，`null` |
| 当前结果类型？ | 等待新账单，不是通过、单窗口方向性、不确定或 cash-only 失败 |
| final holdout 是否打开？ | 本轮没有打开新的 final holdout；历史三个月 holdout 的 untouched 隔离已被先前缓存冲突，不能复用为本实验 holdout |

## 当前角色

| 对象 | 当前状态 | 中文解释 |
|---|---|---|
| HPSR01 实验 | `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_WAITING_FOR_NEW_BILLS` | K0A/K0B 完成，K1/K2 未执行 |
| HPSR01 模型 | 已预注册、未实现、未执行 | 不是活动候选，不是失败模型 |
| HCRC01 历史结果 | `M2_LG01_HEAD_CASH_RESIDUAL_FAIL` | 首个完整结果继续冻结，不重跑、不改写 |
| 活动候选 | `null` | 没有模型晋升 |
| 自动化批准 | `null` | 没有 production、automation 或 release 权限 |
| 现行运行回退 | `M2-WORK-OA03` | 继续只是兼容性现行运行回退 |
| 研究比较基线 | `M2-WORK-LG01` | 继续是研究基线，不等于 production champion |

## HCRC01 选择门禁归因

现存冻结公开证据可以证明：

- 16 个 outer selection 单元全部没有合格 global alpha；
- H50、M30、L20 各 16 个单元都因 global alpha 不合格而短路回退 C0；
- C2/C3 的 raw candidate case 均为 0；
- 合同用 `C2_SELECTED_ALPHA` 作为现金带全局锚，实现也在 global alpha 不合格时
  直接令三个现金带全部回退。

因此，HCRC01 证明的是“可部署整体路由失败”，而不是“M30/L20 独立分段修正已经
形成 raw candidate 并在 outer 评价中失败”。

原 16 条 private selection 行属于可重建派生缓存，当前未保留在本机、Git 历史或
PR 公开证据中。由于本任务禁止重跑 HCRC01、旧 bootstrap 或读取旧 outer 行级
outcome 做新选择，alpha 0.25、0.50、0.75、1.00 的逐 guard 拒绝次数不可恢复，
机器 JSON 保持为 `null`，没有从结果级失败原因反推或伪造。

## opened-origin 与账单边界

K0A 日期审计只读取：

- 历史缓存的 origin、horizon、标签日期键和 existing actual 是否为空；
- 权威分成账单的 billMonth。

它没有读取新的 future actual 金额、模型指标或候选表现。

日期级 private ledger 属于 `PRIVATE_DERIVED_CACHE`，可由权威源和冻结代码重建：

- feature cache：53 个 origin，`2017-08` 至 `2026-02`；
- frozen LG01 same-case cache：45 个 origin，`2019-08` 至 `2026-02`；
- 最大历史 opened origin：`2026-02`；
- 已物化 future-actual 日期边界：`2026-05`；
- 最新完整分成账单月：`2026-04`；
- `2026-05` 只有 3 条事实，按冻结 readiness 权威仍不完整。

严格晚于 `2026-02` 的 `2026-03` 需要未来 `2026-04` 至 `2026-06`，目前不成熟；
故可用 later-origin 与非重叠 later-origin 均为 0。

## final holdout

历史不可变合同为三个月 horizon 登记了 `2025-06` 与 `2025-12` final holdout。
后续 M2 派生缓存已经把 opened-origin 边界推进到 `2026-02`，因此这两个起点对
HPSR01 不再满足 untouched 条件。历史文件未改写，本次也没有读取新的 holdout
金额；机器状态登记为 `HISTORICAL_FINAL_HOLDOUT_ISOLATION_CONFLICT`。

未来日期级保留：

- 一个 later-origin 加一个非重叠 holdout：最早 later-origin `2026-05`，保留
  `2026-08` holdout，至少需要完整账单到 `2026-11`；
- 两个非重叠 later-origin 加一个 holdout：使用 `2026-05`、`2026-08`，保留
  `2026-11` holdout，至少需要完整账单到 `2027-02`。

这些只是日期保留，不是执行授权；后续必须重新核验仍未被其他任务打开。

## K0B 冻结合同

实验只登记三个身份：

- 冻结 LG01 later-origin 同案例基线
  （`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/R0`）；
- 冻结公式 CHAM01 B3 原始诊断
  （`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/D1`）；
- LG01 头部保护分段路由唯一候选
  （`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/R1`）。

R1 的未来结构已冻结：

- H50 始终逐行使用 LG01，是 raw architecture，不是 fallback；
- M30 与 L20 分别用固定 `alpha=1.00` 的有界 B3 相对 LG01 残差；
- 两带互不依赖，也不依赖 global alpha；
- positive base floor 使用旧 development 有限正 LG01 base 的 q10；
- normalized residual 使用旧 development rows 的 q05/q95；
- later-origin outcome 不得参与边界、参数、现金带或阈值；
- 有限极端 B3 在 D1 保留，R1 必须截断；非有限输入只允许对应行回退 LG01；
- 不设置固定 50/100 作品门槛；
- raw router、corrected-only、fallback-only 必须分别报告。

因为没有 later-origin，private bound 数值尚未物化，预测实现也不存在。计算规则已
冻结；未来若取得合法 origin，必须在读取 outcome 前由旧 development rows
确定性物化。

## 已实现、已验证、已授权、可发布

- 已实现：K0A 日期审计、HCRC01 归因、K0B 配置与只读合同校验、可移植
  capability 分类。
- 已验证：日期边界、final holdout 保留算法、三个月完整性与非重叠选择、Core
  origin 可见性、H50/M30/L20 公式合同、旧窗边界、数值回退、raw/fallback 分离、
  守恒、无未来泄漏、出版行业小人口与跨电脑路径边界。
- 已授权：日期级盘点与 K0 预注册；只有未来重新盘点确认 later-origin 和独立
  holdout 后，用户给出的条件式一次性 later-origin 授权才可进入执行门禁。
- 可发布：否。Draft PR 必须保持 Open/Unmerged，活动候选与自动化批准均为空。

## 当前权威证据

- `config/m2-current-head-protected-segmented-router.v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-selection-gate-attribution-v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-selection-gate-attribution-v0.1.md`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-later-origin-availability-v0.1.json`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-later-origin-availability-v0.1.md`
- `docs/analysis/m2-current/M2-head-protected-segmented-router-preregistration-v0.1.md`
- `config/m2-model-registry.v1.json`

本索引取代 v0.49 作为当前阅读入口，但不改写 v0.49、HCRC01/CHAM01 冻结结果、
历史 ID、schema、digest、预测或评价。最终 exact HEAD 的 Linux/Windows CI 状态
由 Draft PR 动态记录；本文不预写尚未产生的 run id。

本轮没有执行模型训练、模型选择、later-origin outcome、bootstrap、final holdout、
6/12/36 个月、新作品、未来首次渠道、公司收入、渠道分配、taxonomy、production、
provider、数据库、Canary/full160、release、M3 formal 或 PR 合并。
