# M2 real-data profile summary v0.1

Mode: authorized local real-data development.

## Source Inventory

| Alias | Type | Path pattern | File type | File count | Record scale | Usable |
|---|---|---|---|---|---|---|
| B001 | real_bill_workbook | data/real-bills/*.xlsx | xlsx | 1 | 192872 | True |
| M001 | copyright_master_workbook | data/master-data/*.xlsx | xlsx | 1 | 8881 | True |
| MAP001 | mapping_candidate_private_json | data/m1-master-data-private/mapping-candidate/*.json | json | 3 | 353 | True |
| OPS001 | operation_confirmation_private_artifacts | data/m1-master-data-private/ops-confirmation/* | mixed | 49 | None | True |

## Bill Fields

- Required fields present: `True`
- Amount field role: `actual_sales_amount`
- Month field role: `bill_month`
- Work ID field role: `source_work_id`
- Channel field roles: `channel_id, channel_display_name`
- Zero/negative policy: zero and negative values are retained for reconciliation and modeling.

## Scale

| Metric | Value |
|---|---|
| billRowCount | 192872 |
| validCalibrationRows | 192872 |
| completeCalibrationRows | 192869 |
| standardWorkCount | 3054 |
| rawWorkIdCount | 3575 |
| monthRange | ['2017-06', '2026-05'] |
| latestCompleteMonth | 2026-04 |
| excludedIncompleteMonths | ['2026-05'] |
| businessFormDistribution | {'audio_copyright': 57575, 'audio_product': 135297} |
| distinctChannelCount | 133 |

## Master Data Readiness

| Metric | Value |
|---|---|
| mappingAppliedRowCount | 54544 |
| invalidOrUnmappedRowCount | 0 |
| copyrightEndDateUnambiguousWorkCount | 7542 |
| copyrightDateConflictWorkCount | 2 |
| manualReviewRequiredCount | 85 |
| advisoryOnlyCount | 2759 |
| workWithCopyrightEndCount | 847 |
| workMissingCopyrightEndCount | 2207 |
| workWithMultipleBusinessFormsCount | 474 |
| classificationAndTagCoverage | not fully covered by the two source workbooks; requires follow-up master-data version integration. |

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
