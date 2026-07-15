# M2 calibration baseline replay v1

- Mode: `development`
- Decision status: `not_for_formal_decision`
- Spec digest: `625631279889e46ce174ffb507b3926793fdc7a435fc2c7c8aafbf990c8a7fb9`
- Locked comparator: `B3`
- Boundary: baseline audit/replay only; no candidate training, formal decision, release, or M3.
- Public contract: point value, annual breakdown, confidence, and limitation only; PI endpoints remain internal.

## Development baseline metrics

| Model | Cases | Forecastable | Coverage-aware WAPE | Overall bias | Forecastable WAPE | High-value bias | Internal 80% coverage | Mean WIS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| B0b | 18615 | 11935 | 1.31666957 | 0.04203217 | 1.67314034 | -0.42049489 | 0.80946795 | 9612.19215951 |
| B1 | 18615 | 11935 | 1.34980915 | 0.09656376 | 1.74358472 | -0.36189053 | 0.81105991 | 10058.80308865 |
| B2 | 18615 | 11935 | 1.35093358 | 0.10296317 | 1.74597489 | -0.36718966 | 0.80368664 | 10084.64694972 |
| B3 | 18615 | 11935 | 1.31261141 | 0.03958692 | 1.66451397 | -0.43805216 | 0.81256808 | 9604.39627527 |

## Integrity and interpretation

- Authority scope: `3053` works / `192872` facts.
- B0b-B3 case-key parity: `True`.
- Future-perturbation synthetic invariance: `True`.
- Interval warmup prediction locked before truth join: `True`.
- Warmup prediction lock covers `15` origin-horizon blocks; the earliest score origin admits exactly `9` target-available residual blocks for every baseline.
- Warmup rows calibrate internal PI only; they are excluded from point metrics, comparator selection, and bootstrap.
- Final holdout opened: `False`.
- Source, shelf/rights, and rights-term slices are post-hoc only and were not prediction features.
- B0a is the rejected historical audit record only and is excluded from fair case replay.
- Only 36-month audit labels ending by the development purge were opened; all 60-month and deferred labels remain closed, and every >24-month point remains `extrapolated`.
