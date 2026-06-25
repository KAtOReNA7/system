# M1 Cleaned Ledger Minimal Dry-Run v3 Result

- Formal master data written: `False`
- Database written: `False`

## Field Gap Results
| gap | before | autoApplyAfter | autoApplyReduction | manualCandidateWorks |
| --- | --- | --- | --- | --- |
| missingWorkName | 0 | 0 | 0 | 133 |
| missingAuthor | 2444 | 1820 | 624 | 622 |
| missingCopyrightStart | 3054 | 1821 | 1233 | 15 |
| missingCopyrightEnd | 3054 | 2126 | 928 | 320 |
| missingClassification1 | 3054 | 3054 | 0 | 1048 |
| missingClassification2 | 3054 | 3054 | 0 | 1016 |

## Safety Guards
| guard | passed |
| --- | --- |
| onlySixMinimalFieldsGenerated | True |
| publisherNameGenerated | False |
| firstPublicationDateGenerated | False |
| audioRightsStatusGenerated | False |
| classificationLevel3Generated | False |
| fuzzyAutoApplyBlocked | True |
| relativeExpiryAutoApplyBlocked | True |
| automaticRenewalAutoExtendBlocked | True |
