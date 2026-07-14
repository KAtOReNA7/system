# M2 old-product evaluation PRD v0.1

Status: HISTORICAL M2-A BASELINE WITH 2026-07-14 CALIBRATION ADDENDUM

This document defines the M2 old-product evaluation scope for design and fixture/synthetic testing. It is based on `docs/prd/05-老品评估.md`, `docs/prd/20-evaluation/common-evaluation-rules.md`, and the M1 closeout audit. M2-A does not authorize formal database access, real data import, `mapping_version` activation, `switch_mapping_version`, or formal old-product evaluation.

The phase statements above and below preserve the original M2-A boundary for historical traceability. For final-algorithm calibration, the frozen decisions in `docs/analysis/m2-real-data/M2-final-forecast-calibration-decision-v1.md` and the committed machine-readable `src/domain/oldProductEvaluation/calibrationSpec.v1.json` (`calibration-spec-v1`) take precedence over older forecast-output, baseline, and gate descriptions. The current authorized work is isolated local calibration only. It does not approve a candidate for formal decision or release and does not authorize M3.

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
- An exact rights-end date determines the remaining-month horizon. Perpetual rights use a 60-month planning horizon and the `perpetual_rights_60_month_planning_horizon` limitation. A fully known relative term uses integer calendar months and derives its end month from `rights_start_month + relative_term_months`; when both derivation fields are absent it uses 24 months with `rights_horizon_not_exact`, while a one-field-only or invalid pair fails closed. A year-only end uses no more than the months through December of that year, capped at 24, with the same limitation. `expired_unknown_date` produces a zero-month, zero-point forecast with `rights_expired_unknown_date`; it must never become a silent 24-month forecast. Serving validates every snapshot, filters `available_as_of <= origin`, selects the latest available month, de-duplicates identical latest payloads, and fails closed on distinct latest payloads, no eligible snapshot, unknown availability, or invalid term fields. A caller-supplied serving horizon is prohibited. Fixed-horizon backtests do not use the current rights snapshot as a historical feature. No implementation may invent an exact end date.
- Candidate forecasts are fitted only at 3/6/12/18/24 months. A non-core horizon up to 24 months uses the smallest core anchor at or above it and scales by `H/anchor`; a horizon over 24 months scales the 24-month point by `H/24`. The 36/60-month labels are audit-only and must not fit this adapter. `pure_buyout` instead uses its frozen historical monthly-equivalent rule for the requested horizon.

The following are evaluation or audit metadata, not additional work-level forecast payload fields:

- yearly breakdown;
- remaining-month count;
- assumptions and rule version;
- data sufficiency flags.

M2-A may use deterministic fixture formulas. M2-C/M2-D must use backtested rules and formally ready M1 data.

Final-algorithm candidates must not apply one time-series route to every revenue model:

- `pure_sales_share`: predict each eligible channel independently as a point value, then reconcile by summing the channel points;
- `pure_buyout`: use historical buyout cadence and monthly-equivalent treatment;
- `buyout_plus_sales`: forecast future sales-share income only and never forecast a future buyout payment;
- an unresolved revenue model must not be silently assigned to any of the three routes and must be reflected in eligibility or limitation according to the pre-registered spec.

## 9. Rating System

Ratings are `S+`, `S`, `A`, `B`, `C`, `D`, `E`.

Design principles:

- the single point forecast value is the primary signal;
- lifecycle, remaining copyright period, risk, and operational opportunity may adjust the result;
- `S+` requires explicit confirmation in formal flow;
- `E` indicates down-shelf or no meaningful future income;
- concrete thresholds remain PENDING-DATA until backtesting.

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

Before the final holdout is opened, the committed machine-readable `src/domain/oldProductEvaluation/calibrationSpec.v1.json` (`calibration-spec-v1`) must freeze every model and parameter, B0-B3 definition, candidate definition, forecastability rule, stratum definition, seed, horizon, comparator, bootstrap rule, and acceptance gate. Any change after opening the holdout requires a new version and a new untouched holdout; a result-dependent gate edit is prohibited.

Comparator roles are distinct:

- `B0a` is the previously recorded v1.1 metric set and is audit-only. It cannot participate in fair ranking or candidate acceptance.
- `B0b` is the v1.1 logic replayed through the new leakage-free `predict_as_of` kernel and is the only v1.1 comparator eligible for fair comparison.
- `B1`, `B2`, and `B3` are the pre-registered simple baselines defined by `calibration-spec-v1`.

