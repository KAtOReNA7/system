# M2 current canonical core scope

This directory is the only implementation home for current M2 model logic.

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
  pipeline must never replace or conceal the raw candidate metrics.
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
