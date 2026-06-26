# M2 Commercial Terms Source Audit v2

- Candidate: `m2-realdata-dev-commercial-rating-suggestion-v3.0`
- M2 total works: `3054`
- Known commercial model works: `885`
- Known commercial coverage of M2: `0.289784`
- Buyout revenue share of mapped revenue: `0.026087`
- Source gap: `当前可见精简数字版权台账未暴露完整商业条款列；v3 只能使用运营确认包中从台账/确认链路抽取的标签字段，因此商业模式置信度被降级并要求人工复核。`

| commercial model | work count |
| --- | --- |
| buyout | 255 |
| mixed | 13 |
| prepaid_royalty | 1 |
| revenue_share | 613 |
| royalty | 3 |
| unknown | 2086 |

- v3 does not treat operation tag fields as high-confidence contract facts.
- Reports are aggregate-only and exclude real work names, authors, channels, contract text, raw ledger rows, and raw bill rows.
- M3 entered: `false`
