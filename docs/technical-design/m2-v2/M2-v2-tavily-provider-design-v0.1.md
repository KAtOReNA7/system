# M2 v2 Tavily Provider Design v0.1

## 设计摘要

`tavily_structured_search` 是 V2-B.5 独立 Search Provider。适配器只接收受控 query，输出 provider-neutral Source Record v0.2；API Key、Authorization 和完整响应不落盘。

## Capability

Capability 只发送 synthetic query，并验证 HTTP、JSON、非空 results、四个必需结果字段、HTTPS、request ID、response time 和 usage 可观测性。仅当 `include_usage` 被明确报告为不支持时移除该字段并重试一次。最终状态只有 `READY`、`BLOCKED_AUTH`、`BLOCKED_CONTRACT` 或 `BLOCKED_TRANSPORT`。

## 安全与审计

- response 上限 2 MiB；HTML、非 JSON、transport error 均结构化分类
- private receipt 只保留请求/响应时间、状态、结果数、credits、cache key、retry 和安全摘要
- URL 不被后续抓取或打开
- provider answer、raw content 和网页全文永不保存
- cache 参数或 schema 变化会产生新 key
- 先落盘预算 reservation，再进行网络调用；硬上限 40

该设计不授权 full160，也不改变任何既有模型、gate 或 holdout 状态。
