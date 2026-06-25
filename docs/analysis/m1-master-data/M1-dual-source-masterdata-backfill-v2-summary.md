# M1 Dual-Source Master Data Backfill v2 Summary

- Ready status: `ready_for_limited_local_staging_apply`
- Not entering M3: `True`

## Feedback
| key | value |
| --- | --- |
| totalRows | 80 |
| acceptedRows | 38 |
| needsModifyRows | 42 |
| rejectedRows | 0 |
| uncertainRows | 0 |

## Overrides
| key | value |
| --- | --- |
| totalRows | 80 |
| stagingRows | 80 |
| acceptedRows | 38 |
| modifiedRows | 42 |
| generalizedRows | 0 |

## Dry-Run v2
| key | value |
| --- | --- |
| safeAutoApplyRows | 10577 |
| userConfirmedOverrideRows | 80 |
| manualReviewRows | 8760 |
| rejectedOrRuleBlockedRows | 0 |
| fieldGapResults.missingWorkName.before | 0 |
| fieldGapResults.missingWorkName.autoApplyAfter | 0 |
| fieldGapResults.missingWorkName.autoApplyReduction | 0 |
| fieldGapResults.missingWorkName.candidateCoverageWorks | 2998 |
| fieldGapResults.missingWorkName.manualCandidateWorks | 221 |
| fieldGapResults.missingAuthor.before | 2444 |
| fieldGapResults.missingAuthor.autoApplyAfter | 65 |
| fieldGapResults.missingAuthor.autoApplyReduction | 2379 |
| fieldGapResults.missingAuthor.candidateCoverageWorks | 2996 |
| fieldGapResults.missingAuthor.manualCandidateWorks | 626 |
| fieldGapResults.missingCopyrightStart.before | 3054 |
| fieldGapResults.missingCopyrightStart.autoApplyAfter | 85 |
| fieldGapResults.missingCopyrightStart.autoApplyReduction | 2969 |
| fieldGapResults.missingCopyrightStart.candidateCoverageWorks | 2998 |
| fieldGapResults.missingCopyrightStart.manualCandidateWorks | 29 |
| fieldGapResults.missingCopyrightEnd.before | 3054 |
| fieldGapResults.missingCopyrightEnd.autoApplyAfter | 570 |
| fieldGapResults.missingCopyrightEnd.autoApplyReduction | 2484 |
| fieldGapResults.missingCopyrightEnd.candidateCoverageWorks | 2998 |
| fieldGapResults.missingCopyrightEnd.manualCandidateWorks | 537 |
| fieldGapResults.missingClassification1.before | 3054 |
| fieldGapResults.missingClassification1.autoApplyAfter | 3054 |
| fieldGapResults.missingClassification1.autoApplyReduction | 0 |
| fieldGapResults.missingClassification1.candidateCoverageWorks | 2802 |
| fieldGapResults.missingClassification1.manualCandidateWorks | 2802 |
| fieldGapResults.missingClassification2.before | 3054 |
| fieldGapResults.missingClassification2.autoApplyAfter | 3054 |
| fieldGapResults.missingClassification2.autoApplyReduction | 0 |
| fieldGapResults.missingClassification2.candidateCoverageWorks | 2770 |
| fieldGapResults.missingClassification2.manualCandidateWorks | 2770 |
| fieldGapResults.missingRequiredTags.before | 3054 |
| fieldGapResults.missingRequiredTags.autoApplyAfter | 3054 |
| fieldGapResults.missingRequiredTags.autoApplyReduction | 0 |
| fieldGapResults.missingRequiredTags.candidateCoverageWorks | 1775 |
| fieldGapResults.missingRequiredTags.manualCandidateWorks | 1775 |
| fieldGapResults.missingWorkStatus.before | 3054 |
| fieldGapResults.missingWorkStatus.autoApplyAfter | 3054 |
| fieldGapResults.missingWorkStatus.autoApplyReduction | 0 |
| fieldGapResults.missingWorkStatus.candidateCoverageWorks | 0 |
| fieldGapResults.missingWorkStatus.manualCandidateWorks | 0 |
| fieldGapResults.missingAudioRightsStatus.before | 3054 |
| fieldGapResults.missingAudioRightsStatus.autoApplyAfter | 3054 |
| fieldGapResults.missingAudioRightsStatus.autoApplyReduction | 0 |
| fieldGapResults.missingAudioRightsStatus.candidateCoverageWorks | 0 |
| fieldGapResults.missingAudioRightsStatus.manualCandidateWorks | 0 |

## M2 Impact
| key | value |
| --- | --- |
| copyrightTermForecastIncreaseWorksV1 | 1537 |
| copyrightTermForecastIncreaseWorksV2 | 1556 |
| copyrightTermForecastDeltaWorks | 19 |
| operator30WorkPackRowsLikelyNeedRefresh | 30 |
