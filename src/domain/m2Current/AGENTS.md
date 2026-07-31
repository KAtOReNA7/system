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
- Current M2 service and primary evaluation scope is dynamic Core80/Core90
  legacy works with at least three complete bill months, restricted to
  canonical work-channel pairs that also have at least three complete bill
  months at that origin. Recompute membership independently at every forecast
  origin, include all cutoff-revenue ties, and never use a current fixed Core
  list to backcast history. Each model experiment must preregister an
  origin-safe training population. Full mature history may be statistical
  support only when labeled `FULL_MATURE_TRAINING_SUPPORT`; that label neither
  serves the tail nor means Core-only training. Core-only, Core90-only, and
  Core80-only training are explicit arms whose raw results must be retained.
  This governance follows
  `M2-core-legacy-tail-interference-test-v0.1.md`:
  `TAIL_INTERFERENCE_NOT_CONFIRMED`, with only a small unstable Core90 change
  and a material Core80 degradation.
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
- M2 的 monthly materialization、primary/strict packed rows、冻结 baseline
  prediction rows、candidate/evaluation rows、manifest、摘要和冲销
  reconciliation/allocation 都属于 `PRIVATE_DERIVED_CACHE`。缺失时从已验证的
  `PRIVATE_SOURCE_AUTHORITY` 与冻结实现自动重建，不得要求从旧电脑恢复。
- 历史 execution/run/attempt receipt 属于 `PRIVATE_RUN_PROVENANCE`，缺失只告警，
  不得作为拟合输入、标签、baseline 或运行硬门禁，也不得补造。每次当前执行仍必须
  生成新的版本化 receipt，并用当次 digest 绑定代码、权威输入和输出。
- M2 prepare/runner 必须在运行时解析仓库根并创建模型专属版本化 Git-ignored
  目录。派生缓存可重建或替换 current-cache 镜像，但冻结历史 artifact、原始账单
  和用户确认关系不可覆盖或改写。
- Extend the existing human-anchored materializer and runner modes. Do not
  create a second production loader, route, API, runtime, or duplicated
  historical runner.
- Missing rebuildable Git-ignored caches or historical receipts must not block
  portable public development. A private evaluation may be blocked only when
  an irreplaceable authoritative source is missing or no legal historical
  forecast origin can be formed.
- Preserve `M2-WORK-HPSR01`'s frozen mechanical result
  `M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2`, including
  its metrics, population, report, and registry evaluation row. Its amended
  scientific interpretation is
  `M2_HPSR01_CONTRACT_UNSUPPORTED_SCIENTIFICALLY_INCONCLUSIVE`: a single
  `2025-11` time block with 57 works, a bootstrap interval crossing zero, and
  conflicting H50/M30/L20 directions cannot establish that the whole
  head-protected segmentation direction fails. Any L20-only aggregate
  arithmetic is `POST_HOC_AGGREGATE_ARITHMETIC_NOT_MODEL_EVIDENCE`; it is not
  a row-level rescore, model evaluation, or leaderboard entry.
- `M2-WORK-HPSR02` is a
  `POST_HOC_INSPIRED_PROSPECTIVELY_PREREGISTERED` independent-evaluation
  candidate, not an active candidate. Its only allowed structure keeps frozen
  LG01 rowwise in H50 and M30 and applies the already frozen HPSR01 bounded
  residual correction only in L20. Public synthetic code may verify
  invariants, but must consume no outcome or private data. Do not run a real
  evaluation, bootstrap, training, alpha search, bound re-estimation, or K2
  without a later explicit authorization and dynamically complete bills. The
  prospective final holdout remains unopened, and the production loader,
  route, API, and current runtime composition must not import HPSR02.
- If the first legal independent evaluation of `M2-WORK-HPSR02` is
  `NOT_SUPPORTED` or `INCONCLUSIVE`, end cash-only adjacent-model work and do
  not create HPSR03. Only `SUPPORTED` may permit at most one second independent
  origin confirmation after separate user authorization; no result
  automatically authorizes production.
- Historical company portfolio, future-new-work, and existing-work
  future-channel studies are `FUTURE_PHASE` references only. Preserve their
  mutually exclusive, amount-conserving audit identities, but do not treat
  them as current-M2 models, current actual, current ranking inputs, or current
  implementation scope.
- Do not default 36-month forecasts to recursive work-level growth factors.
  Estimate each catalog year directly from mature pre-origin pseudo-origins;
  judge support from mature time blocks, independent samples, positive cash
  denominators, and uncertainty rather than fixed 50/100-work thresholds.
- Three-, six-, twelve-, and thirty-six-month outputs are all required current
  M2 business outputs and remain separate decision surfaces. A short-horizon
  pass must not authorize a longer-horizon claim, and a long-horizon failure
  must not erase valid short-term evidence. The thirty-six-month output is a
  hard gate based on multiple legal historical origin-safe rolling cash
  origins, per-origin stability, and uncertainty, with an explicit
  non-prospective caveat. Revenue coverage, not work-count coverage, is the
  business target.
- A sixty-month output is only a low-confidence mature-catalog scenario
  reference for a future M3 precursor. It is not a current-M2 ranking surface,
  acceptance gate, or implementation target.
- 受控 private development 可在首个有效 raw candidate 评价之前修复基础设施、
  路径、schema、缓存、receipt、内存或确定性实现错误并保留逐次 attempt receipt。
  一旦首个完整、可解释结果产生，必须立即冻结；不得根据 outer outcome 修改特征、
  参数、层级、fold 或评价门后再运行第二个版本。
- 已完成或失败的 private evaluation 不授予再次执行权；后续模型运行仍需用户在当前
  任务中明确授权、独立新收据和新 exact-head Linux/Windows CI。

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
