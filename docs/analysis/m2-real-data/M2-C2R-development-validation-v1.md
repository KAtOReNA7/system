# M2 C2-R development 验证

结论：C2-R development 为 `FAIL`；结果继续 `not_for_formal_decision`。未打开 final holdout、embargo shadow 或 60-month labels，未授权 C2/C3 或 release。

## 核心指标

| 指标 | 结果 |
|---|---:|
| all-scoreable WAPE | 1.1796 |
| all-scoreable signed bias | +79.26% |
| served WAPE | 互补抑制 |
| served signed bias | 互补抑制 |
| 高价值 WAPE | 0.5730 |
| 高价值 signed bias | +28.22% |
| 内部 80% coverage | 87.56% |
| 内部 mean WIS | 7047.9250 |

## horizon

| 月数 | WAPE | signed bias |
|---:|---:|---:|
| 3 | 0.9786 | +62.36% |
| 6 | 0.9420 | +53.13% |
| 12 | 1.0437 | +70.26% |
| 18 | 1.3063 | +94.97% |
| 24 | 1.8025 | +127.84% |

渠道级对账、收入模式分层、四个 comparator 和全部 gate 结果见同名 JSON 及配套脱敏报告。公开产物不含作品、作者、真实渠道、原始收入行或内部 PI endpoints。
