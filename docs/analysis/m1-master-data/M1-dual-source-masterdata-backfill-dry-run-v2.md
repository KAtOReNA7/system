# M1 Dual-Source Master Data Backfill Dry-Run v2

- Formal master data written: `False`
- Database written: `False`
- Ready status: `ready_for_limited_local_staging_apply`

## v1 vs v2
| key | value |
| --- | --- |
| v1AutoApplyEligibleRows | 10584 |
| v2SafeAutoApplyRows | 10577 |
| v2UserConfirmedOverrideRows | 80 |
| v2ManualReviewRows | 8760 |
| v2RejectedOrRuleBlockedRows | 0 |
| safeAutoApplyDeltaRows | -7 |
| copyrightEndFillableWorksV1 | 2465 |
| copyrightEndFillableWorksV2 | 2484 |
| copyrightEndFillableDeltaWorks | 19 |

## v2 Buckets
| key | value |
| --- | --- |
| safe_auto_apply_candidates | 10577 |
| user_confirmed_override_candidates | 80 |
| manual_review_candidates | 8760 |
| rejected_or_rule_blocked_candidates | 0 |

## Field Gap Results
| gap | before | autoApplyAfter | autoApplyReduction | candidateCoverageWorks | manualCandidateWorks |
| --- | --- | --- | --- | --- | --- |
| missingWorkName | 0 | 0 | 0 | 2998 | 221 |
| missingAuthor | 2444 | 65 | 2379 | 2996 | 626 |
| missingCopyrightStart | 3054 | 85 | 2969 | 2998 | 29 |
| missingCopyrightEnd | 3054 | 570 | 2484 | 2998 | 537 |
| missingClassification1 | 3054 | 3054 | 0 | 2802 | 2802 |
| missingClassification2 | 3054 | 3054 | 0 | 2770 | 2770 |
| missingRequiredTags | 3054 | 3054 | 0 | 1775 | 1775 |
| missingWorkStatus | 3054 | 3054 | 0 | 0 | 0 |
| missingAudioRightsStatus | 3054 | 3054 | 0 | 0 | 0 |

## Safety Guards
| guard | passed |
| --- | --- |
| dualSourceConflictAutoApplyBlocked | True |
| classificationAndTagsAutoApplyBlocked | True |
| needsModifyUsesOnlyUserCorrectedValue | True |
| uncertainRowsNotApplied | True |
| nonEmptyAuthoritativeValueNotOverwritten | True |
| formalMasterDataWriteBlocked | True |
| m3NotEntered | True |
