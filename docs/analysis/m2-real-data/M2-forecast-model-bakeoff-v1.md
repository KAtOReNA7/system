# M2 Forecast Model Bake-Off v1

candidate-b is treated as a failed route and is not patched further in this report.

## Model Scoreboard

| Model | WAPE | MAE | SMAPE | Coverage | Better Than Baseline | Fail Rate | Warning Rate | High Conf Spread P75 | Non-low Spread P75 |
|---|---|---|---|---|---|---|---|---|---|
| model_a_trailing_baseline | 0.8541 | 4889.4474 | 1.3416 | 0.5246 | 0.805 | 0.1767 | 0.24 | 1.3267 | 1.7364 |
| model_b_lifecycle_robust | 0.8248 | 4721.7194 | 1.3378 | 0.5445 | 0.8363 | 0.1761 | 0.23 | 1.3267 | 1.7364 |
| model_c_zero_inflated_sparse | 0.7818 | 4475.1653 | 1.3217 | 0.5776 | 0.8381 | 0.1654 | 0.2125 | 1.3267 | 1.3267 |
| model_d_hierarchical_shrinkage | 0.8393 | 4804.6665 | 1.366 | 0.5531 | 0.8119 | 0.1837 | 0.2198 | 1.3267 | 1.3267 |
| model_e_selector | 0.7599 | 4350.1869 | 1.3227 | 0.562 | 0.8376 | 0.1654 | 0.2281 | 1.3267 | 1.706 |

## Selected Model Validation

| Candidate | Verdict | 200 Fail Rate | 200 Warning Rate | Full Fail Rate | P0 | P1 | P2 | All Coverage |
|---|---|---|---|---|---|---|---|---|
| None | FAIL | 0.2155 | 0.2541 | 0.1654 | 0 | 0 | 985 | 0.562 |

This report is sanitized and aggregate-only.
