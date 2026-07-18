# M2 v2 V2-A Traceability v0.1

## 状态

- 文档状态：`ARCHITECTURE_TRACEABILITY_READY`
- 实现状态：未实现
- 测试状态：planned only
- decision：`not_for_formal_decision`

## 需求追踪

| Requirement | PRD 定义 | 技术设计 | Planned acceptance test | Gate |
|---|---|---|---|---|
| REQ-M2V2-CASH-001 | main PRD §4.1 | result schema、API、DB、export | AT-M2V2-CASH-001 point-only/null/cents | V2-D/E |
| REQ-M2V2-VALUE-001 | main PRD §4.2 | field dictionary、result schema、DB | AT-M2V2-VALUE-001 policy/truth isolation | V2-D |
| REQ-M2V2-TREND-001 | main PRD §4.3 | field dictionary、result schema、DB | AT-M2V2-TREND-001 truth/as-of | V2-D |
| REQ-M2V2-RISK-001 | main PRD §4.4 | result schema、API/export | AT-M2V2-RISK-001 fact-only/no action | V2-B/E |
| REQ-M2V2-EXPLAIN-001 | main PRD §4.5 | result schema、evidence link | AT-M2V2-EXPLAIN-001 source/faithfulness | V2-B/D |
| REQ-M2V2-EVIDENCE-001 | main PRD §7 | field dictionary、evidence design/schema/provider | AT-M2V2-EVIDENCE-001 as-of/schema/conflict | V2-B |
| REQ-M2V2-DATA-001 | data policy | evidence schema、DB | AT-M2V2-DATA-001 auto/manual/use class | V2-B |
| REQ-M2V2-HUMAN-001 | Human PRD | DB baseline objects | AT-M2V2-HUMAN-001 blind/block/lock | V2-C |
| REQ-M2V2-API-001 | main PRD §11 | API contract/result schema | AT-M2V2-API-001 response/prohibited fields | future implementation |
| REQ-M2V2-DB-001 | main PRD §11 | DB contract | AT-M2V2-DB-001 immutability/cents/constraints | future migration |
| REQ-M2V2-EXPORT-001 | main PRD §11 | export contract | AT-M2V2-EXPORT-001 parity/null/no scenario | future implementation |
| REQ-M2V2-PRIVACY-001 | data policy §9 | all designs | AT-M2V2-PRIVACY-001 no private/raw/full text | every gate |
| REQ-M2V2-GOV-001 | main PRD §13 | manifest/readmes | AT-M2V2-GOV-001 status/seals/no release | every gate |

## Planned acceptance test catalog

### AT-M2V2-CASH-001

- exactly one external point；
- annual cents sum exactly equals point；
- pure-buyout without commitment is null abstention；
- commitment beyond horizon is explained numeric 0, not abstention；
- no uncommitted buyout or monthly equivalent；
- no scenario/PI endpoints。

### AT-M2V2-VALUE-001

- status unavailable and score/rank null without approved policy；
- weights sum to 1；
- truth evidence and feature evidence disjoint；
- rank scope/version frozen；
- missing dimensions handled by policy, not implicit zero。

### AT-M2V2-TREND-001

- status unavailable and label/horizon null without approved definition；
- sales cash only；
- future actual joined after prediction lock；
- thresholds/version pre-registered；
- no current-state leakage；
- insufficient evidence remains explicit。

### AT-M2V2-EVIDENCE-001

- `eventTime`、`availableAt`、`capturedAt` independent；
- `max(availableAt, firstObservedAt, capturedAt) <= evidenceAsOfAt <= predictionLockedAt`；
- unknown availableAt excluded；
- confidence overall equals minimum required component；
- unresolved conflict not prediction-allowed；
- resolved prediction candidate has `winnerEvidenceId == current evidenceId`, while every loser remains blocked from prediction；
- explanation-only evidence passes the approved source-tier/source-terms gate; prohibited or review-required sources remain excluded；
- LLM extraction requires model/prompt versions and deterministic extraction requires both to be null；
- provider failure does not fabricate evidence；
- no raw page/full text or credential；
- immutable snapshot and item digests。

