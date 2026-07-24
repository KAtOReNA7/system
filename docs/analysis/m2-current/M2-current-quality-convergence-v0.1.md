# M2 current 算法质量收敛 v0.1

## 结论

本轮停止扩建 C1–C3 式证据框架，在 `src/domain/m2Current/**` 建立唯一 current core，并用本机已授权的 private development 输入完成覆盖原因对账和一个受约束候选。

新候选 `M2-current-segmented-downward-calibration-v0.1` 在冻结的 824 部作品、7,851 个 formal-cash development case、5 个 origin 和 3/6/12/18/24 月 horizon 上得到：

| 指标 | B4 | current candidate |
|---|---:|---:|
| WAPE | 0.55648454 | 0.53184893 |
| signed bias | +0.08910997 | +0.03680632 |
| 相对 WAPE | — | -4.4270% |
| paired work×origin bootstrap 95% CI | — | [-9.4630%, -1.2818%] |

总体 bias、每个 horizon 的 bias 和 paired CI 三项 current development 门槛通过。结果仍是 `not_for_formal_decision`，不代表 final holdout、release 或 M3 formal 获批。

## 工程收敛

- 修复 candidate/comparator 对齐漏洞：双方现在独立建立唯一 case 索引，重复 key、集合不一致或 actual 不一致都会 fail-closed。
- `config/m2-current.v0.1.json` 成为 horizon、segment、population、threshold、bootstrap 和候选空间的运行时 authority，删除 current core 中的同值硬编码。
- 默认测试只运行当前代码、合同和 private-independent 测试；历史 M2 replay 与 archive 测试转入独立双平台审计工作流。历史文件没有删除，因为它们仍承担冻结 verifier 和审计追溯，不再参与普通开发反馈循环。
- current candidate 只扩展 canonical `src/domain/m2Current/**`，没有复制 C1–C3 runner。
- public diagnostics 可在无 private 的新电脑复验；private candidate cases 和逐作品 eligibility ledger 只写入 Git ignored output。

## 覆盖问题已经拆开

过去的“覆盖率”混合了三种不同问题。本轮已分开：

1. 现金可观察性：全库 forecastable cash 为 73.96%，Top10 为 75.94%，主要缺口是没有 cutoff 可审计承诺的未来买断；算法不能把这部分补成现金预测。
2. 模型 eligibility：3,053 部中 824 部进入冻结模型人口；2,229 部排除原因已形成穷尽且互斥的本地 private ledger。
3. 模型服务：current candidate 对冻结模型人口的 824 部、7,851 个 case 全部 materialize；这不等于覆盖全库 3,053 部。

公开原因对账为：1,610 部在所有冻结 development origin 均不可观察，399 部在所有可用 origin 均不足历史，220 部属于 formal-cash route 排除。route 内小格继续做互补抑制，逐作品 ledger 只保存在 Git ignored private output。

## 候选约束

- dense 和 intermittent 只允许对 B4 做 0.50–1.00 的向下校准，禁止放大。
- 每个 outer origin 只读取当时已经成熟的更早标签；同窗或未来 truth 不得进入选择。
- 训练片段必须满足绝对 bias 不超过 15%，否则回退 B4。
- dormant 复活候选至少需要两个更早 origin、100 个成熟 case，并且必须同时满足 bias 安全和 WAPE 至少改善 5%；否则回退 B4。
- case key、actual、824/7,851 人口和 B4 身份保持完全一致；不使用 zero imputation。

## 仍未解决的问题

dense 相对 B4 改善 3.63%，intermittent 改善 10.59%；dormant 没有改善。833 个 dormant case 中只有 80 个出现正现金，允许使用的成熟 as-of 内部证据不能稳定识别复活点，受控规则因此全部回退 B4。使用当前 shelf/rights 状态去解释历史 origin 会产生后见信息，不允许绕过。

因此当前状态是 `CANDIDATE_DEVELOPMENT_PARTIAL_BLOCKED`：

- overall/horizon/paired CI 已通过；
- dormant 切片仍未改善；
- 全库现金可观察性仍低于 90%；
- 业务抽检、final holdout 和 release 均未完成。

## 下一步

1. 不再增加新候选家族或复制历史 runner。
2. 对 current candidate 做脱敏业务抽检，重点检查 intermittent 改善与 dormant 回退是否符合业务预期。
3. 单独设计可审计的 commitment snapshot 数据角色解决现金可观察性；不得由算法猜测未承诺买断。
4. 只有业务抽检通过且另行获得授权后，才可申请 final holdout。

机器可读证据：

- `docs/analysis/m2-current/M2-current-segmented-candidate-v0.1.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.2.json`
