# M2 v2 固定 Canary v3 执行合同 v0.2

## 结论

本合同冻结固定 10-work、5-work repeat 与 4-work Benchmark overlap。执行仅使用 Tavily 结构化 Search 与 Terra full/server_strict Extraction；所有结果均为 `not_for_formal_decision`，且 `full160Authorized=false`。

## 冻结对象

- Canary v3 manifest digest：`4288ad6130fe34da6f56f361604d44f1124313b3b3f4fc98b870570333d65f23`
- 原始 Canary parent digest：`883a0c8054d71029e2f1d385e9bc98ff4dbcccfc8659ee3764cc128e1a640248`
- repeat digest：`e3be6282451c02d6a630aeec322951d62fc477ca9e27d0f9cc2db0fc68e471fc`
- Frozen Bundle digest：`d68896763b2a7b63afd3580c623e06cd72eaa9432b396dd3e9e62b6a50f643df`
- overlap：4 works；映射 digest：`47dc97f3d066c9f0a188f30d0670bb6a6e790b4fb0811560b00d2bf074567ab8`
- 失败样本替换：false

## 路由与预算

- 默认/升级模型：`gpt-5.6-terra`
- 模式：`full/server_strict`
- adapter：`m2-v2-relay-extraction-adapter-v0.2`
- timeout：120000 ms；max output：1600
- reasoning：省略；tools/search：禁用；store：false
- 新 Tavily 上限：24
- 新 relay 上限：20；repair 总上限：5
- 每次请求在 dispatch 前持久化 reservation；旧计数不重置、不减少。

## Search 合同

- identity 模板：`"<title>" "<author>" 作品 作者`
- publication evidence 模板：`"<title>" "<author>" 原作 平台 评分 榜单 热度 改编 出版 出版社 出版`
- web-original evidence 模板：`"<title>" "<author>" 原作 平台 评分 榜单 热度 改编 出版 原作 连载 完结`
- 每个 query 最多 6 条；每个 work 最多 6 条 Source Records。
- 4 个 overlap primary 复用冻结 Bundle，物理 Tavily 请求为 0；repeat 必须独立检索。

## Gate 阈值

| 指标 | 阈值 |
|---|---:|
| logical Tavily success | 0.8 |
| Source Record work coverage | 0.8 |
| primary schema pass | 0.9 |
| work resolved | 0.8 |
| pilotUsable work coverage | 0.6 |
| high-value coverage | 0.75 |
| repeat claim agreement | 0.8 |
| repeat source overlap | 0.7 |
| no-timeout | 0.9 |
| model binding mismatch | 0 |

14 项 safety gate 必须全部通过；任何 safety 失败均为 `CANARY_FAIL`。即使 Canary 通过，本合同也不授权 full160。

## 输出边界

公共产物只包含脱敏聚合；作品、作者、query、URL、域名、snippet、密钥、原始响应与 provider receipts 禁止进入公共产物。未训练模型、未修改 B4、未打开 holdout、未进入 V2-C/V2-D/C4/M3、未 release。
