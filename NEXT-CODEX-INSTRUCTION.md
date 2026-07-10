# 下一步交给 Codex 的指令

请使用最高模型能力和充分上下文。当前入口不是继续修改 M2 收入模式、评级、预测或建议规则，不是重新打开版权/作者/状态补表，也不是进入 M3 formal execution。

当前入口是：

`补齐并通过逐作品 private 输入内容契约，然后设计 formal basic-info version/input snapshot 并请求单独授权`

## 当前状态

- 项目处于 **authorized local real-data development mode**。
- M2 本地候选阶段已经保存为大版本 checkpoint：
  - `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.md`
  - `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.json`
- M2 local candidate 尚未 formal complete；人工基础数据字段已在本地候选层收口。
- M3 fixture/synthetic prototype 主链已完成；当前允许 private dry-run、人工补全、human acceptance 和 formal 设计准备，不允许 formal execution。
- 最终 3053 部范围的收入模式重算稳定：pure_sales_share=2578、pure_buyout=287、buyout_plus_sales=183、unknown=5。
- 最终 3053 部范围的前台评级重算稳定：S+=38、S=117、A=84、B=358、C=152、D=356、E=1948。
- 预测层仍为 v1.1 conditional；该模型边界不在当前任务中修改。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，禁止依据旧 gap 报告重新生成待办。
- 用户最终分类标签基础表已固定：3053 部作品，出版物 1195 部、网文 1858 部，分类与标签人工缺口为 0；private 明细不进入版本控制。
- 最终表修正 836 部作品，固定 387 部作品、532 个标签赋值；新增分类和标签已进入受控词表 `2026-07-10-user-confirmed-v2`。
- 用户已确认 2 个作者显示改动属于误操作，系统已恢复此前已收口作者值；当前没有作者人工待办。
- 最终分类标签基础已恢复，M2 readiness/分类分层/本地评估一致性重算已通过：账单、基础表和评估范围统一为 3053 部，行数和收入守恒。
- 复核桶当前为到期但仍有收入 146、版权有效但收入稀疏 92；前者按 Excel 底层完整金额精度计算。
- 当前业务数据决策缺口为 0。跨电脑恢复脚本和内容契约已经建立；本次 private 恢复候选虽覆盖 3053 部，但仍缺 12 个版权开始、65 个版权到期/音频版权状态、2860 个可验证作品状态，并且无法重建原来源确认分布，因此契约未通过、未被本次评估使用。不得仅凭文件存在解除门禁，也不得重开用户全量补表。

## 优先读取文件

1. `README.md`
2. `AGENTS.md`
3. `NEXT-CODEX-INSTRUCTION.md`
4. `docs/prd/10-data-foundation/classification-and-tags.md`
5. `docs/prd/04-标准作品与主数据.md`
6. `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
7. `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.json`
8. `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
9. `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.json`
10. `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
11. `docs/analysis/m2-real-data/M2-disentangled-forecast-v1.1-validation.md`
12. `src/domain/oldProductEvaluation/classificationTaxonomy.v1.json`
13. `scripts/m2-real-data/run_m2_classification_tag_final_foundation_apply.py`
14. `docs/analysis/m2-real-data/M2-post-foundation-readiness-rerun-v1.md`
15. `docs/analysis/m2-real-data/M2-post-foundation-formal-gap-audit-v1.md`
16. `scripts/m2-real-data/run_m2_post_foundation_readiness.py`
17. `scripts/m2-real-data/m2_five_source_staging_contract.py`
18. `scripts/m2-real-data/run_m2_five_source_staging_recovery.py`
19. `docs/analysis/m3/M3-next-execution-roadmap-v1.md`

## 下一轮推荐任务

优先执行：

`从批准的 private 存储恢复，或从已确认来源补齐逐作品输入并通过内容契约，再产出 formal basic-info version/input snapshot 设计审计`

执行要求：

1. 不得从脱敏聚合计数伪造逐作品版权日期、作品状态、音频版权状态或来源确认方式。
2. 优先从批准的 private 存储恢复；如确实丢失，只能从已确认源材料重建，并重跑 schema、唯一性、完整性、冲突、来源哈希和范围对账。
3. 恢复后必须与最终 3053 部分类标签基础逐 ID 对齐，且不覆盖用户确认分类/标签；文件存在不等于契约通过。
4. 然后设计 formal basic-info version 和 input snapshot，但在用户单独授权前不写正式主数据、不激活 mapping、不执行 formal evaluation。
5. 报告只输出脱敏聚合，不得提交 private staging、作品名、作者名、渠道名或行级收入。

## 当前允许做的事

- 读取用户授权的 private 分类标签基础和既有本地 staging 证据。
- 重跑 M2 readiness、分类分层统计和本地评估一致性。
- 生成脱敏聚合报告并区分数据字段收口、业务复核和 formal gate。
- 保持 v1.1 conditional 与 rating-standard-v3 的非正式候选边界，除非后续任务明确授权修改。

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

1. M2 3053 部本地 readiness/分层重算已通过；还需获得通过内容契约的逐作品 private 输入并生成可验证的 formal input snapshot。
2. 人工基础数据字段已按当前口径在本地候选层收口；正式主数据写入或 formal exception 仍需用户授权。
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

# M3 Private Completion Pack Recovery Reminder

On a new machine, ignored private materials and completion packs are intentionally absent. README/AGENTS must not record machine-specific absolute paths or promise that ignored artifacts exist. Regenerate the local pack with:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

Before running the command, the user must provide 3 to 5 materials through the Git-ignored private input role. If those files are missing, the command must stop with guidance and must not invent material or field values. Only code, format contracts, safety tests and sanitized evidence are committed.

Do not commit private input/output or generated completion packs. Do not enter M3 formal execution. Applying a filled pack is a separate user-authorized step.
