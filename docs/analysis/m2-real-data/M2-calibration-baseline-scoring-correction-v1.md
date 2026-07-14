# M2 calibration-spec-v1.1 计分与 eligibility 修正

- 决策状态：`not_for_formal_decision`；C1 started：`false`。
- case universe / statistically scoreable / served / abstained：`18615` / `12223` / `已抑制` / `已抑制`。
- `forecastabilityStatus` 仅保留历史审计用途，不再同时控制回测、模型能力和业务展示。
- all-scoreable 使用 rawModelPrediction；served-cohort 使用 servedPrediction；abstention 单独报告。
- blocked/abstained served null 从未按 0 混入模型 WAPE；如评估未服务损失，仅使用 `endToEndBusinessLoss` 名称。

## 修正后总体指标

| 模型 | scoreable cases | all-scoreable WAPE | all-scoreable bias | served WAPE | served bias | abstained works |
|---|---:|---:|---:|---:|---:|---:|
| B0b | 12223 | 1.6666 | 1.1961 | 1.6666 | 1.1961 | <10 |
| B1 | 12223 | 1.9022 | 1.4794 | 1.9022 | 1.4794 | <10 |
| B2 | 12223 | 1.8640 | 1.4497 | 1.8640 | 1.4497 | <10 |
| B3 | 12223 | 1.6995 | 1.2348 | 1.6995 | 1.2348 | <10 |

## 旧约 64% → 132% 的解释

- B0a 历史 WAPE：`0.6409`；旧 coverage-aware null→0 混合量：`1.3167`。后者不是模型 WAPE。
- 旧混合量同时出现总体 bias `0.0420`、legacy forecastable bias `1.2150` 与高价值 null→0 bias `-0.4205`，说明误差与 abstention 人口发生机械抵消。
- 固定 Stage 2–7 keys 后：as-of quantile/prior/features 的 WAPE 变化为 `-0.0091`；eligibility/abstention raw 模型 WAPE 变化为 `0.0000`；旧 selector 切换完整 B0b 的变化为 `1.0917`。
- 因此不能把全部差异归因于去泄漏；固定 keys 下的主要恶化来自模型公式切换。

## C1 前覆盖门禁

- top10 served revenue coverage：`1.0000`；冻结门槛：`0.9000`；通过：`True`。
- 门槛未降低、标签未按目标比例移动；若失败，必须继续停在 C1 前。

## seal

- final holdout、embargo shadow、deferred 60-month labels 均未打开。
- B0a 不参与 comparator selection；即使前置检查通过，也仍需用户明确授权后才可开始 C1。
- 新结果仍为 `not_for_formal_decision`，不得 release 或进入 M3。
