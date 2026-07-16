# M2 old-product evaluation PRD v0.1

Status: HISTORICAL M2-A BASELINE WITH 2026-07-15 CALIBRATION V1.2 AND FORMAL-CASH-TARGET ADDENDA

This document defines the M2 old-product evaluation scope for design and fixture/synthetic testing. It is based on `docs/prd/05-老品评估.md`, `docs/prd/20-evaluation/common-evaluation-rules.md`, and the M1 closeout audit. M2-A does not authorize formal database access, real data import, `mapping_version` activation, `switch_mapping_version`, or formal old-product evaluation.

The phase statements above and below preserve the original M2-A boundary for historical traceability. For final-algorithm calibration, `src/domain/oldProductEvaluation/calibrationSpec.v1.2.amendment.json` and `docs/analysis/m2-real-data/M2-calibration-v1.2-comparator-identity-decision-v1.md` take precedence for B0b/B4 identity, full-library coverage, practical equivalence, comparator selection, Gate A, and C1. The v1 and v1.1 files remain digest-bound historical checkpoints for every subject not replaced by v1.2. The current authorized work is isolated local calibration only. It does not approve a candidate for formal decision or release and does not authorize C2-R/C2/C3 or M3.

For the formal forecast target, buyout routing, target actuals, metric populations, and related reporting, `src/domain/oldProductEvaluation/calibrationSpec.c2r.v1.1.amendment.json` and `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md` take precedence over every earlier M2/C2-R rule. Earlier C2-R results remain immutable historical-target evidence and are not formal-cash metric evidence. This target correction does not change the authoritative 3053-work/192872-fact inputs, frozen statistical scoreability or business-serving eligibility, any gate threshold, or any sealed holdout.

## 1. Positioning

M2 turns the M1 data foundation into old-product evaluation outputs: historical income analysis, lifecycle identification, remaining copyright-period forecast, rating, risks, fact-based review prompts, and backtesting evidence. M2 does not output automatic operating suggestions.

M2-A is a design and contract phase. It may use fixture or synthetic data to validate object boundaries, API shapes, page information architecture, and test expectations. It must not claim formal business accuracy.

## 2. Old Product Definition

An old product is a standard work that:

- has already produced actual sales;
- has entered the old-product library as a standard work;
- is evaluated at original-work level, not separately by raw financial ID;
- may have both `audio_copyright` and `audio_product` business forms;
- produces one combined work-level forecast, rating, risk set, and review-prompt set.

## 3. Included Scope

M2 includes:

- old-product evaluation overview;
- work-level evaluation list and detail;
- historical monthly income summary;
- business-form and channel income structure;
- lifecycle identification;
- remaining copyright-period forecast;
- one point forecast, annual breakdown, confidence, and limitation;
- rating result: `S+`, `S`, `A`, `B`, `C`, `D`, `E`;
- risk identification;
- fact-based review prompts without automatic operating actions;
- historical backtesting;
- algorithm and rule version traceability;
- input version snapshots;
- formal result version and invalidation rules;
- export and page consistency requirements.

## 4. Temporarily Excluded Scope

M2-A excludes:

- formal old-product evaluation over real business data;
- production, staging, formal, shared development, or shared test database access;
- real bill, digital copyright ledger, or operations confirmation import;
- `mapping_version` activation or switching;
- real AI model execution as a formal evaluation judge;
- annual target generation;
- new-product evaluation;
- algorithm calibration and Codex rule repair;
- notification/email delivery implementation;
- page or API implementation.

These exclusions describe the historical M2-A phase. Separately authorized isolated local calibration may use the final authoritative local inputs, but it remains non-release work and must observe the current calibration decision and safety boundary.

## 5. Input Data

Formal M2 requires the following M1 inputs:

