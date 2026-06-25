# M1 Dual-Source Spotcheck Feedback Analysis v1

- This report is sanitized and aggregate-only.
- Total rows: `80`
- Completion rate: `100.00%`
- Acceptance rate: `47.50%`
- Needs-modify rate: `52.50%`
- Ready for local staging apply: `False`

## Decision Distribution
| key | count |
| --- | --- |
| accept | 38 |
| needs_modify | 42 |

## By Field
| key | rowCount | accept | needs_modify | reject | uncertain | acceptanceRate | needsModifyRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| authorName | 9 | 5 | 4 | 0 | 0 | 55.56% | 44.44% |
| classificationLevel1 | 17 | 0 | 17 | 0 | 0 | 0.00% | 100.00% |
| classificationLevel2 | 16 | 0 | 16 | 0 | 0 | 0.00% | 100.00% |
| copyrightEndDate | 23 | 18 | 5 | 0 | 0 | 78.26% | 21.74% |
| standardWorkName | 15 | 15 | 0 | 0 | 0 | 100.00% | 0.00% |

## Error Patterns
| key | count |
| --- | --- |
| dual_source_conflict_causes_modification | 42 |
| original_library_classification_mapping_inaccurate | 33 |
| ledger_and_original_library_semantics_differ | 42 |
| title_or_author_requires_manual_correction | 4 |
| copyright_end_requires_manual_correction | 5 |
| classification_or_tags_not_suitable_for_auto_apply | 33 |

## Rule Extraction
- Dual-source conflicts must stay manual review unless explicitly user-confirmed.
- Classification and tags must be removed from autoApply scope.
- User correction values are reviewed-candidate scoped and are not generalized automatically.
