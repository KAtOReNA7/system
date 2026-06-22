# M2 candidate-b review user decision brief v0.1

Mode: authorized local real-data DB-backed development.

Candidate: `m2-realdata-dev-candidate-b-v0.1`

This brief compresses the 85 pending blocking review items into auditable group-level business decisions. It contains aggregate information only and is not a final formal evaluation or release approval.

## Current State

- Blocking review items: 85
- Blocking status distribution: pending=85
- Final group decisions: none
- Unconfirmed groups and items remain `pending`.

## Decision Groups

### GROUP-DATA-GAP-HIGH-VALUE

- Reason code: `high_value_with_data_gap`
- Item count: 57
- Priority range: 20-40
- Default proposed decision: `data_fix_required`
- Allowed final decisions: `data_fix_required`, `waiver_granted`, `no_action_required`, `approved`, `rejected_for_formal`, `pending`
- Recommended handling: Use the remediation summary first. If source data remains incomplete, keep the group as data_fix_required or choose another explicit audited business decision; do not bulk approve.

### GROUP-EXPIRY-HIGH-VALUE

- Reason code: `high_value_with_expiry`
- Item count: 23
- Priority range: 10
- Default proposed decision: `waiver_granted`
- Allowed final decisions: `waiver_granted`, `data_fix_required`, `no_action_required`, `approved`, `rejected_for_formal`, `pending`
- Recommended handling: Use the waiver policy draft only if business confirms scope and expiry. Missing waiver scope, expiry, reviewer reason, or reviewer name must keep the group pending.

### GROUP-INSUFFICIENT-HISTORY

- Reason code: `insufficient_history`
- Item count: 4
- Priority range: 40
- Default proposed decision: `pending`
- Allowed final decisions: `pending`, `no_action_required`, `rejected_for_formal`, `data_fix_required`, `waiver_granted`, `approved`
- Recommended handling: Decide whether short history can be accepted, deferred, rejected for formal use, or handled by additional local evidence.

### GROUP-ABNORMAL-SPIKE

- Reason code: `abnormal_spike`
- Item count: 1
- Priority range: 10
- Default proposed decision: `pending`
- Allowed final decisions: `pending`, `approved`, `data_fix_required`, `rejected_for_formal`, `waiver_granted`, `no_action_required`
- Recommended handling: Inspect aggregate spike evidence and decide whether the spike is valid one-off income, a data issue, or a formal blocker.

## How To Proceed

1. Open the gitignored private group template: `data/private-output/m2-review/candidate-b-group-decision-template.csv`.
2. Fill only groups with a confirmed business decision.
3. For `waiver_granted`, provide `reviewerReason`, `reviewerName`, `waiverScope`, and `waiverExpiry`.
4. For `data_fix_required`, keep `dataFixRequiredFlag=true` and confirm whether `reimportRequiredFlag=true`.
5. Leave uncertain groups blank or `pending`; they will not be applied automatically.

## Blocking And Closure

- `pending`, `data_fix_required`, and `rejected_for_formal` continue to block local readiness.
- `approved`, `waiver_granted`, and `no_action_required` can close the corresponding local blocker only with explicit business reason and audit metadata.
- If any group requires data correction, complete the minimal local source fix and rerun import/reconciliation/remediation before closing it.

Do not treat local candidate-b as a final formal release result. Do not commit private templates, raw bills, ledgers, private Excel/CSV files, .env, .pgpass, dumps, or sensitive details.