- active current income by standard work, month, channel, and business form;
- a separately authorized `cash_commitment_snapshots` role for any future committed cash, keyed by standard work, commitment identity, and evidence-availability month, with cash type, signed/confirmed status, confirmed amount, outstanding amount/status at the snapshot, expected posting month, confirmation time, evidence-availability time, and evidence reference; `confirmed_as_of <= available_as_of <= cutoff` is mandatory, and a missing or settled/cancelled record is not a cutoff-known future receivable;
- a separately authorized truth-only settlement-link role before any historical ledger fact may be reclassified as cutoff-committed actual. Each link must bind one standard work, commitment, unique authoritative ledger fact, cash type, channel component, posting month, amount, and truth-availability time; it is unavailable to prediction, joins only after prediction lock, and may not offset an unrelated buyout event by aggregate amount;
- latest confirmed complete month;
- standard work identity and confirmed merge relationships;
- business form first positive sale month;
- work-level launch month;
- standard work name;
- author;
- complete primary classification path;
- required tag assignments;
- copyright start and end dates;
- product status;
- data issue readiness status;
- batch impact records for later invalidation and re-evaluation.

M2-A may replace these inputs with fixtures or synthetic records only if every response and page clearly marks the dataset as non-formal.

## 6. Output Results

Each successful old-product evaluation result should output:

- result identity and status;
- evaluated standard work ID;
- data cutoff month;
- input snapshot ID;
- algorithm version ID;
- lifecycle type and confidence;
- historical income summary;
- remaining copyright-month count;
- one point forecast total;
- annual forecast breakdown;
- forecast confidence;
- forecast limitation, including `extrapolated` when applicable;
- rating and rating rationale;
- risks;
- fact-based review prompts and unresolved evidence requirements;
- backtest references where available;
- created time and actor/system source;
- invalidation state.

## 7. Lifecycle Identification

Lifecycle identification must be work-level and use all active income available up to the evaluation cutoff month.

Initial lifecycle labels for M2-A fixtures:

- `growth`: recent income is increasing from an established base;
- `stable`: recent income remains materially stable;
- `declining`: recent income decreases but remains meaningful;
- `long_tail`: low but persistent income;
- `inactive`: no meaningful recent sales;
- `rebound`: recent recovery after prior decline;
- `insufficient_history`: not enough complete-month history.

Thresholds, windows, and final classification rules remain PENDING-DATA until real backtesting. M2-A must not hard-code formal thresholds as business truth.

## 8. Remaining Copyright-Period Forecast

The forecast period starts after the latest confirmed complete month and ends at the standard work copyright end date.

`REQ-M2-FORECAST-OUTPUT-001` is FROZEN as of 2026-07-14:

- Product, page, API, Excel, and formal-export contracts expose exactly one point forecast, its annual breakdown, confidence, and limitation.
- Annual values must reconcile exactly to the exposed point forecast total, subject only to a documented currency-rounding rule.
- `confidence` and `limitation` explain evidence strength and applicability. They must not encode hidden high/base/low values or act as interval endpoints.
- An internal 80% prediction interval may be computed solely for coverage and weighted interval score (`WIS`) calibration. Work-level interval bounds are not product, API, Excel, or formal-export fields.
- The aliases `optimistic`, `pessimistic`, `high`, `base`, and `low` are prohibited in the current external forecast contract. Historical fixture/prototype fields may remain only as explicitly non-formal regression evidence.
- Channel-level component forecasts may be calculated internally where required by the frozen route, but only their reconciled work-level point total and annual breakdown enter the external contract.
- A forecast extending beyond 24 months without qualifying 36/60-month cohort evidence must include the `extrapolated` limitation.
- An exact rights-end date determines the remaining-month horizon. Perpetual rights use a 60-month planning horizon and the `perpetual_rights_60_month_planning_horizon` limitation. A fully known relative term uses integer calendar months and derives its end month from `rights_start_month + relative_term_months`; when both derivation fields are absent it uses 24 months with `rights_horizon_not_exact`, while a one-field-only or invalid pair fails closed. A year-only end uses no more than the months through December of that year, capped at 24, with the same limitation. For a sales-bearing route whose formal cash model is otherwise available, `expired_unknown_date` produces a zero-month, zero-point forecast with `rights_expired_unknown_date`; it must never become a silent 24-month forecast. Pure-buyout route abstention takes precedence: without an auditable cutoff-known buyout receivable it remains null and must not be converted to zero by the rights rule. Serving validates every snapshot, filters `available_as_of <= origin`, selects the latest available month, de-duplicates identical latest payloads, and fails closed on distinct latest payloads, no eligible snapshot, unknown availability, or invalid term fields. A caller-supplied serving horizon is prohibited. Fixed-horizon backtests do not use the current rights snapshot as a historical feature. No implementation may invent an exact end date.
- Candidate sales forecasts are fitted only at 3/6/12/18/24 months. A non-core sales horizon up to 24 months uses the smallest core anchor at or above it and scales by `H/anchor`; a sales horizon over 24 months scales the 24-month sales point by `H/24`. The 36/60-month labels are audit-only and must not fit this adapter. A pure-buyout route has no historical-cycle point adapter: it either schedules auditable cutoff-confirmed receivables or abstains with a null point.

