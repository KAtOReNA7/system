# M2 主数据 readiness 缺口分析 v1

生成日期：2026-06-27

本报告对 M2 进入正式评估和 M3 前置所需主数据做缺口审计。报告只写聚合信息，不写真实作品名、作者名、渠道名或原始行。

## 当前缺口

| 字段 | 缺口数量 | 是否阻断 formal readiness |
|---|---:|---|
| 作品名 | 0 | 否 |
| 作者 | 75 | 是 |
| 版权开始 | 85 | 是 |
| 版权到期 | 610 | 是 |
| 一级分类 | 3054 | 是 |
| 二级分类 | 3054 | 是 |
| 必要标签 | 3054 | 是 |
| 作品状态 | 3054 | 是 |
| 音频版权状态 | 3054 | 是 |

## 字段 readiness 判断

| 字段 | 当前状态 | 判断 |
|---|---|---|
| 标准作品名 | 已覆盖 | 可作为 M2 本地候选输入 |
| 作者 | 仍缺 75 | formal 前需补齐或明确豁免 |
| 版权开始 | 仍缺 85 | 影响生命周期与版权期计算 |
| 版权到期 | 仍缺 610 | 直接阻断版权期预测与 M3 readiness |
| 一级/二级分类 | 全量缺失 | 可本地跑候选，但不能 formal |
| 必要标签 | 全量缺失 | 阻断运营解释、策略分层和 M4 校准 |
| 作品状态 | 全量缺失 | 阻断货架/下架 formal 判断 |
| 音频版权状态 | 全量缺失 | 阻断版权状态 formal 判断 |

## 候选但不能自动应用的字段

| 字段 | dry-run 候选覆盖 | 是否允许自动应用 | 原因 |
|---|---:|---|---|
| 一级分类 | 2802 | 否 | 分类属于业务口径，需要人工/规则确认 |
| 二级分类 | 2770 | 否 | 同上 |
| 必要标签 | 1775 | 否 | 标签直接影响运营解释和后续校准 |

作品状态和音频版权状态当前没有可用候选覆盖，不能通过已有 dual-source limited staging 直接补齐。

## 与 PRD 的关系

- `docs/prd/10-data-foundation/work-master-data.md` 要求标准作品、作者、版权开始/到期、状态等主数据可追溯。
- `docs/prd/10-data-foundation/classification-and-tags.md` 要求分类和标签支撑运营解释、检索、策略分层和后续校准。
- `docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md` 允许 M2-A/M2-B 本地候选验证，但正式评估和 M3 前置需要 readiness 闭环。

## 能做与不能做

| 范围 | 是否可做 | 说明 |
|---|---|---|
| M2 本地候选验证 | 可以 | 必须标记为 local candidate，不是 formal complete |
| fixture/synthetic 或 private 本地复核 | 可以 | 不得提交 private 明细 |
| M2 formal release | 不可以 | 主数据 readiness 未闭环 |
| M3 | 不可以 | 版权、状态、分类/标签和 formal evaluation 均未完成 |

## 建议闭环顺序

1. 先处理 610 个版权到期缺口，尤其是高收入区间样本。
2. 同步补齐 75 个作者缺口和 85 个版权开始缺口。
3. 明确分类、标签、作品状态、音频版权状态的业务来源和人工确认口径。
4. 对低影响且无法补齐的样本设计 formal waiver，不默认豁免。
5. 完成后重新跑 M2 PRD 对齐和 M3 readiness 审计。

## 证据路径

- `docs/prd/10-data-foundation/work-master-data.md`
- `docs/prd/10-data-foundation/classification-and-tags.md`
- `docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md`
- `docs/analysis/m2-real-data/M2-business-readiness-after-dual-source-staging-v1.json`
- `docs/analysis/m1-master-data/M1-dual-source-masterdata-backfill-dry-run-v2.json`
- `docs/analysis/m1-master-data/M1-dual-source-auto-apply-rule-v2.json`

