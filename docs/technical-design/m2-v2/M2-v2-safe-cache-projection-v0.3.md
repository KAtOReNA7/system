# M2 v2 Safe-cache Exact Semantic Projection 合同 v0.3

状态：`PROPOSED_NOT_CURRENT`；public sanitized；`not_for_formal_decision`。本文件冻结 B3 的 safe-cache 设计，不声明 implementation、真实 cache migration、current promotion、远端 CI 或 independent review 已通过。v0.2 保留 immutable，只能 audit；v0.3 在 B6 前不得成为 current。

## Exact projection profiles

每个 phase 必须先匹配唯一 profile，再产生 exact-key semantic projection：E0/plain 与 E1 只接受 `{ok:true}`；E2/entity 只接受 exact schemaVersion、entityResolution 与 limitations。E2 resolution status 仅允许 RESOLVED/AMBIGUOUS/NOT_RESOLVED/NOT_APPLICABLE，confidence 仅允许 HIGH/MEDIUM/LOW/NOT_APPLICABLE；identity digest 的 nullability 必须与 status 一致。E2 limitation record 只允许 code、ENTITY/SOURCE/REQUEST scope 与最多 1024 UTF-8 bytes 的 safe detail，并有 64 条上限。

E3/claims 只接受 bounded claims、contradictions 与 limitations。Claim type/predicate 使用受控 token，digest 为 lowercase SHA-256，最多 256 claims。Structured value 是带 `kind` discriminator 的 exact variant：NULL、BOOLEAN、finite NUMBER、bounded STRING、unique bounded STRING_ARRAY，或由 tracked digest-bound exact schema 解析的 EXACT_OBJECT；禁止无 discriminator 的 arbitrary object。Contradiction record 精确绑定左右 claim digest、受控 relation 与 limitation codes；limitations 同样使用 exact code/scope/detail record。Unknown nested field 一律拒绝。

E4/full 必须通过 tracked `docs/technical-design/m2-v2/M2-v2-extraction-contract-v0.2.json`；该依赖的 portable SHA-256 固定为 `a8ca34642d958c7fc03753b82b8c9de6f8eb777b199f864f61a51f1815bfe4d2`，portable normalization 只允许 UTF-8 CRLF→LF，不得发生其他 byte change。Error、non-JSON、oversize 与 unclassifiable 只能产生不可 replay 的 null projection。

Top-level 与 nested unknown key、cross-profile value、prototype keys、non-finite number、超 depth/string/items/keys/serialized-byte budget都必须拒绝。所有 value 在 persistence 前完成 semantic normalization；replay 只读取 canonical projection。禁止把任意 parsed provider object clone 到 `safeReplay.value` 或等价字段。

Secret-shaped key 与 raw-provider-shaped key 使用 NFC、case-fold 与 separator-elision 后匹配。命中 API key、Authorization/Bearer、password/secret/token、raw response/body、headers 或 request body 形态时，entry 必须 reject 且不可 replay。Cache 只保存 immutable receipt digest reference，不保存 receipt/provider object 或 raw bytes。

## Provider-free v0.2 → v0.3 migration

Migration 顺序固定为 classify、normalize、exact project、quarantine unclassifiable、validate complete candidate 与 emit exact receipt。Partition manifest 必须对每个 source entry digest 恰好产生一个排序 outcome record：`PROJECTED` 绑定 profile 与 target-entry digest，或 `QUARANTINED` 绑定 quarantine-record digest 与 reason；相反 outcome 的字段必须为 null。Source-entry set 必须 exact equality，source/target/quarantine digest 均不得重复，禁止 omission 或 one-to-many。

Quarantine record 只保存 source digest、受控 reason、detected profile、安全 metadata digest、`rawContentPersisted=false` 与 self digest；不得保存 raw content。Migration receipt 额外绑定 partition manifest、source-entry set 与 outcome-set digest，使 counts 与 exact partition 可独立对账。任何失败 rollback；相同输入第二次只能为 `VERIFIED_NO_OP`；`providerRequestDelta=0`。Candidate 在 B6 前不能 promotion。

Receipt 绑定 source/target cache digest、profile-registry digest、source/projected/quarantined counts、quarantine digest、provider delta 与 result。它不得携带 raw provider bytes。

本合同固定 `currentDecision=CANARY_FAIL`，不授权 provider、数据库、Canary、full160、模型训练、holdout、B8、mark ready、PR merge 或 release；`nextDevelopmentReadiness=NOT_AUTHORIZED`。本文件仍只冻结设计，不声明 implementation、真实 cache migration/current promotion、CI、finding closure 或 independent review 已通过。