`REQ-M2-FORMAL-CASH-TARGET-001` is FROZEN as of 2026-07-15:

- `futureCashRevenueForecast` predicts future ledger cash, not accounting value, historical value, or an expected future negotiation.
- Its only allowed components are future sales cash; buyout receivables already signed or confirmed and auditable at the cutoff; and other cash whose amount and expected posting month were confirmed and auditable at the cutoff.
- Uncommitted future buyout, a next buyout inferred from historical cadence, probability times expected buyout amount, future amortization of already received buyout cash, and `buyoutMonthlyEquivalent` are excluded.
- Confirmed receivables are added to the sales cash point and allocated to the annual breakdown by expected posting month. They are not subtracted or spread uniformly across the horizon.
- A ledger occurrence, `businessForm`, classifier-derived buyout event, or evidence that became available after the cutoff is not proof that the cash was committed at the cutoff.

The following are evaluation or audit metadata, not additional work-level forecast payload fields:

- yearly breakdown;
- remaining-month count;
- assumptions and rule version;
- data sufficiency flags.

M2-A may use deterministic fixture formulas. M2-C/M2-D must use backtested rules and formally ready M1 data.

Final-algorithm candidates must not apply one time-series route to every revenue model:

- `pure_sales_share`: predict each eligible sales channel independently, sum the channel points, and add all future receivables explicitly confirmed and auditable at the cutoff; a cutoff-confirmed buyout receivable is included in cash and creates a route-review fact, but may not be dropped merely to preserve the earlier route label;
- `pure_buyout`: first determine whether at least one outstanding buyout receivable is signed/confirmed and auditable at the cutoff, independently of the current horizon. If one exists, retain its evidence/status internally, set `modelPredictionAvailable=true` and `routeAbstained=false`, and set `rawModelPrediction` to the sum of cutoff-known outstanding cash expected inside the horizon; `servedPrediction` still depends on business-serving eligibility. A valid commitment expected after a shorter horizon yields an explained numeric zero for that horizon, not an uncommitted abstention. If no buyout receivable exists, set `modelPredictionAvailable=false`, `routeAbstained=true`, `rawModelPrediction=null`, `servedPrediction=null`, and `abstentionReason=uncommitted_future_buyout_not_forecastable`; other confirmed cash alone does not unlock the pure-buyout route, and zero is prohibited;
- `buyout_plus_sales`: sum the independent sales-channel points and any signed/confirmed cutoff-known future receivables. With no such receivable, forecast sales only and set `excludesUncommittedFutureBuyout=true`;
- an unresolved revenue model must not be silently assigned to any of the three routes and must be reflected in eligibility or limitation according to the pre-registered spec.

## 9. Rating System

Ratings are `S+`, `S`, `A`, `B`, `C`, `D`, `E`.

Design principles:

