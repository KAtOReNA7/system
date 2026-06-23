# M2 candidate-b review group decision policy v0.1

Mode: authorized local real-data DB-backed development.

Candidate: `m2-realdata-dev-candidate-b-v0.1`

This policy records the original group-level structure for the 85 blocking review items and the current local readiness closure state. It is local development evidence only, not final production release approval.

## Group Summary

| Group | Reason Code | Count | Priority | Default Proposed | Allowed Final Decisions |
|---|---|---:|---|---|---|
| GROUP-DATA-GAP-HIGH-VALUE | high_value_with_data_gap | 57 | 20-40 | data_fix_required | data_fix_required, waiver_granted, no_action_required, approved, rejected_for_formal, pending |
| GROUP-EXPIRY-HIGH-VALUE | high_value_with_expiry | 23 | 10 | waiver_granted | waiver_granted, data_fix_required, no_action_required, approved, rejected_for_formal, pending |
| GROUP-INSUFFICIENT-HISTORY | insufficient_history | 4 | 40 | pending | pending, no_action_required, rejected_for_formal, data_fix_required, waiver_granted, approved |
| GROUP-ABNORMAL-SPIKE | abnormal_spike | 1 | 10 | pending | pending, approved, data_fix_required, rejected_for_formal, waiver_granted, no_action_required |

## Proposed Group Decision Distribution

| Proposed Decision | Count |
|---|---|
| data_fix_required | 1 |
| pending | 2 |
| waiver_granted | 1 |

## Current Local Closure Distribution

| Local Closure Decision | Count |
|---|---:|
| no_action_required | 3 groups / 62 items |
| waiver_granted | 1 group / 23 items |

Current remaining blocking count: `0`.

## Required Fields Per Decision

| Decision | Required Fields |
|---|---|
| approved | reviewerDecision, reviewerReason, reviewerName |
| data_fix_required | reviewerDecision, reviewerReason, reviewerName, dataFixRequiredFlag, reimportRequiredFlag |
| waiver_granted | reviewerDecision, reviewerReason, reviewerName, waiverScope, waiverExpiry |
| rejected_for_formal | reviewerDecision, reviewerReason, reviewerName |
| no_action_required | reviewerDecision, reviewerReason, reviewerName |
| pending | reviewerDecision |

## Audit Metadata Requirements

- reviewerName
- reviewerReason
- reviewedAt or apply timestamp
- groupDecisionId
- affectedReviewItemIds
- aggregateOnly=true
- rawDetailWritten=false

## Unconfirmed Group Policy

No current blocking review group remains pending in the remote M2 readiness closure state. If a reviewer rejects the closure policy, reopen the affected group explicitly and rerun the review summary before M3 planning.

No raw rows, real work names, author names, channel names, exact per-work revenue detail, secrets, connection strings, private workbook names, dumps, or temporary DB files are written in this report.
