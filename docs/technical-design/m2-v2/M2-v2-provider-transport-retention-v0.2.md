# M2 v2 Provider Lowest-sink Capability 与 Retention 合同 v0.2

状态：`PROPOSED_NOT_CURRENT`；public sanitized；`not_for_formal_decision`。本文件冻结 B3 设计，不声明实现、外部调用、exact-head CI、独立审查或 finding closure 已完成。v0.1 与历史 routes 保持 immutable。

## Sinks 与 routes 是不同 registry

A **sink** 是实际执行 `fetch`/connect 的 source-path + symbol；a **route** 是从 runtime entrypoint 到一个或多个 sink 的调用路径。Route authorization 不能代替 sink authorization，route 必须只用 `sinkIds` 引用 exact sink registry。

Exact sink registry 有六项：

- `openAiCompatibleRelayAdapter.js` 的 `OpenAICompatibleRelayCanaryAdapter.execute`：`RETIRED_HARD_FAIL`；
- `v2b2Runtime.js` 的 `dispatchRelayResponse`：`RETIRED_HARD_FAIL`；
- `v2b4Runtime.js` 的 `dispatchRelayResponse`：`RETIRED_HARD_FAIL`；
- `relayExtractionProviderV2B5.js` 的 `dispatchV2B5RelayExtractionRequest`：`ACTIVE_CAPABILITY_REQUIRED`；
- `tavilySearchProviderV2B5.js` 的 `dispatchV2B5TavilyRequest`：`ACTIVE_CAPABILITY_REQUIRED`；
- `relayExtractionAdapterV2B6.js` 的 `dispatchV2B6RelayRequest`：`ACTIVE_CAPABILITY_REQUIRED`。

V2B5/V2B6/V2B7/V2B8 active routes 只引用后三个 active sinks；legacy Canary/V2B2/V2B4 routes 只引用各自 retired sink，并必须在 transport 前 hard-fail。Source scan 发现任何未登记 fetch/connect sink、active route 指向 retired sink、retired route 到达 transport，或 active sink 未消费 capability，均 fail closed。Route/sink registry 必须双向一致。

## Sink-owned one-shot capability

Capability 是 non-serializable opaque object，只由 module-private `WeakSet` 证明 ownership，plain object 不可伪造。它只可用一次，在最低 sink 前立即签发，并绑定 route ID、sink ID、physical request、canonical root identity、safe-cache digest 与 transport-policy digest。Sink 消费前重新检查 ownership、unused state、route/sink/request/root/cache/policy；missing、forged、stale、reused、wrong scope 或签发后 mutation 必须在 fetch/connect 前拒绝。

Endpoint 继续要求 HTTPS、approved host、no userinfo/fragment/private host、redirect revalidation、Bearer 后附加、Responses `store=false` 与 secret-safe error。Tests 只可用 fake fetch、loopback 与 no-external sentinel；真实 external attempt 是 `BLOCKED_EXTERNAL_ATTEMPT`，即使被阻断也算 attempt。`actualExternalFetchCount=0`、`providerRequestDelta=0`。

## Authorization boundary

完整边界固定为：`currentDecision=CANARY_FAIL`、`providerDispatchAuthorized=false`、`databaseConnectionsAuthorized=false`、`canaryAuthorized=false`、`full160Authorized=false`、`modelTrainingAuthorized=false`、`holdoutAccessAuthorized=false`、`independentReviewBatchB8Authorized=false`、`markReadyAuthorized=false`、`mergeAuthorized=false`、`releaseAuthorized=false`、`nextDevelopmentReadiness=NOT_AUTHORIZED`。