- when a formal cash point is available, the single point forecast value is the primary forecast signal; a pure-buyout route abstention must not fabricate zero, and its rating may continue to use the separately marked historical/rating-only buyout monthly equivalent;
- lifecycle, remaining copyright period, risk, and operational opportunity may adjust the result;
- `S+` requires explicit confirmation in formal flow;
- `E` indicates down-shelf or no meaningful future income;
- concrete thresholds remain PENDING-DATA until backtesting.

`buyoutMonthlyEquivalent` remains a rating and historical-value construct. Every current use must carry `ratingContextOnly=true`, `historicalValueOnly=true`, `notCashForecast=true`, and `notIncludedInFutureCashRevenue=true`. It may explain ratings and compare historical buyout value, but it may not enter a cash point, annual cash breakdown, training target, interval center, or next-buyout timing estimate.

M2-A fixture tests may define temporary thresholds inside test fixtures, but those thresholds must be labelled non-formal.

## 10. Risk System

Initial risk categories:

- copyright near expiry;
- missing or incomplete master data;
- incomplete month included attempt;
- volatile income;
- concentration in a single channel;
- business form mismatch;
- inactive or down-shelf status;
- data issue unresolved;
- forecast confidence low.

Each risk should include severity, affected field, rationale, observed evidence, and any required human confirmation. It must not include a suggested operating action or mitigation.

## 11. Review Prompts and No-Operating-Suggestion Boundary

`REQ-M2-OUTPUT-001` is FROZEN as of 2026-07-13:

- M2 must not output automatic operating suggestions, resource-investment levels, or recommended actions such as promotion, pricing, renewal, downlisting, repackaging, re-recording, bundling, or channel adjustment.
- M2 may output fact-based review prompts that identify a conflict, missing evidence, risk, or required human confirmation.
- A review prompt must describe the observed evidence and the item requiring confirmation. It must not select an operating action for the user.
- Current formal results, pages, exports, task payloads, and release artifacts must omit operating-suggestion fields.
- Legacy fixture/prototype suggestion fields may remain only for historical regression coverage. They are non-formal and must not be promoted into current or formal outputs.

## 12. Backtesting

Backtesting compares predictions made at historical cutoff months with later actual sales.

Backtesting dimensions:

- lifecycle type;
- classification;
- revenue scale;
- business form mix;
- source;
- revenue model;
- shelf and rights status;
- high-value cohort;
- long-tail, dormant, sparse-income, and spike-candidate cohorts;
- rights-term type;
- algorithm version;
- forecast horizon;
- rating.

All dimensions used as model features or routing inputs must be reconstructed as of the historical cutoff. A work enters an origin's case universe only after its first observed income source row; a future catalog entrant is absent at earlier origins, not represented as a blocked zero. When a historical shelf or rights-status snapshot does not exist, the current value may be used only as a labelled post-hoc analysis slice and must never enter historical features, routing, eligibility, parameter/model selection, gate tuning, or acceptance failure.

Core rolling horizons are 3, 6, 12, 18, and 24 months. Cohorts with sufficient history also receive non-selection 36- and 60-month long-horizon audits. The final two eligible origins are the untouched final holdout and must not be used for model, parameter, threshold, forecastability, stratum, confidence, interval, or gate selection.

Before v1.2 baseline replay or candidate training, the machine-readable v1.2 amendment must bind the canonical digests of both prior checkpoints and freeze the corrected identities, formulas, state semantics, origins, seed, full-3053 population denominators, strict equivalence rule, comparator bundle, Gate A, C1 search space, and C1 acceptance gates. No result-dependent threshold or eligibility edit is allowed. Any change after opening the final holdout requires a new full spec and a new untouched holdout.

Comparator roles are distinct:

- `B0a` is the previously recorded v1.1 metric set and is audit-only. It cannot participate in fair ranking or candidate acceptance.
- `B0b` is `B0b_v1_1_leakage_free_replay`: the legacy Model E selector and A/B/C/D point formulas, replayed with cutoff-only quantiles/priors, neutral historical rating, independent serving state, and mandatory revenue-model/channel routing.
- `B1`, `B2`, and `B3` are the pre-registered simple baselines defined by the digest-bound `calibration-spec-v1` plus `calibration-spec-v1.1-amendment` pair.
- `B4` is `B4_formula_switched_legacy_variant`, the lifecycle-robust formula formerly misnamed B0b. It remains a legal reported baseline but is not a faithful v1.1 identity.

