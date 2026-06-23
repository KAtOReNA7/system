# 下一步交给 Codex 的指令

请使用最高模型能力和充分上下文。当前入口不是 M1 技术设计，不是纯文档 contract pack，不是重新发现 candidate-b，不是重跑无必要的数据画像，不是继续 M2-C5/C6，也不是开启 FR-7。

当前入口是：

`M2 candidate-b final algorithm validation before M3 planning`

## 当前状态

- 本地/远端 `main` 已推进到 M2 closure 后续提交；开始前必须重新门禁确认 `HEAD == origin/main`，不要假定旧 HEAD `463f86e...` 仍是目标。
- 项目处于 **authorized local real-data development mode**。
- candidate-a `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a` 只能作为非正式 baseline，不能用于正式发布决策。
- candidate-b `m2-realdata-dev-candidate-b-v0.1` 是授权本地真实数据开发候选，不是最终正式发布审批结果。
- 本地 Docker/PostgreSQL 已验证使用 `postgres:16-bookworm`，本地 schema 已到 `0070.000`。
- 本地 DB-backed import/reconciliation 已通过，DB 中有 3054 个 evaluation results、3054 个 input snapshots、11531 个 risks、3863 个 suggestions、2844 个 review items。
- review workflow 曾生成 85 个 blocking review items 和 2759 个 advisory review items；当前 M2 business closure 已将 85 个 blocking review items 本地闭环，remaining blocking count = `0`。
- 85 个 blocking review items 的原始 group decision groups 为：
  - `GROUP-DATA-GAP-HIGH-VALUE` = 57
  - `GROUP-EXPIRY-HIGH-VALUE` = 23
  - `GROUP-INSUFFICIENT-HISTORY` = 4
  - `GROUP-ABNORMAL-SPIKE` = 1
- 已生成 item-level private review pack：`data/private-output/m2-review/candidate-b-blocking-review-pack.csv`；该文件 gitignored，不得提交。
- 已生成 private group decision template：`data/private-output/m2-review/candidate-b-group-decision-template.csv`；该文件 gitignored，不得提交。
- 已完成 data-gap remediation 诊断；在后续 M2 business closure 中，57 个 data-gap high-value items 已按本地闭环策略收敛为 `no_action_required` / accepted data limitation，不再作为当前 blocking 项。
- 已完成 expiry waiver policy draft；在后续 M2 business closure 中，23 个 expiry high-value items 已按本地闭环策略收敛为 `waiver_granted`，并保留 audit metadata，不再作为当前 blocking 项。
- 4 个 insufficient-history 和 1 个 abnormal-spike 已按本地闭环策略收敛为非阻断项。
- 当前 blocking review distribution 为 `no_action_required=62`、`waiver_granted=23`；candidate-b 可作为 M2 本地 readiness closure / formal baseline evidence，但仍不是最终生产发布审批结果。

## 优先读取文件

1. `README.md`
2. `AGENTS.md`
3. `NEXT-CODEX-INSTRUCTION.md`
4. `docs/technical-design/M2-next-stage-formalization-master-plan-v0.1.md`
5. `docs/technical-design/M2-authorized-real-data-development-plan-v0.1.md`
6. `docs/analysis/m2-real-data/M2-local-db-import-reconciliation-summary-v0.1.md`
7. `docs/analysis/m2-real-data/M2-candidate-b-blocking-review-workflow-summary-v0.1.md`
8. `docs/analysis/m2-real-data/M2-candidate-b-blocking-review-business-closure-plan-v0.1.md`
9. `docs/analysis/m2-real-data/M2-candidate-b-readiness-closure-summary-v0.1.md`
10. `docs/analysis/m2-real-data/M2-candidate-b-review-group-decision-policy-v0.1.md`
11. `docs/analysis/m2-real-data/M2-candidate-b-data-gap-remediation-summary-v0.1.md`
12. `docs/analysis/m2-real-data/M2-candidate-b-expiry-waiver-policy-draft-v0.1.md`
13. `docs/analysis/m2-real-data/M2-candidate-b-manual-exception-brief-v0.1.md`
14. `scripts/m2-real-data/run_candidate_b_review_decision_apply.mjs`
15. `scripts/m2-real-data/run_candidate_b_review_remediation.mjs`
16. `src/domain/oldProductEvaluation/reviewDecisionClosure.js`
17. `src/domain/oldProductEvaluation/reviewRemediationPlan.js`
18. `src/domain/oldProductEvaluation/realDataDbImportPlan.js`
19. `db/migrations/V0070_000__m2_evaluation_persistence.sql`
20. `package.json`
21. `.github/workflows/ci.yml`
22. `.gitignore`

