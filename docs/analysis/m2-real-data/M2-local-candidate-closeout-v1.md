# M2 local candidate closeout v1

生成日期：2026-06-28

本报告用于收口当前 M2 本地候选阶段，并明确其与 formal M2 complete、M3 formal execution 的边界。报告只使用 PRD、脱敏聚合报告和已提交代码证据，不包含真实作品名、作者名、渠道名、原始账单行、原始台账行或 private Excel 明细。

## 结论

| 项目 | 状态 | 结论 |
|---|---|---|
| M2 local candidate closeout | yes | 当前收入模式、评级、v1.1 conditional 预测、风险/复核提示、货架/版权复核桶和本地验证链路可以作为本地候选阶段收口 |
| M2 formal complete | no | 主数据 readiness、formal evaluation、release/export/audit 尚未闭环 |
| M3 parallel planning | yes | 可做 PRD、字段、接口依赖、fixture/prototype 和数据需求设计 |
| M3 formal execution | no | 不允许进入正式 M3 执行、正式开发、正式主数据写入或 formal release/export |

## PRD 基准

- `docs/prd/00-governance/scope.md` 定义 M2 为老品评估，M3 为新品评估；正式投入使用前必须完成 M1 至 M6。
- `docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md` 要求 formal M2 输入包括标准作品身份、收入事实、版权开始/到期、分类、标签、作品状态、数据 readiness、回测与版本失效机制。
- `docs/prd/10-data-foundation/work-master-data.md` 和 `docs/prd/10-data-foundation/classification-and-tags.md` 要求主数据、分类和标签可追溯，不能以本地候选替代 formal readiness。

## 已完成或候选稳定部分

| 模块 | 当前状态 | 证据 |
|---|---|---|
| 收入模式 | 候选稳定。全库 3054：pure_sales_share=2579、pure_buyout=287、buyout_plus_sales=183、unknown=5 | `docs/analysis/m2-real-data/M2-revenue-model-classification-v2.json` |
| 评级层 | 候选稳定。S+=38、S=117、A=84、B=358、C=152、D=356、E=1949 | `docs/analysis/m2-real-data/M2-rating-calibration-v5-summary.json` |
| forecast v1.1 conditional | 2444 个进入版权期预测，610 个仍因版权到期缺口进入 operating-window pending | `docs/analysis/m2-real-data/M2-forecast-output-type-after-dual-source-staging-v2.json` |
| 自动运营建议主输出 | 已删除主输出，保留风险/复核提示边界 | `docs/analysis/m2-real-data/M2-suggestion-removal-boundary-v1.json` |
| 风险/复核提示 | 以复核提示承接不确定业务状态，不直接伪造 formal 判断 | `docs/analysis/m2-real-data/M2-shelf-status-review-bucket-update-v1.json` |
| 610 缺口复核包 | 已生成 private 复核包，覆盖 610 个缺版权到期样本；private 文件不提交 | `docs/analysis/m2-real-data/M2-copyright-expiry-gap-review-pack-summary-v1.json` |
| 货架/版权复核桶 | 新增 active_rights_sparse_revenue_review=92；expired_with_tail_revenue_review=142 作为复核提示 | `docs/analysis/m2-real-data/M2-shelf-status-review-bucket-update-v1.json` |
| 测试和 CI | 本地最近验证包含 check:no-real-data、lint、build、test、smoke；CI 不依赖真实数据 | `README.md`、`.github/workflows/ci.yml` |

## 当前未完成 formal M2 的原因

| 阻断项 | 当前数量/状态 | 影响 |
|---|---:|---|
| 版权到期未闭环 | 522 个在用户部分填写后仍未由日期或 waiver 闭环 | 阻断版权期预测、剩余版权月数、formal readiness 和 M3 |
| 作者缺口 | 75 | 阻断标准作品 formal 主数据完整性 |
| 版权开始缺口 | 85 | 影响生命周期、版权期和回测解释 |
| 一级分类 | 3054 | 全库缺失，阻断运营解释、分层评估和校准 |
| 二级分类 | 3054 | 全库缺失，阻断细分策略 |
| 必要标签 | 3054 | 全库缺失，阻断 M4 校准和业务解释 |
| 作品状态 | 3054 | 全库缺失，阻断货架/下架 formal 判断 |
| 音频版权状态 | 3054 | 全库缺失，阻断版权状态 formal 判断 |
| formal evaluation/release/export/audit | 未完成 | 不能发布 formal M2，不能把本地候选作为 M3 formal 输入 |