The fitted seven-stage lifecycle-factor paragraph in the prior version describes B4, not faithful B0b. Faithful B0b uses the legacy selector structure with origin-as-of component quantiles/priors and no outcome-fitted lifecycle vector. Historical current-state gates, target-20%-coverage boundary movement, blocked-null-to-zero scoring, unconfirmed-spike automatic damping, and unavailable overlapping interval residuals are illegal and are explicitly listed as required-policy divergences in the formula-difference manifest.

The digest-bound B0a-to-“B0b” attribution report is an immutable historical audit artifact. Its Stage 7 is now identified as B4, not faithful B0b: recorded B0a; legacy model on the new fixed case-key intersection; as-of quantiles/priors; as-of rating/lifecycle/features; new eligibility; new abstention scoring; and the formula-switched lifecycle variant. Stages 2 through 7 use exactly the same development intersection keys and change only the named layer. The recorded B0a has no identical case keys, so its difference to Stage 2 is a non-causal historical-to-intersection bridge gap. Faithful B0b is defined only by v1.2 and the new formula-difference manifest. A missing legacy artifact must be reported as not reconstructable, never fabricated, and no attribution stage may participate in comparator or candidate selection.

The three warm-up origins are not comparator or point-gate cases. They may supply interval-only residuals only when their predictions were materialized before truth join under the frozen cold-start contract and their labels are target-available at the later score origin. Faithful `B0b` uses its origin-as-of Model E selector context without fitted lifecycle factors; B4 alone uses the historical lifecycle-factor roles; `B1/B2/B3` use their frozen formulas. If Gate A later authorizes C1, C1 uses only the v1.2 pre-registered insufficient-inner-evidence fallback and its own prior out-of-fold residuals. No C2-R/C2/C3 fallback or training is authorized by this PRD revision. At the first required score origin, `2020-12`, the only authorized warm-up blocks are `2019-06:[3,6,12,18]`, `2019-12:[3,6,12]`, and `2020-06:[3,6]`. Warm-up rows cannot enter comparator selection, point gates, or bootstrap, and cannot change any interval method, threshold, fallback group, or gate.

This baseline phase is development-only. C1 and legacy-target C2-R development validations have completed and both remain `FAIL`; neither is formal-cash acceptance evidence. The current amendment authorizes only the C2-R.1 target-semantic correction, as-of evidence audit, actual partition, bridge, conservation checks, and tests before any retraining or tuning. The final two eligible origins, embargo shadow, and deferred 60-month labels remain closed; this revision does not authorize `selectedCandidateId`, final-holdout evaluation, automatic C2-R.1 training, C2/C3, release, or M3. Any later final-holdout protocol requires a separate explicit user decision and a precommitted candidate; a confirmation failure can never trigger model switching on the opened holdout.

All comparators and candidates must use identical case keys. A future-perturbation invariance test must prove that changing data after a cutoff cannot change that cutoff's features, route, `statisticallyScoreable`, `businessServingEligible`, raw prediction, served prediction, abstention reason, or case keys. Baseline results and this integrity evidence must be reviewed before candidate training begins.

`forecastabilityStatus` is no longer allowed to represent three different concepts. The corrected contract keeps these fields independent:

- `statisticallyScoreable`: the case has at least 12 observed calendar months before the cutoff, a complete and available target-actual window, valid income facts, and valid identity reconciliation, so it participates in model backtesting;
- `modelPredictionAvailable`: the model materialized a finite numeric `rawModelPrediction` before truth join;
- `businessServingEligible`: model-independent cutoff-available hard rules permit displaying a numeric forecast;
- `abstained`: `servedPrediction` is null and a frozen-precedence `abstentionReason` is mandatory.

