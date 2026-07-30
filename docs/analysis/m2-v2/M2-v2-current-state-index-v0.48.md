# M2 当前状态索引 v0.48

截至 2026-07-30，LG01 头部现金残差校准模型 v0.1
（LG01 Head-Cash Residual Calibration Model v0.1，`M2-WORK-HCRC01`）
已完成执行检查点 K1（实现与合成验证，
`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/K1`），当前机器状态为
`M2_LG01_HEAD_CASH_RESIDUAL_IMPLEMENTED_SYNTHETIC_VERIFIED_OUTER_UNREAD`。

这不是模型成绩：本轮 private outer outcome 仍未读取，四个实验臂尚未形成首个
完整真实结果，活动候选与自动化批准仍为空。

## 当前结论

| 对象 | 当前状态 | 中文解释 |
|---|---|---|
| CHAM01 性能结论 | `M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL` | 冻结的 3、6、12 个月性能失败不变，没有重跑或改写 |
| CHAM01 数值稳定性 | `M2_CHAM01_PRIMARY_CORE90_NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION` | 五个 Primary/Core90 原始单元格的有限极端外推失败继续单独登记 |
| HCRC01 实现 | `M2_LG01_HEAD_CASH_RESIDUAL_IMPLEMENTED_SYNTHETIC_VERIFIED_OUTER_UNREAD` | C2/C3、缓存重建、聚合评价和 public/private 边界已实现并通过 synthetic 验证；真实 outer outcome 未读取 |
| 证据级别 | `EXPLORATORY_DEVELOPMENT_EVIDENCE_NOT_INDEPENDENT_CONFIRMATION` | 方向是在阅读 CHAM01 结果后提出，即使后续为正也不是独立确认 |
| 活动候选 | `null` | 实现就绪不等于候选晋升 |
| 自动化批准 | `null` | 未授权自动化 |
| 现行运行回退 | `M2-WORK-OA03` | 兼容性运行回退未改变 |

## 已实现和验证的固定合同

- 冻结 LG01 三个月同案例基线 / C0
  （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0`）继续只作研究比较基线。
- 冻结 CHAM01 B3 三个月原始诊断参考 / C1
  （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1`）继续只作冻结诊断参考。
- 全局有界残差混合 / C2
  （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2`）只用更早 inner origin 推导
  q05/q95、正 base 下限、数值安全边界和全局 alpha。
- 头部现金带保护的有界残差混合 / C3
  （`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3`）只用 forecast-origin 可见
  trailing-12 分成现金构造 H50/M30/L20，带级选择向全局 alpha 收缩。

公共 synthetic smoke 已验证：确定性、inner/outer 隔离、无未来泄漏、非有限值
回退、raw/selected 分离、现金带边界、小型人口、缓存自动重建和 private 防泄漏。
固定 alpha 网格仍为 0.25、0.50、0.75、1.00；没有新增实验臂或阈值。

## Private capability 与下一门禁

不可替代权威输入此前已确认可用（`SOURCE_AUTHORITY_AVAILABLE`）。冻结行缓存缺失
属于可重建缓存缺失（`CACHE_MISS_REBUILDABLE`）；历史收据缺失属于可选溯源告警
（`OPTIONAL_PROVENANCE_MISSING`）。K1 没有读取 private outer outcome。

下一步只允许在本检查点普通 commit/push 且 exact-head Linux/Windows CI 成功后，
调用一次 private development evaluation。该入口会先确定性重建冻结 LG01 与冻结
CHAM01 B3 三个月输入，并逐格核对冻结公开聚合；不一致时 fail closed。

## 当前证据

- `config/m2-current-lg01-head-cash-residual.v0.1.json`
- `docs/analysis/m2-current/M2-lg01-head-cash-residual-preregistration-v0.1.md`
- `docs/analysis/m2-current/M2-lg01-head-cash-residual-implementation-readiness-v0.1.md`
- `src/domain/m2Current/lg01HeadCashResidual.js`
- `scripts/m2-current/lg01_head_cash_residual_mode.mjs`
- `test/m2-lg01-head-cash-residual.test.js`
- `config/m2-model-registry.v1.json`

本索引取代 v0.47 作为当前阅读入口，但不改写 v0.47、历史 ID、schema、digest、
冻结预测或冻结成绩。未执行 private evaluation、6/12/36 个月新候选、新作品、
未来首次渠道、渠道分配、taxonomy、production、provider、数据库、later-origin、
final holdout、Canary/full160、release、M3 formal 或 PR 合并。
