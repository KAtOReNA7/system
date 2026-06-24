# M2 authorized real-data development plan v0.1

Generated: 2026-06-23T14:25:45.970796+00:00

## Conclusion

The project is now in authorized local real-data development mode. This sprint reads local real data, performs aggregate profiling, strict reconciliation, real-data backtests, algorithm calibration, and DB-backed schema preparation while keeping raw data and secrets out of Git.

Recommended development candidate:

```text
m2-realdata-dev-candidate-b-v0.1
```

This candidate is not a final release-approved result.

## Data Sources

| Alias | Type | Path pattern | File type | File count | Record scale |
|---|---|---|---|---|---|
| B001 | real_bill_workbook | data/real-bills/*.xlsx | xlsx | 1 | 192872 |
| M001 | copyright_master_workbook | data/master-data/*.xlsx | xlsx | 1 | 8881 |
| MAP001 | mapping_candidate_private_json | data/m1-master-data-private/mapping-candidate/*.json | json | 3 | 353 |
| OPS001 | operation_confirmation_private_artifacts | data/m1-master-data-private/ops-confirmation/* | mixed | 49 | None |

## Reconciliation Gate

- Raw valid rows: `192872`
- Complete rows included: `192869`
- Incomplete rows excluded: `3`
- Raw amount: `126794644.11`
- Complete included amount: `126794638.17`
- Latest complete month: `2026-04`

## Algorithm Gate

- Baseline candidate-a blocking reviews: `513`
- Candidate-b blocking reviews: `85`
- Candidate-b advisory reviews: `2759`
- Recommended forecast model: `lifecycle_adjusted`

## DB-backed Development

The M2 persistence schema candidate is promoted into a local development migration under `db/migrations/`. Local migration execution is allowed in this mode; remote production/shared database execution remains prohibited.

Current execution note:

- Local DB-backed import/reconciliation runner: `scripts/m2-real-data/run_authorized_real_data_db_import.mjs`.
- Candidate-b review workflow runner: `scripts/m2-real-data/run_candidate_b_review_workflow.mjs`.
- Import dry-run can build the sanitized aggregate payload and plans 3054 work-level candidate rows, 85 blocking review items, and 2759 advisory review items.
- Local Docker/PostgreSQL execution has been validated with PostgreSQL 16 (`postgres:16-bookworm`), local migration state reaches `0070.000`, DB import writes 3054 evaluation results, 85 blocking review items, and 2759 advisory review items, and DB-backed reconciliation passes against the file-level aggregate reports.
- These DB-backed outputs remain authorized local development evidence, not final release-approved formal results.

## Safety

- Raw bills, ledgers, private Excel/CSV, database dumps, temporary database files, `.env`, `.pgpass`, and secrets must not be committed.
- Final replies and committed docs must contain only aggregate statistics, thresholds, metrics, and conclusions.
- Sensitive drill-down must remain in gitignored private paths.
