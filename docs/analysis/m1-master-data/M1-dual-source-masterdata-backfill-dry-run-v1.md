# M1 Dual-Source Master Data Backfill Dry-Run v1

- Formal master data written: `False`
- Database written: `False`

## Single Digital Ledger v3 Baseline
| key | value |
| --- | --- |
| matchedWorks | 1248 |
| autoApplyEligibleRows | 3900 |
| autoApplyEligibleWorks | 1233 |
| copyrightEndFillableWorks | 928 |
| remainingManualReviewWorks | 1064 |

## Dual-Source Result
| key | value |
| --- | --- |
| matchedWorks | 2998 |
| autoApplyEligibleRows | 10584 |
| autoApplyEligibleWorks | 2971 |
| manualReviewRows | 8753 |
| copyrightEndFillableWorks | 2465 |
| authorOrWorkNameFillableWorks | 2913 |
| classificationOrTagsCandidateWorks | 2802 |
| fieldGapResults.missingWorkName.before | 0 |
| fieldGapResults.missingWorkName.autoApplyAfter | 0 |
| fieldGapResults.missingWorkName.autoApplyReduction | 0 |
| fieldGapResults.missingWorkName.candidateCoverageWorks | 2998 |
| fieldGapResults.missingWorkName.manualCandidateWorks | 219 |
| fieldGapResults.missingAuthor.before | 2444 |
| fieldGapResults.missingAuthor.autoApplyAfter | 74 |
| fieldGapResults.missingAuthor.autoApplyReduction | 2370 |
| fieldGapResults.missingAuthor.candidateCoverageWorks | 2996 |
| fieldGapResults.missingAuthor.manualCandidateWorks | 626 |
| fieldGapResults.missingCopyrightStart.before | 3054 |
| fieldGapResults.missingCopyrightStart.autoApplyAfter | 84 |
| fieldGapResults.missingCopyrightStart.autoApplyReduction | 2970 |
| fieldGapResults.missingCopyrightStart.candidateCoverageWorks | 2998 |
| fieldGapResults.missingCopyrightStart.manualCandidateWorks | 28 |
| fieldGapResults.missingCopyrightEnd.before | 3054 |
| fieldGapResults.missingCopyrightEnd.autoApplyAfter | 589 |
| fieldGapResults.missingCopyrightEnd.autoApplyReduction | 2465 |
| fieldGapResults.missingCopyrightEnd.candidateCoverageWorks | 2998 |
| fieldGapResults.missingCopyrightEnd.manualCandidateWorks | 533 |
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
| bySource.original_library | 12283 |
| bySource.digital_copyright_ledger | 6912 |
| bySource.both_sources_consistent | 31 |
| bySource.both_sources_conflict | 111 |
| byField.authorName | 2996 |
| byField.classificationLevel1 | 2802 |
| byField.classificationLevel2 | 2770 |
| byField.copyrightEndDate | 2998 |
| byField.copyrightStartDate | 2998 |
| byField.requiredTags | 1775 |
| byField.standardWorkName | 2998 |
| byCohort.web_original_cohort | 12250 |
| byCohort.publication_cohort | 6912 |
| byCohort.mixed_or_uncertain_cohort | 175 |

## Delta vs Digital v3
| key | value |
| --- | --- |
| additionalMatchedWorks | 1750 |
| additionalAutoApplyEligibleRows | 6684 |
| additionalAutoApplyEligibleWorks | 1738 |
| additionalCopyrightEndFillableWorks | 1537 |
| manualReviewRowsDelta | 6320 |

## Safety Guards
| guard | passed |
| --- | --- |
| fuzzyAutoApplyBlocked | True |
| dualSourceConflictAutoApplyBlocked | True |
| nonEmptyAuthoritativeValueNotOverwritten | True |
| relativeExpiryMissingAnchorAutoApplyBlocked | True |
| classificationLevel3NotFabricated | True |
| formalMasterDataWriteBlocked | True |
| m3NotEntered | True |