A scoreable case does not disappear because it has no historical positive income, an unresolved route, or a business abstention. The historical-target v1.1/v1.2 contract required a numeric `rawModelPrediction` for every scoreable case. The formal-cash amendment narrows that rule: a scoreable pure-buyout case without auditable cutoff-known receivables keeps its case and eligibility but has `modelPredictionAvailable=false`, `routeAbstained=true`, and a null raw/served point. For every route, a null prediction must never be coerced to zero in model WAPE.

Historical-target metrics were reported in three explicitly different populations:

- all-scoreable model metrics use `rawModelPrediction` for every `statisticallyScoreable` case and include WAPE, MAE, SMAPE, signed aggregate bias, and horizon stability;
- served-cohort metrics use `servedPrediction` only for `statisticallyScoreable && businessServingEligible` cases and include WAPE, bias, and high-value performance;
- abstention metrics include served work share, served actual-revenue share, top1/top5/top10 served-revenue share, abstained work count and revenue share, reason distribution, and high-value abstained count;
- internal 80% prediction-interval coverage and `WIS`, using only frozen warm-up/forward residual roles with `origin < score_origin`, `target_end <= score_origin`, and `label_available_as_of <= score_origin`;
- signed aggregate bias, fixed as `(sum(pred)-sum(actual))/sum(actual)` for a slice with positive actual revenue;
- business usability notes.

The formal-cash amendment additionally separates each locked historical target window into:

- `forecastableCashActual`: sales cash actual plus buyout/other cash that has valid cutoff-as-of commitment evidence; this is the actual used by primary point metrics and candidate gates;
- `uncommittedBuyoutSurpriseActual`: a later ledger buyout that was unknown at the cutoff; this is excluded from model WAPE and bias but must be reported by case count, amount, share of total ledger cash, and business impact;
- `totalLedgerCashActual`: all final ledger cash in the target window; this is used only for an `endToEndBusinessGap` or equivalent business-coverage audit and must never be named model WAPE.

Every case must conserve `forecastableCashActual + uncommittedBuyoutSurpriseActual = totalLedgerCashActual`. If historical signing/confirmation and evidence-availability timestamps are absent, a later buyout is surprise cash; it must not be post-hoc restored as cutoff-known. Prediction lock still precedes truth join. The case key, statistical scoreability, and existing business-serving eligibility remain frozen even when the target semantics change.

The primary formal-cash model population is `statisticallyScoreable && modelPredictionAvailable && !routeAbstained`, scored with `rawModelPrediction` against `forecastableCashActual`. A scoreable pure-buyout case without a cutoff-known commitment remains in the case universe and abstention/end-to-end reports, but its null raw point is never coerced to zero. This is a narrow target-semantic override of the earlier all-scoreable numeric-raw rule; it is not an eligibility change.

The frozen bias thresholds do not change: signed aggregate bias must remain within +/-10% for the primary formal-cash model population overall, its served cohort, and its high-value subset, and within +/-15% at each core horizon on that same primary population. A zero-actual slice has undefined signed aggregate bias and must be reported separately rather than treated as a pass. Historical-target all-scoreable bias remains audit evidence only. Before C2-R.1, the fixed comparator bundle must be re-scored against `forecastableCashActual` on `statisticallyScoreable && modelPredictionAvailable && !routeAbstained`; a comparator may not be selected per individual gate.

For formal-cash replay, the internal interval population is the pre-registered primary formal-cash model population beginning with the `2020-12` score origin and uses `rawModelPrediction` against `forecastableCashActual`. Route-abstained null cases are reported rather than zero-filled and are not silently complete-case filtered from an otherwise eligible model population. Every required numeric key must have an interval for both compared models; missing, non-finite, negative, or otherwise invalid required residual or interval is an integrity/gate failure.

Uncertainty comparisons and confidence intervals must use a paired two-way block/bootstrap design that independently resamples `standard_work_id` and origin clusters with replacement and weights each paired case by the product of their multiplicities. All horizons within a work-origin block remain together; overlapping cases must not be sampled as independent observations.

