# M2 Commercial Terms Terms-Only Source Audit v4

## Executive conclusion

- `commercial_terms_source_missing`: `true`
- Old complete commercial-terms ledger found: `false`
- v4 terms-only lookup executed: `false`
- rating v4 executed: `false`
- suggestion v4 executed: `false`
- v4 private task pack generated: `false`
- M3 entered: `false`

This audit stops the v4 commercial enrichment at the source gate. The local workspace contains the cleaned seven-column digital copyright ledger, the original library, dual-source staging outputs, and operation-confirmation extracted tag fields. It does not contain a standalone old complete digital copyright ledger with direct commercial terms columns such as cooperation mode, e-book royalty, audio royalty, e-book advance, audio advance, contract type, audio use right, audio adaptation right, audio sublicense right, or audio rights description.

Per the v4 task rule, operation-confirmation tag candidates must not be used as a substitute for complete commercial terms facts. Therefore v4 must not continue into terms enrichment, rating v4, suggestion v4, or new business-review task-pack generation.

## Source Gate Matrix

| source class | available locally | commercial terms usable for v4 terms-only lookup | reason |
| --- | --- | --- | --- |
| Cleaned seven-column digital copyright ledger | yes | no | Contains identity, title, author, signing date, expiry date, and product line only. |
| Original library | yes | no | Supports web-original identity and copyright dates, not commercial contract terms. |
| Dual-source staging result | yes | no | Provides confirmed identity/copyright staging scope, not commercial terms fields. |
| Existing M1/M2 mapping | yes | identity only | May define allowed work identity scope, but does not provide commercial terms. |
| Operation-confirmation extracted tags | yes | no for v4 source gate | Contains extracted/tagged rights text; v4 explicitly forbids using tags alone as commercial terms facts. |
| Old complete commercial-terms ledger | no | no | No standalone file with required commercial terms columns was found. |

## Required Commercial Fields

| required field | found in old complete commercial-terms ledger | found only in extracted/tag candidates |
| --- | --- | --- |
| 合作方式 | false | true |
| 电子版税 | false | false |
| 有声版税 | false | false |
| 电子预付 | false | false |
| 有声预付 | false | false |
| 合同类型 | false | false |
| 有声权利描述 | false | true |
| 有声使用权 | false | true |
| 有声改编权 | false | true |
| 有声转授权 | false | true |

## v3 vs v4 Coverage

Because v4 terms-only lookup is blocked at source discovery, no v4 commercial model coverage is promoted.

| metric | v3 | v4 |
| --- | ---: | ---: |
| M2 total works | 3054 | 3054 |
| known commercial model works | 885 | 0 promoted |
| buyout | 255 | 0 promoted |
| royalty | 3 | 0 promoted |
| prepaid_royalty | 1 | 0 promoted |
| revenue_share | 613 | 0 promoted |
| mixed | 13 | 0 promoted |
| conflict | 0 | 0 promoted |
| unknown | 2086 | 3054 unresolved for v4 terms-only |
| coverage rate | 0.289784 | 0 |

## Blocking Reason

The available commercial signals are not sufficient for the v4 rules:

- extracted tags can assist review but cannot become high-confidence commercial terms facts;
- no fuzzy or title-only lookup is allowed;
- unmatched rows from a historical ledger must not create new work matches;
- without a standalone complete ledger or equivalent structured commercial terms table, exact-id or title-author terms-only lookup cannot be validated.

## Required User Input

To continue v4, the user needs to provide or restore the old complete commercial-terms ledger or an equivalent structured export containing at least:

- work identity key that can be matched exactly to existing standard work / raw work / ledger work IDs;
- publication title / contract title / author fields for strict title-author verification;
- cooperation mode;
- e-book royalty and e-book advance;
- audio royalty and audio advance;
- contract type;
- audio rights description;
- audio use, adaptation, and sublicense rights.

The source must be used only as terms-only lookup for already matched works, not as a new broad work-matching source.

## Safety Boundary

This public report is aggregate-only. It contains no real work names, author names, channel names, contract text, raw ledger rows, raw bill rows, 密钥, connection strings, or absolute data paths.