## 用户需要到公司补齐的数据

| 数据项 | 建议来源/处理方式 | 当前用途 |
|---|---|---|
| 版权到期日 | 版权部或公司基础表；优先处理高收入和 identity 已确认样本 | 闭环 522 个剩余版权到期缺口 |
| 作者 | 公司基础表或版权部确认 | 闭环 75 个作者缺口 |
| 版权开始 | 公司基础表或版权台账确认 | 闭环 85 个版权开始缺口 |
| 一级/二级分类 | 公司分类口径或人工确认模板 | 支撑正式分层、评估解释、页面筛选和 M4 校准 |
| 必要标签 | 公司标签库或运营确认模板 | 支撑策略解释和校准 |
| 作品状态 | 公司基础表或运营状态源 | 支撑上架/下架、可运营性判断 |
| 音频版权状态 | 版权部状态源 | 支撑版权有效性和 formal readiness |
| 到期但仍有收入的业务解释 | 版权部/运营确认：结算滞后、续约未入账、渠道滞后或异常 | 复核 142 个 expired_with_tail_revenue_review 样本 |
| 版权有效但收入稀疏样本运营状态 | 运营确认是否仍可运营、仅观察或无需动作 | 复核 92 个 active_rights_sparse_revenue_review 样本 |
| 用户提到的指定内容/系列新基础表 | 公司基础表补齐后再重跑 readiness | 作为当前补表依赖，不在公开报告写真实名称 |

## 已纳入本次提交的 8 个脱敏报告

| 文件 | 用途 |
|---|---|
| `docs/analysis/m2-real-data/M2-copyright-expiry-gap-readiness-v1.md` | 610 个版权到期缺口影响分析 |
| `docs/analysis/m2-real-data/M2-copyright-expiry-gap-readiness-v1.json` | 版权到期缺口 summary |
| `docs/analysis/m2-real-data/M2-master-data-readiness-gap-v1.md` | 主数据 readiness 缺口分析 |
| `docs/analysis/m2-real-data/M2-master-data-readiness-gap-v1.json` | 主数据 readiness summary |
| `docs/analysis/m2-real-data/M2-shelf-copyright-readiness-next-plan-v1.md` | 货架/版权 readiness 下一步计划 |
| `docs/analysis/m2-real-data/M2-shelf-copyright-readiness-next-plan-v1.json` | 下一步计划 summary |
| `docs/analysis/m2-real-data/M2-shelf-copyright-status-failure-analysis-v1.md` | 货架/版权状态失败原因分析 |
| `docs/analysis/m2-real-data/M2-shelf-copyright-status-failure-analysis-v1.json` | 货架/版权状态失败原因 summary |

## 状态声明

- M2 local candidate closeout：yes。
- M2 formal complete：no。
- M3 parallel planning allowed：yes。
- M3 formal execution allowed：no。
- 本报告未修改收入模式、评级、预测或建议规则。
- 本报告未连接远端生产/共享/staging-like 数据库。
- 本报告未写正式主数据。
- 本报告未提交 private Excel、`data/private-output/**`、原始账单、原始台账、完整作品明细、连接串或密码。

## 下一步建议

1. 用户先补齐公司基础表：版权到期、作者、版权开始、分类、标签、作品状态、音频版权状态。
2. 对 142 个到期仍有收入样本、92 个版权有效但收入稀疏样本完成运营/版权复核。
3. 补表后先回到 M2 readiness rerun，重新生成 M2 PRD 对齐和 M3 readiness 审计。
4. 在 formal readiness 通过前，只允许做 M3 parallel planning，不进入 M3 formal execution。