### AT-M2V2-RISK-001

- every risk has stable riskId and typed provenance；
- risk is fact-only with rationale and limitation；
- no operating action/resource recommendation；
- unresolved evidence conflict is surfaced but never silently resolved。

### AT-M2V2-EXPLAIN-001

- every driver has stable driverId and at least one type-compatible provenance ref；
- external/internal refs bind a non-null snapshot and as-of；
- every external ref snapshot equals the current result evidence snapshot; every internal ref snapshot equals the current result cash-input snapshot；
- explanation does not claim unsupported causality；
- prediction-lock-after truth stays in evaluation audit, not serving provenance。

### AT-M2V2-DATA-001

- automatic/provider-acquired evidence is distinct from human baseline labels；
- human responses never become model features or overwrite claims；
- prediction/explanation/prohibited/admissibility states are mutually consistent；
- current rights/shelf without historical snapshot remain post-hoc only。

### AT-M2V2-HUMAN-001

- work × origin blocks；
- at most one origin per work in a batch and no cross-arm work contamination；
- H0/H1 isolation；
- B4/candidate/actual hidden；
- prediction lock before truth；
- no human result enters production feature；
- block-bootstrap, not case IID。
- consensus annual cents reconcile exactly to consensus point。
- response persistence covers annual breakdown, abstention/reason, evidence refs used, submitted time and duration without exposing reviewer identity。

### AT-M2V2-API-001

- only GET endpoints in V2-A contract；
- point/value/trend/risk/explanation/evidenceSummary present；
- raw prediction, raw evidence, scenario and suggestions absent；
- safe errors；
- fixture/shadow only until later authorization。

### AT-M2V2-DB-001

- append-only evidence/retrieval/snapshot；
- one current result per family/work；
- failed attempt creates no result；
- integer cents exact；
- result/evidence schema version required；
- evidence-summary role counts never exceed total and all counts/coverage reconcile exactly to the bound snapshot projection；
- a non-unavailable Commercial Value result contains exactly one scored, provenance-backed entry for each of the six frozen dimension codes；
- human baseline isolated and its annual rows reconcile in integer cents。

### AT-M2V2-EXPORT-001

- API/result/export parity；
- null vs zero preserved；
- annual reconciliation；
- no scenario/PI/raw prediction/action/full URL/full text；
- manifest digest and decision status；
- public cohort suppression。

### AT-M2V2-PRIVACY-001

- no private ID/title/author/channel/query/URL/path in public artifacts；
- no raw page, long excerpt, provider payload, credential or reviewer identity；
- source locator and private manifests remain ignored/untracked；
- cells below 10 use primary and complementary suppression。

### AT-M2V2-GOV-001

- B4/current formal result unchanged；
- final holdout, embargo shadow and deferred 60-month labels sealed；
- all statuses remain not_for_formal_decision；
- no C4/model training/release/M3；
- contract manifest paths, test IDs and SHA-256 match the frozen documents。

## V2-A checklist

| 条件 | 状态 |
|---|---|
| 五个 PRD heads 已定义 | complete |
| formal-cash 与 B4 边界未改 | complete |
| data policy 已定义 | complete |
| External Evidence schema/provider/time/confidence/conflict 已定义 | complete |
| Human baseline 已定义 | complete |
| API/DB/export design 已定义 | complete |
| machine-readable schemas/manifest 已定义 | complete |
| business code/model/migration 未修改 | required validation |
| provider/source/legal pilot policy approved | pending in V2-B pre-registration |
| value/trend policy approved | pending before V2-D |
| Human baseline sample/reviewer policy approved | pending before V2-C |
| V2-B authorized | historical only: yes under the subsequent 2026-07-17 instruction; that authority was executed and superseded by V2-B.2–B.8/remediation, is not current acquisition/provider/resume authority, and current authorization is defined only by current-state-index-v0.2 plus the latest explicit user instruction |
| C4/model/final holdout/release/M3 authorized | no |
