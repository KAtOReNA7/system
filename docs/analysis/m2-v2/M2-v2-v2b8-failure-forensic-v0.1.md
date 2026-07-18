# M2 v2 V2-B.8 失败取证 v0.1

- 旧逻辑请求：22；失败：5
- 合同成功：17
- HTTP 成功但零结果：1
- HTTP 成功但合同无效：4
- transport / auth-rate-limit / crash：0 / 0 / 0
- repeat 来源 overlap mean/median：70.95% / 71.43%；exact：2/5
- 旧 raw / canonical semantic agreement：27.00% / 43.00%
- source-set changed pairs：5/5
- same-source stability：重放前未评估，不以 0 冒充。
- 结论：需要 deterministic fallback、source selection、same-source extraction 与 canonical semantic comparison。
- full160Authorized：false
