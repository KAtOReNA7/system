# M2 v2 V2-B.5 Search Provider Contract v0.1

## 结论

V2-B.5 将 Search 与 Extraction 的 provider 责任彻底分离：Tavily 只返回结构化公开检索结果，当前 relay 只消费已冻结的 Source Records 做严格 JSON Extraction。该合同仅用于 prospective evidence pilot，状态为 `not_for_formal_decision`。

## Search 边界

- provider：`tavily_structured_search`
- endpoint：仅 `/search`
- 每部固定两个 query，单次最多六条结果，合并后每部最多六条 Source Records
- `topic=general`、`search_depth=basic`、`country=china`
- 禁止 answer、raw content、images、extract/crawl/map/research、递归抓取和浏览器
- Tavily 物理调用硬上限 40；每次调用前持久化预算预留
- capability 只使用 synthetic query；401/403、合同错误和 transport 错误分别 fail-closed

## Relay 边界

- relay Search Provider 已退役
- relay 仅为 `evidence_extraction_only`
- 禁止 `web_search`、browser、computer-use
- relay 物理调用硬上限 40

## Resume 与缓存

Cache key 绑定 provider、base URL、query digest、全部搜索参数、adapter/schema version 和 execution namespace。Primary 与 Repeat 使用不同 namespace；同一物理 slot 的成功结果可 resume，但不得把 Primary cache replay 冒充 Repeat 调用。崩溃后只有 reservation、没有结果的请求保持 indeterminate，并继续占用预算。

## 冻结边界

无论 capability、Benchmark 或 Canary 结果如何，`full160Authorized=false`。本轮不训练模型、不修改 B4、不打开 holdout、不进入 V2-C/V2-D/C4/M3，也不 release。
