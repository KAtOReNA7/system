# 下一步交给 Codex 的指令

请使用最高模型能力和充分上下文。当前入口不是继续修改 M2 收入模式、评级、预测或建议规则，不是重新生成 private 任务包，不是进入 M3 formal execution。

当前入口是：

`M2 local candidate closeout + M3 parallel planning boundary`

## 当前状态

- 项目处于 **authorized local real-data development mode**。
- 远端 `main` 已包含 M1/M2 本地开发 checkpoint。
- M2 收入模式候选稳定：pure_sales_share=2579、pure_buyout=287、buyout_plus_sales=183、unknown=5。
- M2 评级层候选稳定：S+=38、S=117、A=84、B=358、C=152、D=356、E=1949。
- 预测层仍为 v1.1 conditional：2444 个作品进入版权期预测，610 个因版权到期缺口进入 operating-window pending。
- 运营建议主输出已删除，当前保留风险/复核提示和可解释 review bucket。
- 货架/版权状态已拆成可解释复核队列：active_rights_sparse_revenue_review=92，expired_with_tail_revenue_review=142。
- 用户部分填写版权到期复核包后，仍有 522 个版权到期缺口未由日期或 waiver 闭环。
- 分类、标签、作品状态、音频版权状态仍依赖公司基础表补齐。
- 当前不满足 formal M2 complete，也不允许 M3 formal execution。
- M2 local candidate 可以作为本地候选阶段收口；M3 只允许 parallel planning / PRD 设计准备。

## 优先读取文件

1. `README.md`
2. `AGENTS.md`
3. `NEXT-CODEX-INSTRUCTION.md`
4. `docs/prd/00-governance/scope.md`
5. `docs/prd/20-evaluation/M2-old-product-evaluation-prd-v0.1.md`
6. `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
7. `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.json`
8. `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`
9. `docs/analysis/m3/M3-parallel-planning-boundary-v1.json`
10. `docs/analysis/m2-real-data/M2-partial-copyright-expiry-review-M2-stage-check-v1.md`
11. `docs/analysis/m2-real-data/M2-partial-copyright-expiry-review-M2-stage-check-v1.json`
12. `docs/analysis/m2-real-data/M2-copyright-expiry-gap-review-pack-summary-v1.md`
13. `docs/analysis/m2-real-data/M2-shelf-status-review-bucket-update-v1.md`
14. `docs/analysis/m2-real-data/M2-master-data-readiness-gap-v1.md`
15. `docs/analysis/m2-real-data/M2-shelf-copyright-readiness-next-plan-v1.md`

## 当前允许做的事

- 继续 M2 readiness closure：读取用户本地授权数据、private 任务包和公司补表结果，生成本地脱敏 summary。
- 在本地开发环境中做 M2 readiness rerun、校验和脱敏报告。
- 仅在用户明确授权时，按本地模式使用本地 Docker/PostgreSQL。
- 设计 M3 parallel planning 文档：PRD、字段、数据需求、fixture/prototype、API contract 草案、测试计划。
- 生成不包含真实作品名、作者名、渠道名、原始账单行或 private 明细的公开报告。

## 当前禁止做的事

- 禁止进入 M3 formal execution。
- 禁止把 M2 local candidate 表述为 formal complete 或最终生产发布审批结果。
- 禁止连接远端生产、共享、staging-like 或未明确授权的数据库。
- 禁止写正式主数据。
- 禁止生成正式 release/export/audit。
- 禁止实现正式 M3 write/export/task API。
- 禁止提交 `data/private-output/**`、private Excel/CSV/JSON、原始账单、原始台账、完整作品明细、`.env`、`.pgpass`、dump、sqlite/db 文件。
- 禁止使用 `git add .`。
- 禁止触碰 stash。
- 禁止 force push。

## 下一轮推荐任务

优先顺序：

1. 用户到公司补表后，先回到 M2 readiness rerun，读取补表结果并生成脱敏 validation summary。
2. 闭环版权到期、作者、版权开始、分类、标签、作品状态、音频版权状态。
3. 复核 142 个到期仍有收入样本和 92 个版权有效但收入稀疏样本。
4. 重新执行 M2 PRD 对齐与 M3 readiness 审计。
5. 如用户只要求规划，可进入 M3 parallel planning，但只能做 PRD/字段/API 依赖/fixture/prototype 设计。
6. formal M3 必须等待 M2 readiness 通过和用户单独授权。

## 验证要求

修改代码后至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
```

只改文档也至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
```

任何失败不得伪造通过。若验证失败，必须说明失败命令、失败摘要和是否已有 staged 文件。
