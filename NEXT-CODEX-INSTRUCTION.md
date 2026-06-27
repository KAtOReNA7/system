# 下一步交给 Codex 的指令

请使用最高模型能力和充分上下文。当前入口不是继续修改 M2 收入模式、评级、预测或建议规则，不是重新生成 private 任务包，不是进入 M3 formal execution。

当前入口是：

`M3-0 new-product evaluation contract pack under M2 local candidate checkpoint`

## 当前状态

- 项目处于 **authorized local real-data development mode**。
- M2 本地候选阶段已经保存为大版本 checkpoint：
  - `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.md`
  - `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.json`
- M2 local candidate 可以暂时告一段落，但 **M2 formal complete = no**。
- M3 只允许 parallel planning，不允许 formal execution。
- 收入模式候选稳定：pure_sales_share=2579、pure_buyout=287、buyout_plus_sales=183、unknown=5。
- 评级层候选稳定：S+=38、S=117、A=84、B=358、C=152、D=356、E=1949。
- 预测层仍为 v1.1 conditional：2444 个版权期预测，610 个因版权到期缺口进入 operating-window pending。
- 当前仍有 formal readiness 缺口：版权到期 522、作者 75、版权开始 85、一级/二级分类 3054、必要标签 3054、作品状态 3054、音频版权状态 3054。
- 上述剩余问题主要依赖公司基础表或人工补全，后续补表后必须先回到 M2 readiness rerun。

## 优先读取文件

1. `README.md`
2. `AGENTS.md`
3. `NEXT-CODEX-INSTRUCTION.md`
4. `docs/prd/00-governance/scope.md`
5. `docs/prd/06-新品评估.md`
6. `docs/prd/20-evaluation/common-evaluation-rules.md`
7. `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.md`
8. `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.json`
9. `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
10. `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`
11. `docs/technical-design/M3-new-product-evaluation-implementation-plan-v0.1.md`
12. `docs/analysis/m3/M3-new-product-evaluation-implementation-plan-summary-v0.1.json`

## 下一轮推荐任务

优先执行：

`M3-0 PRD / API contract / data model / page plan / test plan contract pack`

建议输出：

1. `docs/prd/30-new-product-evaluation/M3-new-product-evaluation-prd-v0.1.md`
2. `docs/api/M3-new-product-evaluation-api-contract-v0.1.md`
3. `docs/technical-design/M3-new-product-evaluation-data-model-v0.1.md`
4. `docs/product/M3-new-product-evaluation-pages-v0.1.md`
5. `docs/validation/M3-new-product-evaluation-test-plan-v0.1.md`
6. `docs/analysis/m3/M3-0-new-product-evaluation-contract-pack-summary-v0.1.json`

## 当前允许做的事

- 做 M3 PRD、字段、API contract、数据模型草案、页面方案、fixture/prototype 边界和测试计划。
- 只新增文档和 summary JSON。
- 使用 PRD 和脱敏聚合报告作为规划输入。
- 为后续 M2 补表后 readiness rerun 准备输入清单。

## 当前禁止做的事

- 禁止进入 M3 formal execution。
- 禁止实现正式 M3 API / write API / export API。
- 禁止写 migration，除非用户后续单独明确授权。
- 禁止连接远端生产、共享、staging-like 或未明确授权的数据库。
- 禁止写正式主数据。
- 禁止提交 `data/private-output/**`、private Excel/CSV/JSON、原始账单、原始台账、完整作品明细、`.env`、`.pgpass`、dump、sqlite/db 文件。
- 禁止使用 `git add .`。
- 禁止触碰 stash。
- 禁止 force push。

## M3 formal 前置门槛

M3 formal 前必须满足：

1. M2 readiness rerun 通过，或用户明确给出 formal exception。
2. 版权到期、作者、版权开始、分类、标签、作品状态、音频版权状态形成闭环。
3. formal task/export/release/audit 机制完成。
4. M3 PRD/API/data/page/test contract pack 经用户确认。
5. 用户单独明确授权 M3 formal。

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
