# M2 local DB import reconciliation summary v0.1

Mode: authorized local real-data DB-backed development.

Candidate: `m2-realdata-dev-candidate-b-v0.1`

This is a local development import and reconciliation report, not a final release-approved formal result.

## Migration Evidence

| Metric | Value |
|---|---|
| database | m1_local_dev |
| hostCategory | local |
| dockerUsed | true |
| migrationFiles | 81 |
| latestSchemaVersion | 0070.000 |
| migrationsExecutedThisRun | 0 |

## Import Counts

| Table | Rows |
|---|---|
| algorithmVersions | 1 |
| results | 3054 |
| inputSnapshots | 3054 |
| risks | 11531 |
| suggestions | 3863 |
| reviewItems | 2844 |

## Reconciliation Checks

| Check | Passed |
|---|---|
| workCount | true |
| candidateVersion | true |
| latestCompleteMonth | true |
| ratingDistribution | true |
| lifecycleDistribution | true |
| blockingReviewCount | true |
| advisoryReviewCount | true |

## Rating Distribution

| Rating | Count |
|---|---|
| B | 647 |
| S | 54 |
| E | 1111 |
| D | 395 |
| A | 136 |
| C | 704 |
| S+ | 7 |

## Lifecycle Distribution

| Lifecycle | Count |
|---|---|
| inactive | 800 |
| growth | 540 |
| insufficient_history | 46 |
| stable | 872 |
| declining | 394 |
| rebound | 270 |
| long_tail | 132 |

## Review Distribution

| Metric | Count |
|---|---|
| blockingReviewItems | 85 |
| advisoryReviewItems | 2759 |

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
