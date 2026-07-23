# M2 v2 Provider Transport 与 Retention 合同 v0.1

状态：`IMPLEMENTED_AND_SYNTHETICALLY_VERIFIED`；public sanitized；`not_for_formal_decision`。

实现范围：HTTPS/approved-host/redirect binding、Bearer 附加顺序、`store=false` 与 secret-safe errors 已由 in-memory synthetic tests 验证；未调用 provider。本合同不声称真实 private migration、exact-head CI 或 public restatement 已完成；`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

所有可执行 search/relay route 使用 `new URL()` 解析 endpoint，只允许 approved configured host 上的 HTTPS；禁止 userinfo、fragment、localhost/private IP。只有显式 in-memory synthetic adapter 可使用本地测试例外。Redirect 后必须重新验证 protocol 与 host。

Bearer key 只能在 endpoint binding 通过后附加。所有 Responses payload 强制 `store=false`，缺失或 true 必须在 dispatch/fetch 前失败；error/log 不得包含 key 或 Authorization。

任何 future provider run/resume 前必须满足：`legacyMutableCacheCount=0`、`rawResponseCurrentCacheCount=0`、`providerHostBindingVerified=true`。本合同只授权代码和 synthetic tests，不授权 provider 请求。
