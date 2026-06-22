# M2 candidate-b blocking review workflow summary v0.1

Mode: authorized local real-data DB-backed development.

Candidate: `m2-realdata-dev-candidate-b-v0.1`

This workflow is local development evidence only. It is not a final release approval.

## Review Counts

| Metric | Count |
|---|---|
| totalReviewItems | 2844 |
| blockingReviewItems | 85 |
| advisoryReviewItems | 2759 |
| auditEventCount | 2844 |

## Status Distribution

| Status | Count |
|---|---|
| pending | 2844 |

## Blocking Reason Distribution

| Reason | Count |
|---|---|
| abnormal_spike | 1 |
| high_value_with_data_gap | 57 |
| high_value_with_expiry | 23 |
| insufficient_history | 4 |

## Priority Distribution

| Priority | Count |
|---|---|
| p1 | 80 |
| p2 | 5 |
| p3 | 2759 |

Default behavior does not approve any item automatically. Mutations require explicit `--apply --item-id --action`.

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
