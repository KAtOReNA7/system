# M2 v2 Claim Canonicalization 合同 v0.1

- 本地确定性规则；不使用额外 LLM judge。
- Canonical key：claimType、normalizedStructuredValue、normalizedEventTime、eventTimePrecision、normalizedEntityReference、sourceSupportClass。
- Identity 保留 edition 差异；rating 缺 platform/scale 不可 pilotUsable；单人 review 默认弱信号。
- completion 仅允许 ongoing/completed/unknown/contradictory。
- 每部最多 10 条 claim。
- full160Authorized：false
