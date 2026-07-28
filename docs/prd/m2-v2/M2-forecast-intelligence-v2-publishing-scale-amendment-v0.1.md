# M2 分成收入预测 PRD：出版行业规模适配 amendment v0.1

稳定 amendment ID：`M2-PRD-PUBLISHING-SCALE-01`

绑定 PRD：`M2-forecast-intelligence-v2-prd-v0.2.md`

## 行业现实

单一出版社不是高频海量 SKU 场景。年度新品可能少于 50 部；现金历史长尾、作品
头部集中、渠道机制差异和多层分类同时存在。任何作品数门槛必须由本项目真实
training-side 证据和模型自由度解释，禁止从其他行业照搬 `50/100` 后写成业务
真理。

## 实体定义

SKU、版次/版本、standard work、创意作品、作者、授权关系、work-channel scope、
账单行、月度正现金和预测 case 是不同对象。当前权威只能唯一计算 3,053 个标准作品；
没有注册的 SKU/版本关系，所以不得把 distinct work 解释为年度新品 SKU。

## 分类与授权

三级分类只有 current 单值且缺少历史 `effectiveAt/availableAt`，当前只能用于
reporting。作品—平台授权关系必须具备 relation identity、start/end、
`effectiveAt`、`availableAt` 和 version 才能进入 strict origin。已观察现金关系
不是授权关系。

## 支持与 partial pooling

新模型必须实现 `DIRECT_FIT`、`SHRUNK_FIT`、`POOLED_PARENT`、`REPORT_ONLY`
四级支持状态。支持少时减少自由度并加强父层收缩，而不是删除人口或把弃权 case
写成 0。

训练资格与模型晋升资格分离。25–32 部作品可以进入低维、强收缩、作品分组的开发
检验，但不能自动获得 standalone 结论。所有小样本结论必须同时报告有效样本量、
集中度、origin 覆盖、稳定性、leave-one-work-out 和不确定性。

## 当前冻结

当前只有 mechanism 和 origin-observed platform identity 可进入新版本；
taxonomy 和授权均 `REPORT_ONLY`。新参数、层级和门禁由
`M2-PUBLISHING-SCALE-SUPPORT-01` 约束。历史模型、分数、阻断和 verifier 不变。

本 amendment 不授权 private 模型执行。执行必须等待 K7C 实现的 exact-head
Linux/Windows CI 成功。