`B0b` fair-comparison eligibility is conditional on parameter provenance as well as cutoff-safe features. Full-period outcome-exposed v1.1 thresholds or factors must not be reused. Its semantic thresholds are pre-registered, and one global seven-stage lifecycle-factor vector must be fitted across the core horizons only on cross-horizon-purged development cases, written to the committed machine-readable fitted-parameter artifact, and verified against the spec, fit/comparator/OOF fingerprints, and interval-warm-up prediction/case fingerprints before any fair replay is opened. Warm-up counts, the pre-truth prediction lock, and the fact that warm-up outcome labels were not used to make warm-up points must also be committed; every later candidate artifact has the same requirement. This shared low-dimensional vector is an explicit structural-baseline exception; candidate models still cannot pool targets across horizons. Fair scoring uses strict expanding-origin forward folds: for each score origin, every training case must have an earlier origin and `target_end <= score_origin`, while all available horizons at the score origin remain together. The full-development vector is only a later prediction artifact and cannot replace forward-scored B0b predictions in comparator selection. The 36/60-month audit reuses the frozen vector and never fits on long-audit labels.

The three warm-up origins are not comparator or point-gate cases. They may supply interval-only residuals only when their predictions were materialized before truth join under the frozen cold-start contract and their labels are target-available at the later score origin. `B0b` uses its pre-registered initial factors without outcome fitting; `B1/B2/B3` use their frozen formulas; `C1/C2-R/C2` use the frozen `B3` insufficient-fit fallback; and `C3` uses its pre-registered default weights. At the first required score origin, `2020-12`, the only authorized warm-up blocks are `2019-06:[3,6,12,18]`, `2019-12:[3,6,12]`, and `2020-06:[3,6]`. Warm-up rows cannot enter comparator selection, point gates, or bootstrap, and cannot change any interval method, threshold, fallback group, or gate.

This baseline phase is development-only. The final two eligible origins remain closed until the baseline report is reviewed, the user explicitly authorizes candidate training, `C1`, `C2-R`, `C2`, and `C3` are completed in order, and the simplest candidate passing every development-forward gate is written as `selectedCandidateId` in the committed fitted-parameter artifact. The final holdout evaluates only that precommitted candidate and the locked comparator as confirmation. A failure cannot cause fallback to another candidate; doing so requires a new spec and a new untouched holdout.

All comparators and candidates must use identical case keys. A future-perturbation invariance test must prove that changing data after a cutoff cannot change that cutoff's features, route, eligibility, prediction, or case keys. Baseline results and this integrity evidence must be reviewed before candidate training begins.

Metrics:

- absolute error amount;
- percentage error;
- internal 80% prediction-interval coverage and `WIS`, using only frozen warm-up/forward residual roles with `origin < score_origin`, `target_end <= score_origin`, and `label_available_as_of <= score_origin`;
- signed aggregate bias, fixed as `(sum(pred)-sum(actual))/sum(actual)` for a slice with positive actual revenue;
- business usability notes.

Signed aggregate bias must remain within +/-10% for overall, forecastable, and high-value results, and within +/-15% at each core horizon. A zero-actual slice has undefined signed aggregate bias and must be reported separately rather than treated as a pass. After the baseline identity is locked on the frozen forecastable forward population, that same baseline must be re-scored on each gate's exact population; the comparator must not be reselected per gate.

The interval population is every model-delta key beginning with the `2020-12` score origin, with no burn-in exclusion. Every required key must have a numeric interval for both compared models. Complete-case filtering is prohibited; any missing, non-finite, negative, or otherwise invalid required residual or interval is an integrity/gate failure and must not be silently discarded.

Uncertainty comparisons and confidence intervals must use a paired two-way block/bootstrap design that independently resamples `standard_work_id` and origin clusters with replacement and weights each paired case by the product of their multiplicities. All horizons within a work-origin block remain together; overlapping cases must not be sampled as independent observations.

Forecastability eligibility is frozen before results are observed. The prior 77.88% forecastable-revenue share and 20.38% true-blocked-revenue share are historical non-regression references only; labels or thresholds must not move to reproduce either ratio. The pre-registered top-10%-value forecastable-revenue coverage gate is at least 90%.

A spike rule first creates a candidate for evidence review. It must distinguish buyout, launch burst, batch proration, settlement lag, and true anomaly; no unconfirmed spike type may trigger automatic attenuation.

Candidate training order is `C1`, `C2-R`, `C2`, then `C3`, after B0-B3 replay and integrity review. Selection chooses the simplest candidate that passes every frozen gate. Every candidate, including a passing candidate, remains `not_for_formal_decision` until Chinese business sampling and explicit user approval.

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

Final-algorithm calibration additionally requires the committed pre-registration, untouched final holdout, leakage and future-perturbation invariance tests, B0-B3 identical-case replay, routed revenue-model handling, correlated block-bootstrap inference, internal 80% interval calibration, frozen signed-bias gates, long-horizon audit, Chinese business sampling plan, and explicit `not_for_formal_decision` state.

The original M2-A acceptance statement treated M1 readiness as pending. Current foundation readiness is complete, but final M2 algorithm acceptance remains blocked until a pre-registered candidate passes every gate, Chinese business sampling is complete, and the user explicitly approves a later formal decision and release.
