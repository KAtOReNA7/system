# M2 sales-share-only target decision v0.1

Status: CURRENT BUSINESS TARGET CONTRACT — DEVELOPMENT EVIDENCE ONLY

Decision date: 2026-07-25

## Decision

M2 predicts future revenue-share cash only. Every buyout amount is excluded,
including signed or confirmed buyout receivables. Buyout and other identified
non-sales cash remain in a separate billing/audit ledger and are not model
features, labels, metrics, forecasts, intervals, or annual forecast components.

This decision supersedes the current-use portions of
`M2-formal-cash-forecast-target-decision-v1.md`. The older document and its
digest-bound artifacts remain immutable historical replay evidence.

## Current target contract

For every locked case:

```text
salesShareCashActual
+ isolatedBuyoutCashActual
+ isolatedOtherCashActual
= totalLedgerCashActual
```

`salesShareCashActual` may be negative when the ledger records a refund or
reversal. Forecast points remain nonnegative. Pure-buyout routes always return
null with `buyout_outside_m2_forecast_scope`; a commitment does not unlock a
model point.

The current external point is `futureSalesShareRevenueForecast`. The historical
`futureCashRevenueForecast` field is not the current target and must not be used
to include buyout cash.

## Metric boundary

- WAPE, bias, MASE, RMSSE, probabilistic scores, model selection, and backtest
  gates use `salesShareCashActual` only.
- Target completeness is measured inside the revenue-share ledger.
- Revenue-share cash as a share of all company ledger cash is an economic-scope
  disclosure, not a model-coverage gate.
- Overlapping work-origin-horizon case sums are not full-library cash totals.
- Classification uncertainty and per-case conservation remain explicit gates.

## Migration evidence

The 2026-07-25 v0.6 migration re-scored the unchanged 824 works and 7,851
frozen cases and the unchanged 25-origin/56,856-case dense diagnostic.

- Frozen cases whose numeric target changed: 0.
- Dense cases whose numeric target changed: 0.
- Frozen overlapping-case buyout cash isolated from the current target:
  4,800,850.1534.
- Dense overlapping-case buyout cash isolated from the current target:
  11,578,794.9998.
- Frozen classification-uncertain cash share: 0.0000027284304596833668.
- Dense classification-uncertain cash share: 0.000002865143615676321.
- Frozen uncertainty is one case with a signed cash adjustment of -230.38;
  its work identifier remains private. It may be a sales refund or a buyout
  clawback, so it is not silently relabelled.
- Maximum observed conservation difference is below 0.000001.

The numeric target did not change because the current authority has no
cutoff-linked committed buyout or identified other commitment cash in these
frozen cases; the preceding formal-cash target had already excluded the
observed buyout events. Therefore this decision corrects future semantics and
removes a private commitment dependency, but it does not by itself improve
current WAPE or regularity.

## Current result and boundary

The work-level WAPE/bias remain 0.5055714019 / -0.0119895777. The portfolio
development WAPE/bias remain 0.1168193389 / -0.0487629979. The target contract
is implemented, but mature M2 capability remains blocked by work-level error,
intermittent/dormant failures, tiny unresolved classification uncertainty,
independent validation, sealed final holdout, automation, and release gates.

This decision authorizes no provider, database, final holdout, Canary/full160,
release, or M3 formal action.
