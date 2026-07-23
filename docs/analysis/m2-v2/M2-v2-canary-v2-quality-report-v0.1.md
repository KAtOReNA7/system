# M2 v2 Canary v2 Quality Report

## Model results

| Model | Search success | Resolved | Evidence coverage | High-value | Citation | availableAt | Repeat agreement | Tokens observed | p50/p90 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 119826 | 28018/41721 |
| gpt-5.6-terra | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 122357 | 21762/23900 |

## Search and Extraction

| Model | Primary Search dispatched | Provider response | Web search observed | Search contract | Source records | Repeat provider errors | Extraction dispatched | Extraction blocked |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | 10/10 | 10/10 | 10/10 | 0/10 | 0 | 1 | 0/10 | 10 |
| gpt-5.6-terra | 10/10 | 10/10 | 10/10 | 0/10 | 0 | 0 | 0/10 | 10 |

两模型的 primary Search provider response 与 web-search observation 均为 10/10，但可信 citation/source records 为 0，因此 Search contract 为 0/10，Extraction 依赖全部阻断。该结果是 source-bearing contract failure，不是连接失败，也不能用于模型质量选择。

## Entity, Evidence, Citation and Time

| Model | Entity R/U/A | Candidate/A/R | Citation evaluable | Receipt capturedAt | source capturedAt | availableAt | eventTime | Token complete | Observed tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | 0/10/0 | 0/0/0 | false | 100.00% | 0.00% | 0.00% | 0.00% | false | 119826 |
| gpt-5.6-terra | 0/10/0 | 0/0/0 | false | 100.00% | 0.00% | 0.00% | 0.00% | true | 122357 |

Citation alignment 与 source mapping 因 accepted evidence=0 不可评估；gate 按 fail-closed 记为未通过。Receipt capturedAt 完整，source-record capturedAt、availableAt、eventTime 因无 source/evidence 不可形成有效覆盖。

## Governance and cost

- research allowlist: empty_fail_closed; approved domains=0
- model allowlist: empty_by_default; approved domains=0
- prohibited source domains: 0（无 source records，不能解释为 allowlist 已通过）
- estimated relay cost: not_estimable_no_provider_pricing; official OpenAI pricing was not used for the third-party relay
- implicit research-to-model promotion: false

All public metrics are aggregate-only. Titles, authors, queries, URLs, snippets, source domains, receipts, and evidence rows remain private.
