# M2 current canonical core scope

This directory is the only implementation home for current M2 model logic.

- `config/m2-model-registry.v1.json` is the only current authority for M2 model
  names, aliases, roles, evaluation populations, and comparability groups.
  Historical artifacts remain immutable evidence and are not rewritten from
  the registry.
- Keep model, model family, experiment, experiment arm/ablation, execution
  checkpoint, evaluation campaign, status index, report/config/schema version,
  status code, and command identities separate. User-facing text must not show
  a local code such as `G1`, `A5`, `R3`, or `K1` without its parent experiment
  and a Chinese explanation.
- Rank evaluations only when target, cash authority, case population (or an
  explicit same-case intersection), horizon contract, grain, as-of/label
  maturity, actual definition, and evaluation family match. Otherwise show the
  differences and refuse to name a winner.
- Keep operational fallback, research baseline, candidate, champion, blocked,
  failed, and not executed as distinct roles or states. A blocker means the
  candidate did not run; a failure requires an executed result.
- Work-level point forecasts, portfolio forecasts, ranking/allocation, and
  risk/interval outputs are different capabilities. Do not compare or promote
  them as one model leaderboard, and never allocate a portfolio result back to
  works.
- Keep `M2-current-occurrence-amount-calibration-v0.3` as the operational
  fallback. Development challengers must not be imported by `loader.js`,
  `route.js`, or any production API.
- The prediction target is future sales-share cash only. Buyout and other cash
  are outside features, labels, metrics, predictions, and intervals.
- Development features must be available at the forecast origin. For the
  channel-expert experiment, the only additionally authorized static features
  are canonical channel identity, the user-confirmed monetization mechanism,
  and intrinsic work category.
- Preserve every preregistered raw ablation result. A fallback or selected
  pipeline must never replace or conceal raw candidate metrics or raw FVA.
- Model selection must be nested inside the applicable outer work or time
  split. Exact v0.3, later-origin, final holdout, provider, database, canary,
  release, and M3 data must not be read for selection.
- Sparse channel/category cells fall back deterministically through the
  preregistered hierarchy; they do not stop the experiment and must not be
  filled with fabricated observations.
- Public artifacts contain only aggregate evidence. Work IDs, channel IDs,
  row-level actuals, and row-level predictions remain in capability-scoped,
  Git-ignored private output.
- Extend the existing human-anchored materializer and runner modes. Do not
  create a second production loader, route, API, runtime, or duplicated
  historical runner.

## Evaluation contract rules

- Evaluation Contract v2 remains a validated-but-inactive draft until a
  separate activation decision. Its evaluator must not be wired into
  production, the active model gate, or exact v0.3 serving merely because a
  frozen rescore completed.
- A frozen evaluation must preserve raw candidate, pre-selection, selected
  pipeline, and operational fallback variants as separate identities. Never
  substitute one variant's rows or metrics for another.
- Occurrence scoring requires the stored occurrence probability and a
  positive-occurrence actual defined by the target contract. Conditional
  positive-amount scoring additionally requires a stored conditional amount
  output and an independently evaluated reversal component.
- Compute MASE only from a scale built strictly before the forecast origin.
  Missing scales, zero denominators, missing predictions, and abstentions must
  remain explicit capability gaps; do not fabricate zeroes or borrow another
  horizon/model.
- Treat each horizon as a separate decision surface. A pooled cross-horizon
  result is diagnostic only unless a business weighting policy was
  preregistered.
- Revenue bands based on future actuals and top-revenue slices are post-hoc
  attribution only. They must not enter fitting, selection, gating, or claims
  of prospective forecastability.
- Public evaluation artifacts must enforce the configured minimum population
  and cell-size privacy thresholds. Row-level work/channel identity, actuals,
  predictions, and private receipts stay in Git-ignored capability output.
