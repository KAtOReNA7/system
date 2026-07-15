# M2 校准基线重放 v1.1（计分口径修正后）

- 决策状态：`not_for_formal_decision`
- 锁定 comparator：`B1`
- 范围：仅 development forward；未训练 C1，未打开 final holdout、embargo 或 60 月标签。
- 产品输出仍仅允许单点值、年度拆分、confidence 和 limitation；80% PI 端点不在本报告中。

## B0b–B3 指标

| 模型 | all-scoreable WAPE | all-scoreable bias | served WAPE | served bias | 高价值 served WAPE | 高价值 bias | 80% coverage | WIS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| B0b | 1.6666 | 1.1961 | 1.6666 | 1.1961 | 0.5214 | 0.1804 | 0.8337 | 9303.4163 |
| B1 | 1.9022 | 1.4794 | 1.9022 | 1.4794 | 0.8027 | 0.5104 | 0.8360 | 10797.9225 |
| B2 | 1.8640 | 1.4497 | 1.8640 | 1.4497 | 0.7587 | 0.4476 | 0.8295 | 10578.0166 |
| B3 | 1.6995 | 1.2348 | 1.6995 | 1.2348 | 0.5316 | 0.2005 | 0.8374 | 9572.6616 |

## Serving 与 abstention

- served work share：`0.9989`
- served actual revenue share：`1.0000`
- top1 / top5 / top10 served revenue coverage：`1.0000` / `1.0000` / `1.0000`
- abstention cell：cases `已抑制` / works `<10`（小 cell 按规则整组抑制）。
- abstained 的 servedPrediction 为 null；其 rawModelPrediction 仍进入 all-scoreable 模型指标，未按 0 混入 WAPE。

## 完整性与边界

- B0b–B3 case/state key 完全一致：`True`。
- future-perturbation invariance：`True`。
- final holdout opened：`False`。
- source、shelf/rights 与期限类型均为 post-hoc 切片，不是历史特征或 eligibility 输入。
- 当前结果保持 `not_for_formal_decision`；C1 未开始。
