# M1 Cleaned Ledger Minimal Auto-Apply Rule v3

Auto apply is only a local dry-run eligibility rule. It does not write formal master data.

- Allowed auto-apply fields: `authorName, copyrightEndDate, copyrightStartDate, standardWorkName`
- Never auto-apply fields: `classificationLevel1, classificationLevel2, publisherName, firstPublicationDate, audioRightsStatus, classificationLevel3, isbn, cip, contractNo, contractType, audioUseRight, audioAdaptationRight, audioSublicenseRight`

## Criteria
| 规则 | 要求 |
| --- | --- |
| currentValue | must be empty, unless identical formatting normalization only |
| matchMethod | exact_work_id or mapping_work_id, or title_author_exact with matchConfidence >= 0.99 |
| valueConfidence | >= 0.97 |
| conflictStatus | none |
| manualReview | false |
| fuzzyMatch | never auto apply |
| relativeExpiryWithoutAnchor | never auto apply |
| automaticRenewal | never extend automatically |
| indefiniteExpiry | not converted to concrete date |
| nonEmptyAuthoritativeValue | not overwritten unless identical |
