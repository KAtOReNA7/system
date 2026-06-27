# M3 PRD / contract / implementation 一致性审计 v0.1

生成日期：2026-06-28

审计基准：

- 当前 HEAD：`670d6b50b93fc951b291d58f249a6b7da563c34c`
- PRD：`docs/prd/30-new-product-evaluation/M3-new-product-evaluation-prd-v0.1.md`
- API contract：`docs/api/M3-new-product-evaluation-api-contract-v0.1.md`
- data model：`docs/technical-design/M3-new-product-evaluation-data-model-v0.1.md`
- page plan：`docs/product/M3-new-product-evaluation-pages-v0.1.md`
- test plan：`docs/validation/M3-new-product-evaluation-test-plan-v0.1.md`

## 总结论

M3-0 到 M3-7 当前实现与 fixture/prototype PRD 一致，可以作为 M3 fixture baseline。核心边界 synthetic-only、只读、formal blocked、无 DB/migration、无原始材料、无 private data 均已落地。

此前审计列出的非阻断补强项已经在 `670d6b50b93fc951b291d58f249a6b7da563c34c` 闭环：

1. 同作者作品不占对标名额：已通过 `countsAgainstFinalComparatorCap=false` 显式表达。
2. 系统对标与运营对标并列：已通过 `comparatorOrigin=system_selected/operator_suggested/same_author_adjustment` 表达。
3. S+/S/A/B/C/D/E：当前 10 条 synthetic topics 覆盖全部等级及 blocked 状态。
4. M4 校准入口：已新增 entry-only M4 candidate fixture 和只读 API，且 `m4Executed=false`。

## 逐项映射

| # | PRD / contract 条目 | 当前实现状态 | 证据路径 | 完成度 | 是否阻断 fixture baseline | 后续建议 |
|---|---|---|---|---|---|---|
| 1 | M3-0 覆盖 M3-1 到 M3-7 | 已完成 | `docs/analysis/m3/M3-0-to-M3-7-development-summary-v0.1.json`、`src/domain/newProductEvaluation/fixtureEngine.js` | 完成 | 否 | formal 前拆分正式实施计划 |
| 2 | 选题库 fixture-only | 已完成 | `src/domain/newProductEvaluation/fixtureEngine.js`、`src/fixtures/m3NewProductEvaluationFixture.js` | 完成 | 否 | 保持 synthetic marker |
| 3 | 材料解析只处理 metadata 和结构化候选 | 已完成 | `material.fileMetadataOnly=true`、`rawMaterialStored=false` | 完成 | 否 | 正式材料策略另行授权 |
| 4 | 不提交原始材料 | 已完成 | `rawMaterialStored=false`、测试禁用 raw/private token | 完成 | 否 | 保持不提交 Word/PPT/PDF 原文件 |
| 5 | 精准历史对标最终不超过 3 部 | 已完成 | counting final comparator 最大值为 2；`finalComparatorCap=3` | 完成 | 否 | 保持 cap test |
| 6 | 同作者作品不占对标名额 | 已完成 | `sameAuthor=true` 且 `countsAgainstFinalComparatorCap=false` | 完成 | 否 | formal 前再映射到正式字段/约束 |
| 7 | 系统对标与运营对标并列保留 | 已完成 | `comparatorOrigin` 覆盖 `system_selected`、`operator_suggested`、`same_author_adjustment` | 完成 | 否 | formal 前明确运营录入口径 |
| 8 | 买断收入剔除或单列 | 已完成 | comparator 字段 `buyoutRevenueSeparated=true` | 完成 | 否 | 正式数据接入时复用 M2 收入模式规则 |
| 9 | 作者少于 3 部可测算作品时禁用作者排位 | 已完成 | `buildAuthorRanking()` comparableWorks < 3 时 disabled | 完成 | 否 | 保持边界测试 |
| 10 | 输出五年累计区间、五年基准、首年预测、1-5 年拆分 | 已完成 | `forecast.range`、`fiveYearBase`、`firstYearForecast`、`annualBreakdown` | 完成 | 否 | readiness blocked 样本继续不输出 numeric forecast |
| 11 | 输出 S+/S/A/B/C/D/E 评级 | 已完成 | synthetic fixture 覆盖 S+/S/A/B/C/D/E 和 blocked | 完成 | 否 | formal 前补真实分布回归测试 |
| 12 | 不输出固定“是否建议开发” | 已完成 | `rating.noDevelopDecisionOutput=true` | 完成 | 否 | 保持测试 |
| 13 | 不设置资源投入等级 | 已完成 | `rating.noResourceInvestmentLevel=true` | 完成 | 否 | 保持测试 |
| 14 | 一选题一标准作品、一作品一正式选题 | 已完成 | `topicWorkLink.oneTopicOneWork=true`、`oneWorkOneFormalTopic=true` | 完成 | 否 | 正式 DB 唯一约束需后续授权 |
| 15 | 回测仅首年/三年/五年入口，不伪造真实回测 | 已完成 | `backtestPlan.checkpoints`、`backtests.syntheticOnly=true` | 完成 | 否 | 正式上线后才能产生真实回测 |
| 16 | M4 校准入口只作为入口，不执行 M4 | 已完成 | `/api/m3/new-products/m4-calibration-candidates`、`entryOnly=true`、`m4Executed=false` | 完成 | 否 | M4 正式阶段需单独 PRD/授权 |

## PRD 一致性判断

满足项：fixture-only、metadata-only、无原始材料、对标数量上限、同作者不计名额、系统/运营对标来源区分、买断单列、作者排位样本门槛、五年/首年/分年预测、阻断样本不输出 formal-style 数值、全评级覆盖、不输出开发建议、不输出资源等级、一对一关联、回测入口、M4 entry-only 入口、formal guard。

不满足项：未发现会阻断当前 fixture/prototype baseline 的不满足项。

formal 前仍需另行实现项：正式 persistence/migration、正式 task/write API、正式 release/export/audit chain、原始材料保存策略、权限模型、M2 formal readiness rerun。

## M2 依赖判断

当前 M3 fixture 只把 M2 local candidate 作为工程参考，没有把 M2 local candidate 当作 formal M3 input。`M3_NEW_PRODUCT_DATASET.dependsOnM2FormalReadiness=true` 明确保留正式前置依赖。
