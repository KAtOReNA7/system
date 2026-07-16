# M2 C2-R 历史目标口径 supersession 清单 v1

结论：legacy-target C2-R development 已执行且结果为 `FAIL`，其 `targetSemantics` 固定为 `legacy_c2r_v1_monthly_equivalent`。这组结果只保留为历史审计证据，`formalCashMetricEligible=false`，`mustNotCompareDirectlyToC2R1=true`，全部状态继续为 `not_for_formal_decision`。

## 1. 替代范围

用户冻结的正式现金决策和 machine-readable amendment 已替代旧 C2-R 的未来现金目标语义：

- 决策：`docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md`
- machine-readable amendment：`src/domain/oldProductEvaluation/calibrationSpec.c2r.v1.1.amendment.json`
- 正式现金目标拆分：`docs/analysis/m2-real-data/M2-C2R1-formal-cash-target-separation-v1.md`
- 买断承诺 as-of 审计：`docs/analysis/m2-real-data/M2-C2R1-buyout-commitment-as-of-audit-v1.md`
- 旧目标到新目标桥接：`docs/analysis/m2-real-data/M2-C2R1-old-target-new-target-bridge-v1.md`

旧报告不做原位改写，也不得被重新命名为 formal-cash 结果。只有在新目标上完成 C2-R.1 replay 后，才能按新口径产生候选指标；在此之前不得把旧 C2-R 与 C2-R.1 直接比较。

## 2. 冻结的历史产物

以下 5 组 Markdown/JSON、共 10 个文件保持原样冻结：

| 历史产物 | SHA-256 |
|---|---|
| `M2-C2R-channel-reconciliation-v1.md` | `85c87f019ad74c2203035b2daaa2aa1cb3f5b7114d84d6f955ed6945ff1cc447` |
| `M2-C2R-channel-reconciliation-v1.json` | `ce66892e6f595c5a665fbcc56d979837657a13f4fa7413d9a5c1e35d7ce30332` |
| `M2-C2R-development-validation-v1.md` | `6854774f27d98a3cd95603887a18851f90a009f217f698455f317be84a182d91` |
| `M2-C2R-development-validation-v1.json` | `f7fcfb465d23d843b8a2f15605fdd3dc3ff9865644b3d78118ae1d4efa36b7ba` |
| `M2-C2R-revenue-channel-design-v1.md` | `66718b94848d74cc28018b70fc127f53546fbb65f907fbb6e2ddbf9a33e1e6fe` |
| `M2-C2R-revenue-channel-design-v1.json` | `93a49e545c1859587dee60665da4cfd2ad7c544ff80e4af38f4288eb9d8476d8` |
| `M2-C2R-revenue-model-routing-manifest-v1.md` | `0010fefadd1e1c961f22d81b1ab7de787e7277aef6681a4e45fcb6271d805008` |
| `M2-C2R-revenue-model-routing-manifest-v1.json` | `930218e62a95660d64a0e1915f379a1cae4475a5e1f410de4a20d2b18d1ba176` |
| `M2-C2R-route-specific-metrics-v1.md` | `6c180be81ffe63f594ee747ba5ec4c6336c54db0803d45eb53cd92bdece043a0` |
| `M2-C2R-route-specific-metrics-v1.json` | `1518a386752247c6c5d18a8b35149fb369298a780e901cc4567e58747de6e969` |

路径前缀均为 `docs/analysis/m2-real-data/`。对应哈希也写入同名 JSON 清单，供自动复核。

## 3. 解释边界

- legacy-target C2-R 已完成，但验收结果为 `FAIL`。
- legacy C2-R 的 WAPE、bias、路由和分层指标不是正式现金指标，不得参与 formal-cash candidate gate。
- 旧产物继续可用于说明历史实现和 old→new target bridge，不得为改善指标而删除或隐藏后来发生的买断现金。
- C2-R.1 尚未训练或调参；C2/C3 未开始。
- final holdout、embargo shadow、deferred 60-month labels 仍 sealed。
- 未 release，未进入 M3 formal execution。
