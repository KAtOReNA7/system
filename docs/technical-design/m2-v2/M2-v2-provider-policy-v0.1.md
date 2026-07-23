# M2 v2 Provider Policy v0.1

## 决策

Provider contract 与 evidence schema 解耦。优先级为 structured search、带引用 web search、allowlisted official page fetch、受控浏览器例外路径，最后是 `no_provider_available`。Response 只是 retrieval receipt，必须经过实体、来源、时间、confidence、冲突和 schema gate 才能成为 evidence。

当前仓库没有获授权的 runtime adapter/凭证，也没有获批准的域名条目，因此只有 `no_provider_available` 启用。该状态是 fail-closed，不是 provider 成功。

## 必备 receipt

每次 attempt 必须记录 provider/version、request/query ID 与 hash、captured time、status/error class、result/page count、cost、latency 和 receipt digest。query 只可由作品名与作者署名模板生成，不得发送内部 ID、收入、评级、权利、风险或业务状态。

## 预算与停止

- 每部 8 query、每 query 10 results、每部 6 pages；
- pilot 总成本硬上限 CNY 400、单部 CNY 2.5、单 query CNY 0.3；
- transient failure 最多 2 次；rate limit 或 cost cap 立即停；
- 不自动切换到未经批准 provider，不自动启动浏览器。

Controlled browser 必须同时具备明确域名 allowlist 和条款批准，不得绕过登录、验证码、付费墙、robots 或网站条款，不保存完整网页，也不作为全库默认链路。
