# M2 v2 Verifier Authority 与 Closed Binding 合同 v0.2

状态：`IMPLEMENTED_AND_SYNTHETICALLY_VERIFIED`；public sanitized；`not_for_formal_decision`。

实现范围：current/historical authority separation、exact closed roles、digest recomputation 与 fail-closed fault cases 已由 synthetic tests 验证。本合同不声称真实 private migration、exact-head CI 或 public restatement 已完成；`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

## Current authority

Current decision 只能来自版本化 current-state index 与 current integrity restatement。历史 B8 `CANARY_CONDITIONAL` 必须作为 `historicalDecision` 单独验证，不能满足 current predicate；current role 缺失或 digest 不匹配必须 fail closed。

B8 verifier 必须同时返回：`historicalDecision`、`historicalEvaluationVerified`、`currentRestatedDecision`、`currentRestatementVerified`、`effectiveReceiptsVerified`、`currentAuthorityDigestVerified`、`full160Authorized`。

## Closed member set

每阶段 transaction 必须精确绑定 state、cache index、receipt index、append-only request ledger、counter projection、transaction manifest、execution contract、immutable manifests、frozen upstream digests、derived evaluation、effective receipt index，以及 B8 的 current authority/restatement 和合同声明的 public report digests。

Verifier 从实际成员重算 receipt/cache、ledger replay、counter/state projection、evaluation 和 upstream digests；禁止信任 cache 自带 receipt digest、遗漏 legacy mirror 或接受 extra/missing role。

## 验收

通过 public verifier 入口分别注入 state、cache、receipt、ledger、counter、extra/missing role、upstream、restatement 和 derived NDJSON 篡改，十类均必须非零退出。Verifier 全程只读，`providerRequestDelta=0`。

本合同不授权 full160 或下一开发阶段。
