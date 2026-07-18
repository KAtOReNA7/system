# M2 v2 Deterministic Source Selection 合同 v0.1

- 每个 work/query 最多 6 条。
- 顺序：non-prohibited、official/publisher/platform、身份相关、provider score、canonical resource lexical、sourceId lexical。
- Source classification 必须有绑定到所选 Source Record 的 positive evidence；缺少正证据时保持 unknown，不得仅凭名称、标签或模型自报提升为 official/publisher/platform。
- 单一来源 host 最多 2 条；仅来源不足时补足。选择同时强制 domain 与 source-category diversity，并从 positive source evidence 本地推导 category；domain cap 例外不豁免 category audit。
- Required diversity gate 没有 applicable source 时必须为 `NOT_EVALUABLE` 且 `passed=false`，不得按空集通过。
- rating/review 不得挤掉 identity 官方来源；不允许替换样本。
- full160Authorized：false
