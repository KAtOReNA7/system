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
- When business authority explicitly establishes intrinsic category and work
  source at work creation, do not fabricate historical `availableAt` values.
  Such static fields may support diagnostics or a preregistered hierarchical
  fallback, but never a direct cash multiplier.
- Select core populations only from cash visible at the forecast origin.
  Work-count coverage is not revenue coverage, and future-actual TopN may be
  used only as a post-hoc oracle diagnostic.
- Current M2 service, training, and evaluation scope is dynamic Core80/Core90
  legacy works with at least three complete bill months, restricted to
  canonical work-channel pairs that also have at least three complete bill
  months at that origin. Recompute membership independently at every forecast
  and training pseudo-origin, include all cutoff-revenue ties, and never use a
  current fixed Core list to backcast history.
- Future new works, future first-observed channels, and works outside Core are
  abstained populations, not zero predictions. Do not pool, compose, allocate,
  or add them back to a current-M2 candidate actual or error denominator.
- A Core-only evaluation is invalid as evidence about tail interference when
  the fitted training target still includes unrestricted tail cases. Training
  population ablations must change only the origin-safe training population,
  preserve every raw arm, and compare on identical Core cases.
- `M2-PORT-LRC01` and `M2-PORT-ETS01` are portfolio capabilities outside the
  current work-model ranking. Preserve their historical identities and
  evidence, but never use company-total, future-work, or future-channel metrics
  to select a current M2 work model.
- Preserve every preregistered raw ablation result. A fallback or selected
  pipeline must never replace or conceal raw candidate metrics or raw FVA.
- Model selection must be nested inside the applicable outer work or time
  split. Exact v0.3, later-origin, final holdout, provider, database, canary,
  release, and M3 data must not be read for selection.
- Sparse channel/category cells fall back deterministically through the
  preregistered hierarchy; they do not stop the experiment and must not be
  filled with fabricated observations.
- 新的出版行业适配模型必须绑定
  `M2-PUBLISHING-SCALE-SUPPORT-01`。禁止重新引入一个跨 mechanism、platform
  和 taxonomy 共用、又没有本项目训练侧证据的固定作品数门槛；月度行数不得冒充
  独立作品数。
- 出版行业适配节点必须显式报告 `DIRECT_FIT`、`SHRUNK_FIT`、
  `POOLED_PARENT` 或 `REPORT_ONLY`，以及 distinct works、positive works、
  work-cluster ESS、现金 ESS、集中度、连续收缩权重和父层回退原因。
- 当前三级分类和 work-platform 授权关系缺少历史
  `effectiveAt/availableAt`，只能是 `REPORT_ONLY`。在权威补齐前，不得从
  current-only 快照向 forecast origin 回填分类或授权；已观察现金关系也不得解释为
  授权关系。
- Public artifacts contain only aggregate evidence. Work IDs, channel IDs,
  row-level actuals, and row-level predictions remain in capability-scoped,
  Git-ignored private output.
- Extend the existing human-anchored materializer and runner modes. Do not
  create a second production loader, route, API, runtime, or duplicated
  historical runner.
- Missing rebuildable Git-ignored caches or historical receipts must not block
  portable public development. A private evaluation may be blocked only when
  an irreplaceable authoritative source is missing or no legal historical
  forecast origin can be formed.
- Company-level M2 sales-share forecasting must keep existing core, existing
  tail, future new-work portfolio, and existing-work new-channel portfolio cash
  mutually exclusive and amount-conserving. Future new works and future channel
  entries may be forecast only as portfolio amounts, never as identities.
- Do not default 36-month forecasts to recursive work-level growth factors.
  Estimate each catalog year directly from mature pre-origin pseudo-origins;
  judge support from mature time blocks, independent samples, positive cash
  denominators, and uncertainty rather than fixed 50/100-work thresholds.
- Horizon decisions remain separate. A 3/6-month pass must not authorize a
  12/36-month claim, and a long-horizon failure must not erase valid short-term
  evidence. Revenue coverage, not work-count coverage, is the business target.
- 出版行业适配渠道核心的 K7D 一次性私有授权已在候选拟合前的实现阻断中消耗。
  未获新的明确授权、独立新收据和新 exact-head Linux/Windows CI 前，不得重跑、
  覆盖失败收据或把公开 synthetic 验证解释为私有候选结果。

## Evaluation contract rules

- Read the current evaluation-contract identity and status from
  `config/m2-model-registry.v1.json`. A revision may activate for development
  evaluation only after every semantic, authority, conservation, leakage,
  determinism, privacy, and runtime exact-head Linux/Windows CI gate passes.
  No evaluation contract may be wired into production, the automation gate,
  or exact v0.3 serving merely because a frozen rescore completed.
- Reversal restatement starts at the posting month and allocates backward by
  month only within the same cash category, work, canonical channel, and
  currency scope. Never cross scopes, reuse consumed positive cash, round an
  unresolved residual away, or fall back to a company aggregate.
- Never physically delete a raw financial reversal or the allocated component
  of a partially allocated reversal. Only the unallocatable residual component
  may be transparently excluded from the development-modelable target, and it
  must remain visible in financial reconciliation.
- Keep posting-time accounting, as-of restated, final accounting
  reconciliation, and development-modelable restatement views separate.
  Future reversals may update mature labels only; they must never enter
  features at an earlier forecast origin.
- Experiment prerequisites are arm-specific. An auxiliary offset required by a
  structured-offset or blend arm must not block an independent arm that does
  not use that offset. User-visible experiment-arm reports must include the
  full Chinese name, stable model ID, and parent experiment/arm ID rather than
  a bare local abbreviation.
- “渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心”
  (`M2-CHAN-GEN02`, `M2-EXP-CHANNEL-GENERATIVE-02/G1`) must never read frozen
  learnedGlobal values as a feature, offset, multiplier, training prerequisite,
  or inner-selection prerequisite. Frozen G0 may be read only after the raw G1
  outer predictions exist, and only to score the same development-modelable
  actual definition on the exact paired outer cases. A missing G2/G3 offset
  must not block this independent arm.
- Posting-time and reversal-restated actual definitions require distinct
  comparability groups. Same-case label-impact pairs are allowed, but do not
  rank models or name a winner across actual definitions.
- Resolve repository roots and execution Git identities at runtime. Do not
  persist drive letters, machine-absolute paths, or a copied active HEAD in
  implementation or long-lived contracts. Content payload digests may remain
  authoritative; transport hashes and package paths are audit metadata only.
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