For the historical-target v1.2 baseline checkpoint, the legal empirical leader was identified by full-precision all-scoreable raw WAPE. Its practical-equivalence result and comparator bundle remain immutable audit evidence, not formal-cash acceptance evidence. Formal-cash replay retains the same candidate identities, simplicity order, 1% WAPE bound, paired block-bootstrap equivalence interval, two-percentage-point bias-difference bound, and top10/core-horizon 2% bound, but evaluates them on the primary formal-cash population and `forecastableCashActual` before C2-R.1. B0a never participates, and no result may silently inherit a historical-target metric as a formal-cash comparator result.

Statistical scoreability and business-serving eligibility are frozen before corrected replay. They may use only model-independent, cutoff-available hard conditions and may not use current rating, current shelf/rights status, current risk bucket, current business action status, candidate results, or holdout results. The prior 77.88% forecastable-revenue share and 20.38% true-blocked-revenue share are historical references only; labels or thresholds must not move to reproduce either ratio. Current source/shelf/rights values without historical snapshots remain post-hoc-only.

The v1.1 pre-C1 top10 served-revenue 90% rule remains an audit-only non-regression reference on its original all-scoreable overlapping-case denominator. It is not a Gate A item and may not be reinterpreted as a full-3053 bucket gate: that would make frozen historical scoreability itself an impossible candidate prerequisite. V1.2 reports scoreable and served coverage against top1/top5/top10 buckets ranked across all 3053 works before filtering, uses those values only for post-hoc population disclosure, and suppresses a served/abstained complement smaller than 10. The numerical 90% reference has not been lowered; it has been removed from candidate authorization because the latest exhaustive Gate A contract replaces the invalid denominator semantics. Eligibility still may not move to hit any coverage target.

A spike rule first creates a candidate for evidence review. It must distinguish buyout, launch burst, batch proration, settlement lag, and true anomaly; no unconfirmed spike type may trigger automatic attenuation.

The latest user decision supersedes every prior future-buyout point rule. It requires the formal-cash target correction and audit to complete before C2-R.1 may be retrained or tuned. No automatic C2-R.1 training follows this correction, and C2/C3 remain outside scope. Every result remains `not_for_formal_decision` until Chinese business sampling and explicit user approval.

### 2026-07-16 formal-cash comparator and C2-R.1 development checkpoint

After separate user authorization, formal-cash B0b/B1/B3/B4 were replayed on the unchanged 18,615 development cases and the common 7,851-case primary model population. B4 is the frozen formal-cash primary comparator. Gate B passed 14/14 only after its Phase A commit was pushed and the complete validation suite was rerun on the remotely confirmed commit tree. The non-overlapping surprise audit uses a stable identity only within the frozen authority revision; it reports 168 unique ledger facts, 1,442,698.00 cash, and 114 involved works without re-labeling the 466 overlapping windows as a full-library share.

C2-R.1 then ran under `calibration-spec-c2r1-v1`, using 45 pre-registered transparent channel candidates, strictly earlier-origin route selection, zero-retaining sales histories, B4 fallback, and no future-buyout cycle, probability, amortization, or post-hoc outer scaling. It preserved the 7,851-case model population and produced overall WAPE 0.58382425 and signed aggregate bias +0.02933805, but passed only 13 of 23 acceptance conditions and is therefore `FAIL`. This failure must not be relabeled as conditional approval. C2/C3, final holdout, embargo shadow, deferred 60-month labels, business approval, release, and M3 remain unauthorized.

M2-A designs the object model and fixture checks. M2-C/M2-D require real historical data readiness.

## 13. Version and Invalidation Rules

This document follows `REQ-EVAL-001` to `REQ-EVAL-004`:

- evaluation task and evaluation attempt are separate;
- cancelled tasks do not create attempts;
- failed attempts do not create formal results;
- formal result statuses are only `current`, `historical`, and `invalidated`;
- evaluation exception is a work-level reminder, not a formal result status;
- re-evaluation creates a new result and preserves prior versions.

