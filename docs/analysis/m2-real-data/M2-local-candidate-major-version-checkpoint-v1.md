# M2 local candidate major version checkpoint v1

生成日期：2026-06-28

本报告用于把当前 M2 本地候选阶段保存为一个可追溯的大版本 checkpoint。它不是 formal M2 complete，不是 M3 formal execution 授权，也不是生产发布审批结果。报告只固化脱敏聚合结论、证据路径、后续补表清单和安全边界，不包含真实作品名、作者名、渠道名、原始账单行、原始台账行或 private Excel 明细。

## 大版本结论

| 项目 | 当前结论 |
|---|---|
| M2 本地候选阶段 | 暂时告一段落，可以作为本地候选 checkpoint 保存 |
| M2 formal complete | 未完成 |
| M3 parallel planning | 可以启动 |
| M3 formal execution | 仍禁止 |
| 本次提交性质 | 脱敏文档 checkpoint + M3 实施规划 |
| private 数据处理 | 继续保留在本地 gitignored 目录，不提交 |

## 当前可视为稳定的 M2 候选能力

| 能力 | 当前状态 | 证据 |
|---|---|---|
| 收入模式识别 | 候选稳定：pure_sales_share=2579、pure_buyout=287、buyout_plus_sales=183、unknown=5 | `docs/analysis/m2-real-data/M2-revenue-model-classification-v2.json` |
| 评级层 | 候选稳定：S+=38、S=117、A=84、B=358、C=152、D=356、E=1949 | `docs/analysis/m2-real-data/M2-rating-calibration-v5-summary.json` |
| 预测层 | v1.1 conditional：2444 个版权期预测，610 个 pending expiry | `docs/analysis/m2-real-data/M2-forecast-output-type-after-dual-source-staging-v2.json` |
| 风险/复核提示 | 已用可解释复核桶承接不确定状态 | `docs/analysis/m2-real-data/M2-shelf-status-review-bucket-update-v1.json` |
| 自动运营建议主输出 | 已移除，避免不稳定建议成为主业务输出 | `docs/analysis/m2-real-data/M2-suggestion-removal-boundary-v1.json` |
| 版权到期复核包 | 已生成本地 private 复核包，供用户补表和人工确认 | `docs/analysis/m2-real-data/M2-copyright-expiry-gap-review-pack-summary-v1.json` |
| M2 阶段边界 | M2 local candidate closeout=yes，formal complete=no | `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.json` |

## 仍未完成 formal M2 的部分

这些缺口主要属于公司基础表或人工补全类型，不是当前收入模式、评级或预测算法继续反复调参能解决的问题。

| 缺口 | 当前数量/状态 | 后续处理 |
|---|---:|---|
| 版权到期未闭环 | 522 | 公司基础表/版权部补齐，或正式 waiver |
| 作者缺口 | 75 | 公司基础表补齐或正式豁免 |
| 版权开始缺口 | 85 | 公司基础表/版权台账补齐 |
| 一级分类 | 3054 | 建立分类来源和人工确认口径 |
| 二级分类 | 3054 | 建立分类来源和人工确认口径 |
| 必要标签 | 3054 | 建立标签库和人工确认口径 |
| 作品状态 | 3054 | 公司基础表补齐 |
| 音频版权状态 | 3054 | 版权部/基础表补齐 |
| 到期但仍有收入 | 142 | 业务解释复核：结算滞后、续约未入账、渠道滞后或异常 |
| 版权有效但收入稀疏 | 92 | 运营确认是否仍可运营、仅观察或无需动作 |
| formal evaluation/release/export/audit | 未完成 | M2 formal 和 M3 formal 前必须补齐 |

## 保存范围

本 checkpoint 保存的是仓库可提交范围内的当前成果：

- 已提交的源代码、测试、脚本、PRD、技术设计和脱敏聚合报告。
- 当前 M2 本地候选结论、剩余阻断项和 M3 规划边界。
- 供下一轮 Codex 继续工作的 `NEXT-CODEX-INSTRUCTION.md`。

以下内容不进入本次提交：

- `data/private-output/**`。
- private Excel/CSV/JSON。
- 原始账单、原始台账、原创全库。
- 真实作品名、作者名、渠道名、原始账单行、完整作品明细。
- `.env`、`.env.local`、`.pgpass`、连接串、密码、dump、sqlite/db 文件。

## 为什么可以让 M2 本地候选暂时告一段落

1. 收入模式和评级层已经从明显异常状态收敛到可解释候选分布。
2. 预测层已明确采用 v1.1 conditional，不再把版权到期缺口伪装成完整版权期预测。
3. 自动运营建议主输出已移除，避免在规则不稳定时输出强建议。
4. 货架/版权状态已拆成复核桶，不再用单一算法硬判所有不确定状态。
5. 剩余主阻断集中在基础表和人工补全字段，适合转入补表与 M3 并行规划，而不是继续无限制调整 M2 算法。

## 大版本后的推荐工作流

| 顺序 | 工作 | 说明 |
|---:|---|---|
| 1 | 保留 M2 本地候选 checkpoint | 当前仓库版本作为后续回溯基线 |
| 2 | 启动 M3 parallel planning | 只做 PRD、方案、字段、API contract、页面方案和测试计划 |
| 3 | 公司补表 | 补齐版权、作者、分类、标签、作品状态、音频版权状态 |
| 4 | M2 readiness rerun | 补表后重新跑 readiness 和 PRD 对齐 |
| 5 | 用户单独授权 formal | 只有 formal readiness 通过后才考虑 M3 formal execution |

## 安全声明

- 本报告没有提交 private Excel 或 `data/private-output/**`。
- 本报告没有提交原始账单、台账、原创全库或完整作品明细。
- 本报告没有连接数据库、执行 migration、写正式主数据或进入 M3 formal execution。
- 本报告没有修改 M2 收入模式、评级、预测或建议规则。
