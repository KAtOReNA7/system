# M2 old-product evaluation PRD v0.1

Status: M2-A DESIGN ONLY

This document defines the M2 old-product evaluation scope for design and fixture/synthetic testing. It is based on `docs/prd/05-老品评估.md`, `docs/prd/20-evaluation/common-evaluation-rules.md`, and the M1 closeout audit. M2-A does not authorize formal database access, real data import, `mapping_version` activation, `switch_mapping_version`, or formal old-product evaluation.

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
- three-scenario forecast: base, optimistic, pessimistic;
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
- base, optimistic, and pessimistic forecast totals;
- annual forecast breakdown;
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

Forecast output:

- base scenario;
- optimistic scenario;
- pessimistic scenario;
- yearly breakdown;
- remaining-month count;
- assumptions and rule version;
- data sufficiency flags.

M2-A may use deterministic fixture formulas. M2-C/M2-D must use backtested rules and formally ready M1 data.

## 9. Rating System

Ratings are `S+`, `S`, `A`, `B`, `C`, `D`, `E`.

Design principles:

- forecast value is the base signal;
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

Each risk should include severity, affected field, rationale, and suggested mitigation.

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
- algorithm version;
- forecast horizon;
- rating.

Metrics:

- absolute error amount;
- percentage error;
- interval coverage;
- over/under prediction bias;
- business usability notes.

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
- forecast totals and yearly breakdown;
- rating and risk fields;
- review-prompt and unresolved-risk summary;
- backtest metrics where requested.

M2-A only defines export consistency tests. It does not implement export.

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

## 17. Acceptance Standards

M2-A acceptance:

- PRD covers scope, non-goals, phase split, inputs, outputs, lifecycle, forecast, rating, risks, review prompts, the no-operating-suggestion boundary, backtest, versioning, export, and acceptance.
- API contract covers overview, list, detail, history, gaps, backtest, algorithm version, and controlled task APIs.
- Data model design covers evaluation batches, results, summaries, lifecycle, forecasts, ratings, risks, review prompts, backtests, versions, snapshots, invalidation, and M1 dependencies. Legacy suggestion persistence is not part of the current formal output contract.
- Page plan covers overview, list, detail, gaps, backtest/version pages, states, fixture labels, incomplete-month notice, and formal-data blocking.
- Test plan covers fixture, synthetic, readiness, lifecycle, rating, forecast, backtest, API, page, export, and prohibited-action tests.

Formal M2 acceptance remains blocked until M1 formal data readiness is complete.