Invalidation triggers:

- bill batch revoke or controlled reimport;
- mapping version change;
- basic information version change;
- classification or tag release change;
- algorithm version retirement;
- manual data correction affecting the input snapshot.

## 14. Export Scope

M2 export should match page filters and include:

- overview totals;
- list rows;
- selected detail fields;
- one point forecast total and its yearly breakdown;
- forecast confidence and limitation;
- rating and risk fields;
- review-prompt and unresolved-risk summary;
- backtest metrics where requested.

M2-A only defines export consistency tests. It does not implement export.

Current Excel and formal export schemas must not contain scenario or prediction-interval columns. Internal backtest artifacts may retain the 80% interval evidence needed for aggregate coverage and `WIS` calibration, but that evidence is not a work-level formal forecast output.

The exported point is `futureCashRevenueForecast`. A confirmed receivable is assigned to the calendar year of its cutoff-known expected posting month. An uncommitted pure-buyout abstention exports a null point, an empty annual breakdown, `confidence=unavailable`, and the required limitation; it must not export a zero forecast.

## 15. M2 Does Not Do

M2 does not:

- replace the finance system;
- modify M1 income facts;
- import real bills;
- activate or switch mapping versions;
- generate annual targets;
- evaluate new-product topics;
- run algorithm repair loops;
- hide data gaps;
- treat fixtures as formal business evidence.
- output automatic operating suggestions or resource-investment actions.

## 16. Phase Split

| Phase | Scope | Data boundary | Exit criteria |
| --- | --- | --- | --- |
| M2-A | PRD, API, data model, page plan, test plan | fixture/synthetic only | design artifacts reviewed and tests planned |
| M2-B | implementation preparation and local non-formal prototype | local Docker or in-memory fixture, no formal data | API/page/model prototype passes fixture tests |
| M2-C | controlled formal-data readiness | explicit formal authorization required | M1 formal data readiness and backtest dataset approved |
| M2-D | formal old-product evaluation | authorized formal environment only | full old-product evaluation and backtest acceptance |

The 2026-07-14 activity is a separately authorized isolated local final-algorithm calibration and candidate-selection step. It does not retroactively change the historical phase table, does not enter M3, and does not grant release authority.

## 17. Acceptance Standards

M2-A acceptance:

- PRD covers scope, non-goals, phase split, inputs, outputs, lifecycle, forecast, rating, risks, review prompts, the no-operating-suggestion boundary, backtest, versioning, export, and acceptance.
- API contract covers overview, list, detail, history, gaps, backtest, algorithm version, and controlled task APIs, and exposes only the frozen point forecast, annual breakdown, confidence, and limitation forecast fields.
- Data model design covers evaluation batches, results, summaries, lifecycle, forecasts, ratings, risks, review prompts, backtests, versions, snapshots, invalidation, and M1 dependencies. Legacy suggestion persistence is not part of the current formal output contract.
- Page plan covers overview, list, detail, gaps, backtest/version pages, states, fixture labels, incomplete-month notice, and formal-data blocking.
- Test plan covers fixture, synthetic, readiness, lifecycle, rating, forecast, backtest, API, page, export, and prohibited-action tests.

Final-algorithm calibration additionally requires the committed pre-registration, untouched final holdout, leakage and future-perturbation invariance tests, B0a audit plus faithful B0b/B1/B2/B3/B4 identical-case replay, routed revenue-model handling, formal-cash target separation, cutoff-as-of commitment audit, old-target-to-new-target bridge, per-case amount conservation, correlated block-bootstrap inference, internal 80% interval calibration, frozen signed-bias gates, long-horizon audit, Chinese business sampling plan, and explicit `not_for_formal_decision` state.

The original M2-A acceptance statement treated M1 readiness as pending. Current foundation readiness is complete, but final M2 algorithm acceptance remains blocked until a pre-registered candidate passes every gate, Chinese business sampling is complete, and the user explicitly approves a later formal decision and release.
