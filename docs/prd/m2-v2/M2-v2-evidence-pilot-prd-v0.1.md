# M2 v2 External Evidence Pilot PRD v0.1

> **Historical / superseded / not authorization.** 本 PRD 记录 2026-07-17 已执行的 V2-B evidence-pilot 历史授权与冻结合同；该授权已被 V2-B.2–B.8 和后续完整性修复 supersede，不授权当前 provider、resume、Canary、full160 或新开发。当前只以 `docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md` 与用户最新明确指令为准。

## 结论与边界

V2-B 只验证 External Evidence Layer 的可获得性、可审计性和稳定性，不验证收入模型 uplift，也不改变 B4 或任何既有结果。全部结果为 `not_for_formal_decision`。

历史 V2-B 授权当时允许实现 provider-neutral 框架、固定样本、private file store、synthetic tests 和 provider pilot；该句只描述当时范围，现已 superseded，**不是当前 provider 调用或 resume 授权**。模型训练、C4、final holdout/embargo/60-month labels、V2-C/V2-D/M3 与 release 始终不在该授权范围内。

## Pilot 目标

- 检索覆盖、provider success/fallback；
- 作品与作者分别消歧；
- source tier、source terms 与 allowlist；
- `eventTime/availableAt/firstObservedAt/capturedAt` 的 prospective 语义；
- freshness、contradiction、structured extraction、citation；
- checkpoint/resume/cache、重复运行稳定性；
- 成本和延迟。

不测 Human-vs-AI、Commercial Value 模型、CatBoost/LightGBM/XGBoost 或任何收入模型改进。

## Population

从 3053 部权威作品中自动抽取 160 部唯一作品，固定 seed `20260717`。样本在检索前写入 Git 忽略的 immutable manifest，看到搜索结果后不得重抽。

至少覆盖：publication/web original、top1/top5/top10/middle/long-tail、pure-sales/mixed/pure-buyout、dense/intermittent/dormant、高价值、同名或高歧义风险，以及预计 evidence rich/sparse。分层只使用 retrieval 前可得的权威身份和历史事实，不使用候选结果或 final holdout。

## Query 和 provider

每部最多 8 个 query、每个 query 最多 10 个结果、每部最多读取 6 个页面。默认生成 4 个受控 query，query 只能包含对外检索所需的作品名/作者署名，不含内部 ID、收入、评级、权利状态或其他 private 字段。

provider mode 必须是 `structured_search`、`web_search`、`official_page_fetch`、`controlled_browser_fetch` 或 `no_provider_available`。浏览器只允许作为 allowlisted 例外路径，不绕过登录、验证码、付费墙、robots 或条款，也不作为默认链路。

如果没有授权 provider、凭证或经批准域名，执行状态必须为 `blocked_no_provider`：框架、样本、query plan、receipt、tests 和 bootstrap 继续完成，但不发请求、不伪造 evidence。

## Gate

17 项安全/审计硬门必须全部通过。coverage、成本、延迟、实体解析和复现性是预注册观察指标，不得为通过而调整样本。硬门失败为 `PILOT_FAIL`；硬门通过但 provider/coverage/稳定性不足为 `PILOT_CONDITIONAL`；只有硬门和最低 usability 同时通过才可为 `PILOT_PASS`，且仍需另行授权 V2-C。

公开报告只含中文脱敏聚合，不含作品、作者、内部 ID、真实 URL、query、snippet 或 raw row。private manifest、receipt、evidence、review pack 和 cache 只写 Git 忽略目录。
