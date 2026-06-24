# M2 Forecast Model Failure Root-Cause Audit v0.1

Failed candidate: `m2-realdata-dev-candidate-b-forecast-rebuilt-v0.3`

Conclusion: candidate-b forecast route should be abandoned for M2 baseline selection; failures are structural rather than another patch target.

## Factor Flags

| Factor | Value |
|---|---|
| low_income_denominator_mape_explosion | False |
| inactive_long_tail_overforecast | True |
| spike_not_fully_removed | True |
| trailing_baseline_better_for_many_cases | False |
| lifecycle_forecast_mismatch | True |
| remaining_copyright_horizon_amplifies_error | not directly measurable in rolling cutoff; current reports show fallback and horizon caps remain material |
| sparse_data_instability | True |
| validation_low_amount_penalty | True |

## Failure Groups

| Dimension | Segment | Count | Actual | Predicted | WAPE | Median APE | MAE | Coverage | Better Than Baseline |
|---|---|---|---|---|---|---|---|---|---|
| lifecycle | declining | 14058 | 43248426.93 | 31779617.95 | 0.7682 | 0.9838 | 2363.3862 | 0.1381 | 0.7153 |
| lifecycle | growth | 14062 | 151677654.8 | 132562631.56 | 0.5501 | 0.7309 | 5933.2754 | 0.213 | 0.5036 |
| lifecycle | inactive | 22688 | 94848491.95 | 3294816.64 | 1.1178 | 1.0 | 4672.9011 | 0.796 | 0.9806 |
| lifecycle | insufficient_history | 117365 | 429908057.62 | 33582935.49 | 1.0428 | 1.0 | 3819.6905 | 0.6774 | 0.9402 |
| lifecycle | long_tail | 1307 | 7804.0 | 392.82 | 0.9982 | 0.9299 | 5.9601 | 0.0918 | 0.3948 |
| lifecycle | rebound | 7841 | 38941006.65 | 39431916.16 | 0.6966 | 0.9079 | 3459.6204 | 0.1768 | 0.5516 |
| lifecycle | stable | 21189 | 377727255.79 | 416818671.17 | 0.4763 | 0.7991 | 8491.2243 | 0.1822 | 0.5412 |
| revenueScale | high | 24700 | 169704036.26 | 105382552.01 | 0.8693 | 0.8077 | 5972.6955 | 0.4621 | 0.7681 |
| revenueScale | long_tail | 107466 | 315835232.36 | 392.82 | 1.0 | 1.0 | 2938.9316 | 0.7295 | 0.9926 |
| revenueScale | low | 29380 | 19344296.58 | 716595.24 | 0.9895 | 0.9464 | 651.4954 | 0.2346 | 0.5836 |
| revenueScale | mid | 31945 | 66585118.8 | 28185493.88 | 0.8621 | 0.8862 | 1796.9078 | 0.3005 | 0.6301 |
| revenueScale | top | 5019 | 564890013.75 | 523185947.84 | 0.5986 | 0.5901 | 67369.2434 | 0.3112 | 0.6212 |
| confidence | blocked_for_business_use | 103392 | 304002627.98 | 24820712.5 | 1.0493 | 1.0 | 3085.2292 | 0.6913 | 0.9425 |
| confidence | high | 7264 | 317071397.37 | 323818443.35 | 0.3492 | 0.6103 | 15243.707 | 0.1396 | 0.4809 |
| confidence | low | 56381 | 222981996.29 | 12626931.45 | 1.065 | 1.0 | 4212.0196 | 0.5405 | 0.8419 |
| confidence | medium | 31473 | 292302676.11 | 296204894.48 | 0.7213 | 0.857 | 6698.8848 | 0.1557 | 0.5601 |
| horizon | 3 | 45810 | 52501480.43 | 43178494.31 | 0.5918 | 0.8948 | 678.2091 | 0.6113 | 0.8138 |
| horizon | 6 | 42756 | 124046502.57 | 78317055.18 | 0.7222 | 0.9669 | 2095.3986 | 0.5957 | 0.818 |
| horizon | 12 | 39702 | 229577302.97 | 146258479.63 | 0.7774 | 1.0 | 4495.4453 | 0.5448 | 0.8333 |
| horizon | 18 | 36648 | 330060344.89 | 178367679.4 | 0.7715 | 1.0 | 6948.3801 | 0.4912 | 0.8557 |
| horizon | 24 | 33594 | 400173066.9 | 211349273.26 | 0.8103 | 1.0 | 9651.9664 | 0.4393 | 0.8735 |

This report is sanitized and aggregate-only.
