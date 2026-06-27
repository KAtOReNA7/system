# M3 PRD / contract / implementation 一致性审计 v0.1

生成日期：2026-06-28

审计基准：

- 当前 HEAD：`4b32ef8275af9795581c087081f1db45d3c88cee`
- PRD：`docs/prd/30-new-product-evaluation/M3-new-product-evaluation-prd-v0.1.md`
- API contract：`docs/api/M3-new-product-evaluation-api-contract-v0.1.md`
- data model：`docs/technical-design/M3-new-product-evaluation-data-model-v0.1.md`
- page plan：`docs/product/M3-new-product-evaluation-pages-v0.1.md`
- test plan：`docs/validation/M3-new-product-evaluation-test-plan-v0.1.md`

## 总结论

M3-0 到 M3-7 当前实现与 fixture/prototype PRD 大体一致，可以作为 fixture baseline。核心边界：synthetic-only、只读、formal blocked、无 DB/migration、无原始材料、无 private data，均已落地。

需要补强但不阻断当前 fixture baseline 的项：

1. 同作者作品“不占对标名额”的计数字段尚未显式暴露；当前只标记 `sameAuthor=true`，并保证最终对标总数不超过 3。
2. 系统对标与运营对标的并列保留尚未在 fixture 字段层明确区分。
3. 评级集合支持 S+/S/A/B/C/D/E 的设计口径已写入，但当前 5 条 synthetic fixture 未覆盖全部等级样本。
4. M4 校准入口目前只通过回测和文档口径表达，尚未形成独立 M4 candidate queue fixture。

以上均属于正式 M3 前的补强项，不构成当前 prototype 越界。

## 逐项映射

| # | PRD / contract 条目 | 当前实现状态 | 证据路径 | 完成度 | 是否阻断 fixture baseline | 后续建议 |
|---|---|---|---|---|---|---|
| 1 | M3-0 覆盖 M3-1 到 M3-7 | 已完成 | `docs/analysis/m3/M3-0-to-M3-7-development-summary-v0.1.json`、`src/domain/newProductEvaluation/fixtureEngine.js` | 完成 | 否 | 进入 formal 前拆分正式实施计划 |
| 2 | 选题库 fixture-only | 已完成 | `src/domain/newProductEvaluation/fixtureEngine.js`、`src/fixtures/m3NewProductEvaluationFixture.js` | 完成 | 否 | 保持 synthetic marker |
| 3 | 材料解析只处理 metadata 和结构化候选 | 已完成 | `material.fileMetadataOnly=true`、`rawMaterialStored=false` | 完成 | 否 | 正式材料策略另行授权 |
| 4 | 不提交原始材料 | 已完成 | `rawMaterialStored=false`、测试禁用 raw/private token | 完成 | 否 | 保持不提交 Word/PPT/PDF 原文件 |
| 5 | 精准历史对标最终不超过 3 部 | 已完成 | `finalComparatorCap=3`、API/engine tests | 完成 | 否 | 继续保持 cap test |
| 6 | 同作者作品不占对标名额 | 部分完成 | comparator 标记 `sameAuthor=true`；未暴露 separate cap accounting | 部分完成 | 否 | 正式前增加 `countsAgainstFinalComparatorCap=false` 或等价字段 |
| 7 | 系统对标与运营对标并列保留 | 部分完成 | comparator API 已有；未显式区分 system/operator comparator source | 部分完成 | 否 | M3-1 前补充 comparator source 维度 |
| 8 | 买断收入剔除或单列 | 已完成 | comparator 字段 `buyoutRevenueSeparated=true` | 完成 | 否 | 正式数据接入时复用 M2 收入模式规则 |
| 9 | 作者少于 3 部可测算作品时禁用作者排位 | 已完成 | `buildAuthorRanking()` comparableWorks < 3 时 disabled | 完成 | 否 | 增加边界测试可选 |
| 10 | 输出五年累计区间、五年基准、首年预测、1-5 年拆分 | 已完成 | `forecast.range`、`fiveYearBase`、`firstYearForecast`、`annualBreakdown` | 完成 | 否 | readiness blocked 样本继续不输出 numeric forecast |
| 11 | 输出 S+/S/A/B/C/D/E 评级 | 部分完成 | rating function 与 RATINGS 集合存在；fixture 样本未覆盖全部等级 | 部分完成 | 否 | 增加全等级 synthetic cases 后再 formal |
| 12 | 不输出固定“是否建议开发” | 已完成 | `rating.noDevelopDecisionOutput=true` | 完成 | 否 | 保持测试 |
| 13 | 不设置资源投入等级 | 已完成 | `rating.noResourceInvestmentLevel=true` | 完成 | 否 | 保持测试 |
| 14 | 一选题一标准作品、一作品一正式选题 | 已完成 | `topicWorkLink.oneTopicOneWork=true`、`oneWorkOneFormalTopic=true` | 完成 | 否 | 正式 DB 唯一约束需后续 migration |
| 15 | 回测仅首年/三年/五年入口，不伪造真实回测 | 已完成 | `backtestPlan.checkpoints`、`backtests.syntheticOnly=true` | 完成 | 否 | 正式上线后才能产生真实回测 |
| 16 | M4 校准入口只作为入口，不执行 M4 | 部分完成 | PRD/summary 说明；fixture backtest 尚未有独立 M4 queue | 部分完成 | 否 | M3 formal 前定义 M4 candidate handoff 结构 |

## PRD 一致性判断

满足项：fixture-only、metadata-only、无原始材料、对标数量上限、买断单列、作者排位样本门槛、五年/首年/分年预测、阻断样本不输出 formal-style 数值、评级边界、不输出开发建议、不输出资源等级、一对一关联、回测入口、formal guard。

不满足项：未发现会阻断当前 fixture/prototype baseline 的硬不满足项。

需补项：同作者不计名额的显式字段、系统/运营对标来源区分、全等级评级样本、M4 candidate queue 结构。

## M2 依赖判断

当前 M3 fixture 只把 M2 local candidate 作为工程参考，没有把 M2 local candidate 当作 formal M3 input。`M3_NEW_PRODUCT_DATASET.dependsOnM2FormalReadiness=true` 明确保留正式前置依赖。
