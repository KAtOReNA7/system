# M2 old-product evaluation pages v0.1

Status: DESIGN ONLY - NO PAGE IMPLEMENTATION

This document defines page structure and states for M2-A old-product evaluation. It does not modify `public/admin/` or any application code.

## 1. Information Architecture

Proposed navigation under product analysis:

```text
Old Product Evaluation
├─ Overview
├─ Evaluations
├─ Data Gaps
└─ Backtests & Algorithms
```

Every M2-A page must display a clear `fixture` or `synthetic` dataset label. Formal data must display a blocked state until authorized.

## 2. Overview Page

Purpose: scan evaluation readiness and portfolio-level distribution.

Fields:

- dataset mode;
- latest confirmed complete month;
- incomplete-month notice;
- eligible old products;
- evaluated old products;
- blocked old products;
- current results;
- invalidated results;
- rating distribution;
- lifecycle distribution;
- high-risk count;
- works needing readiness action.

Filters:

- dataset mode;
- cutoff month;
- classification;
- business form;
- algorithm version.

States:

- empty: no fixture evaluations;
- blocked: formal data not authorized;
- degraded: readiness source unavailable;
- error: API error with request ID.

## 3. Evaluation List Page

Purpose: dense operational list of work-level current evaluation rows.

Columns:

- standard work ID;
- work name;
- author;
- classification path;
- business forms;
- cutoff month;
- lifecycle;
- rating;
- forecast total;
- risk level;
- primary suggestion;
- result status;
- readiness.

Filters:

- search;
- rating;
- lifecycle;
- risk level;
- readiness;
- classification levels;
- business form;
- result status;
- algorithm version.

Sorting:

- forecast total;
- last 12 month sales;
- rating;
- risk severity;
- updated time.

Empty state:

- "No fixture evaluations yet" for fixture mode;
- "No eligible works" for readiness-filtered empty results.

Blocked state:

- "Formal old-product evaluation is blocked until M1 formal data readiness is complete."

## 4. Evaluation Detail Page

Purpose: explain one old-product evaluation result.

Top summary:

- rating;
- lifecycle;
- historical cumulative sales;
- remaining copyright-period forecast;
- remaining copyright months;
- primary suggestion;
- high-risk markers;
- result status.

Sections:

- work identity and basic information;
- readiness status;
- historical monthly income chart;
- business-form structure;
- channel structure;
- lifecycle rationale;
- forecast scenarios;
- rating rationale;
- risks;
- operating suggestions;
- input snapshot;
- algorithm version;
- result history.

Fixture/synthetic markers:

- visible badge near page title;
- notice in snapshot section;
- export disabled or labelled as fixture-only.

Incomplete month reminder:

- show latest confirmed complete month;
- show excluded incomplete months;
- explain that incomplete months cannot drive formal evaluation.

## 5. Data Gap List Page

Purpose: show why works cannot enter evaluation.

Columns:

- standard work ID;
- work name;
- missing income;
- mapping status;
- missing name;
- missing author;
- missing classification;
- missing tags;
- missing copyright start;
- missing copyright end;
- unresolved data issue;
- suggested owner/action.

Filters:

- gap code;
- severity;
- classification;
- business form;
- source version.

States:

- empty: all fixture works ready;
- blocked: formal data not authorized;
- error: API failure.

## 6. Backtests & Algorithms Page

Purpose: show algorithm versions and backtest evidence.

Algorithm table fields:

- version key;
- status;
- fixture-only marker;
- method family;
- AI model usage;
- created time;
- retired time;
- notes.

Backtest table fields:

- batch ID;
- algorithm version;
- cutoff month;
- horizon months;
- work count;
- absolute error;
- percentage error;
- interval coverage;
- bias;
- status.

States:

- empty: no backtest fixture batches;
- blocked: real backtest blocked by M1 formal data readiness;
- degraded: algorithm metadata unavailable.

## 7. Common Page States

| State | Meaning | Required handling |
| --- | --- | --- |
| `loading` | Request in flight | lightweight loading state |
| `empty` | Valid response with no rows | explain current filter/mode |
| `success` | Data available | show dense tables and detail |
| `blocked` | Formal data or M1 readiness blocked | show blocker list, no misleading numbers |
| `degraded` | Non-critical dependency missing | keep available sections visible |
| `error` | API error | show `code`, safe message, request ID |
| `not_found` | Unknown work/result | show return path |

## 8. Formal Data Warning

When `formalDataAuthorized=false`, pages must not:

- show formal evaluation controls;
- show production/staging wording;
- imply results are business-approved;
- enable annual target use;
- hide missing data gaps.

Required notice:

```text
M2-A is using fixture or synthetic data. Formal old-product evaluation remains blocked until M1 formal data readiness is complete.
```

## 9. Export Design

M2-A export is design-only.

When later implemented:

- exported rows must match active filters;
- exported metrics must match page metrics;
- fixture exports must include a fixture/synthetic label;
- formal export must be disabled until formal data is authorized.

## 10. Non-Goals

This page plan does not:

- implement pages;
- change `public/admin/`;
- introduce a frontend framework;
- add write controls;
- start evaluation tasks;
- activate mapping versions;
- read real data.