若本地存在 `docs/technical-design/PROJECT-PROGRESS-FOR-EXTERNAL-AI-v0.1.md`，可作为 external AI handoff 辅助参考；不要假定它必然存在于远端 main。

## 授权边界

本地开发允许：

- 读取用户提供的本地真实数据，包括 `data/**`。
- 读取本地账单、数字版权台账、运营确认、清洗后账单和 M2-C 中间文件。
- 使用本地开发数据库。
- 使用本地 Docker/PostgreSQL。
- 为本地开发新增或修改 `db/migrations/`。
- 在本地执行 migration、导入、严格对账、回测、review workflow、数据修正和再导入。
- 生成 gitignored 的私有复核包供用户业务确认。
- 将用户明确确认后的 review decisions 写回本地开发 DB。

仍然严格禁止：

- 连接远端生产、共享、staging-like 或未明确授权的数据库。
- 提交原始账单、台账、私有 Excel/CSV、`.env`、`.pgpass`、数据库 dump、临时数据库文件或敏感明细。
- 打印密钥、连接串密码、原始行级敏感明细、完整作品/渠道/收入组合明细。
- 使用 `git add .`。
- 触碰 stash。
- 把本地 candidate-b 表述为最终正式发布审批结果。
- 在非本地/正式环境执行 mapping activation 或调用 `switch_mapping_version`。
- 创建正式发布导出。
- 实现对外正式 task/export/write API。
- 继续 M2-C5/C6。
- 开启 FR-7。
- 进入 M3。

## 下一轮建议大任务

不要重新发现 candidate-b，不要重跑无必要的数据画像，不要回到纯文档 contract pack，也不要等待用户逐行填写 85 条 item CSV。下一轮应继续：

1. 重新执行门禁：`git status --short`、`git rev-parse HEAD`、`git fetch origin main`、`git rev-parse origin/main`、`git diff --stat`、`git diff -- db/migrations`、`git ls-files --others --exclude-standard`。
2. 确认本地 Docker/PostgreSQL 可用，确认 schema `0070.000` 和 candidate-b DB-backed import/reconciliation 状态。
3. 基于当前 M2 closure 状态做算法正确性验证：抽样版权期明确作品，检查历史收入、生命周期、剩余版权期预测、评级、运营建议、风险、参考作品和回测误差。
4. 若验证发现系统性偏高/偏低，先给出最小算法调整建议和影响范围；不要直接进入 M3。
5. 若验证通过，冻结 M2 算法口径并进入 M3 年度目标规划。
6. 仍不要把本地 candidate-b 表述为最终生产发布审批结果；正式发布、生产使用、mapping activation 或 `switch_mapping_version` 仍需单独授权。

## 验证要求

修改代码后至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
```

本地真实数据/DB 相关改动还应运行：

```bash
npm run evaluate:m2:real-data:dev
npm run import:m2:real-data:local-db
npm run review:m2:candidate-b:local
npm run review:m2:candidate-b:export-pack
npm run review:m2:candidate-b:summary
npm run review:m2:candidate-b:export-group-template
npm run review:m2:candidate-b:group-summary
npm run review:m2:candidate-b:remediate-data-gaps
```

任何失败不得伪造通过。若 `npm test` 因本地 Python `numpy` / `pandas` 依赖缺失失败，应说明依赖问题，并使用临时 `PYTHONPATH` 或本地临时虚拟环境重跑，而不是误判项目失败。
