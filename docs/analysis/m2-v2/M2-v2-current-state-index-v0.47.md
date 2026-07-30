# M2 当前状态索引 v0.47

截至 2026-07-30，核心老品分周期金额模型 v0.1
（Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）的冻结
性能失败结论保持不变；本版另行补充其 Primary rolling / Core90 原始结果中的
有限极端外推数值稳定性失败
（`M2_CHAM01_PRIMARY_CORE90_NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION`）。

同时，M2 LG01 头部现金残差校准 v0.1
（M2 LG01 Head-Cash Residual Calibration v0.1，
`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01`）已在读取本轮外层结果前完成预注册，机器状态为
`M2_LG01_HEAD_CASH_RESIDUAL_PREREGISTERED_NOT_EXECUTED`。其模型身份为
LG01 头部现金残差校准模型 v0.1
（LG01 Head-Cash Residual Calibration Model v0.1，`M2-WORK-HCRC01`）。

## 当前结论

| 对象 | 当前状态 | 中文解释 |
|---|---|---|
| CHAM01 性能结论 | `M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL` | 冻结的 3、6、12 个月门禁失败不变，没有重跑、删改或替换原始结果 |
| CHAM01 数值稳定性 | `M2_CHAM01_PRIMARY_CORE90_NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION` | Primary/Core90 有 5 个有限但数量级极端的原始单元格，单一作品贡献近乎全部绝对误差 |
| 新实验阶段 | `M2_LG01_HEAD_CASH_RESIDUAL_PREREGISTERED_NOT_EXECUTED` | 只完成公开合同与模型身份登记，尚未读取本轮外层结果 |
| 证据级别 | `EXPLORATORY_DEVELOPMENT_EVIDENCE_NOT_INDEPENDENT_CONFIRMATION` | 方向是在阅读 CHAM01 结果后提出，即使出现正结果也不能解释为独立确认 |
| 活动候选 | `null` | 预注册模型不是已执行或已晋升候选 |
| 自动化批准 | `null` | 未授权自动化 |
| 现行运行回退 | `M2-WORK-OA03` | 兼容性运行回退未改变 |

## CHAM01 极端有限值披露

受影响单元格均属于核心老品分周期金额模型开发 v0.1
（Core Legacy Horizon-Specific Amount Model Development v0.1，
`M2-EXP-CORE-HORIZON-AMOUNT-01`）的 Primary rolling / Core90 原始诊断。

| 周期 | 实验臂（完整作用域） | cases | WAPE | signed bias | 最大单作品绝对误差占比 | 数值状态 |
|---:|---|---:|---:|---:|---:|---|
| 3 月 | 等作品权重 / B1（`M2-EXP-CORE-HORIZON-AMOUNT-01/B1`） | 396 | 5.494429874592189e+33 | 5.494429874592189e+33 | 1 | `NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION` |
| 3 月 | 起点收入秩权重 / B2（`M2-EXP-CORE-HORIZON-AMOUNT-01/B2`） | 396 | 2.739672113752189e+61 | 2.739672113752189e+61 | 1 | `NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION` |
| 3 月 | 冻结 LG01 输入 / B3（`M2-EXP-CORE-HORIZON-AMOUNT-01/B3`） | 396 | 1.5056004952219026e+52 | 1.5056004952219026e+52 | 1 | `NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION` |
| 6 月 | 等作品权重 / B1（`M2-EXP-CORE-HORIZON-AMOUNT-01/B1`） | 396 | 9366475296846.143 | 9366475296845.537 | 0.9999999999999616 | `NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION` |
| 6 月 | 起点收入秩权重 / B2（`M2-EXP-CORE-HORIZON-AMOUNT-01/B2`） | 396 | 8.271113970865827e+28 | 8.271113970865827e+28 | 1 | `NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION` |

冻结源 JSON 的 SHA-256 仍为
`963f51e5e324203d0f6b58fb19e532f94036af19683928e985e20b94640e5703`；
该 JSON、冻结预测与历史审计记录没有被修改或重跑。实现审计支持的原因是：fold 内
标准化没有外层支持范围约束，任意有限 transformed score 会直接进入无界
`signed-expm1`，导致超出支持范围的 transformed-space 外推被指数放大。证据不支持
空支持、非有限值传播或序列化故障；缺少冻结私有行时也不臆测某一个具体特征是唯一
原因。

## 已冻结的新实验合同

本轮仅含以下四个实验臂，不得增加临时实验臂：

- 冻结 LG01 三个月同案例基线 / C0
  （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`）：冻结研究比较基线。
- 冻结 CHAM01 B3 三个月原始诊断参考 / C1
  （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`）：只作历史诊断，不具备通过资格。
- 全局有界残差混合 / C2
  （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`）：只用更早 inner origin 选择全局
  `alpha`。
- 头部现金带保护的有界残差混合 / C3
  （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`）：按起点可见现金划分 H50、M30、L20，
  各带选择向全局收缩的 `alpha`。

主决策仅为 Strict rolling Core80、3 个月、作品总额、同案例对比冻结 LG01；
Strict rolling Core90 只作敏感性。Primary 只报告原始数值稳定性和可评价性；没有
合法同案例 LG01 时保持不可比较（`NOT_COMPARABLE`），不得补造预测增值
（forecast value added，FVA）。

## Private capability 与跨电脑状态

能力检查已确认不可替代私有权威输入可用（`SOURCE_AUTHORITY_AVAILABLE`）。冻结
CHAM01 行级派生缓存当前缺失（`CACHE_MISS_REBUILDABLE`），必须从权威源与冻结代码
确定性重建并对齐公开冻结聚合，不能因此阻断。历史收据缺失仅为可选溯源告警
（`OPTIONAL_PROVENANCE_MISSING`），不得补造或作为输入。

## 已实现、已验证、已授权、可发布

| 层次 | 状态 | 说明 |
|---|---|---|
| 已实现 | 仅 K0 治理 | 数值披露、预注册合同、模型/实验身份与合同校验入口已落地；候选算法尚未实现 |
| 已验证 | K0 待完整门禁 | 冻结 JSON 哈希与公开极端值已核对；本轮外层结果仍未读取 |
| 已授权 | 一次私有开发评价 | 只有 K1 实现、合成验证及精确 HEAD 双平台 CI 通过后方可使用 |
| 可发布 | 否 | 没有活动候选、production、automation、release 或 M3 formal 权限 |

## 当前证据

- `config/m2-current-lg01-head-cash-residual.v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-numeric-stability-disclosure-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-development-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-development-v0.1.md`
- `docs/analysis/m2-current/M2-lg01-head-cash-residual-preregistration-v0.1.md`
- `config/m2-model-registry.v1.json`

本索引取代 v0.46 作为当前阅读入口，但不改写 v0.46、历史状态码、schema、digest、
冻结预测或冻结成绩。未执行 6、12、36 个月新候选、新作品、新渠道、渠道分配、
taxonomy、production、provider、数据库、later-origin、final holdout、
Canary/full160、release、M3 formal 或 PR 合并。
