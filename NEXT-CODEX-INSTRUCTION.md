# 下一步交给 Codex 的指令

请使用最高模型能力和充分上下文。当前入口不是重新打开版权/作者/状态/分类补表，不是 release 旧 v1.1 prepared export，也不是进入 M3。

当前入口是：

`基于最终 3053 部权威基础数据拟定并执行 M2 最终上线预测算法校准；旧 v1.1 conditional 已被用户拒绝，不得 release，不得进入 M3`

## 当前状态

- 项目处于 **authorized local real-data development mode**。
- M2 本地候选阶段已经保存为大版本 checkpoint：
  - `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.md`
  - `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.json`
- M2 local candidate 尚未 formal complete；人工基础数据字段已在本地候选层收口。
- M3 fixture/synthetic prototype 主链已完成；当前允许 private dry-run、人工补全、human acceptance 和 formal 设计准备，不允许 formal execution。
- 最终 3053 部范围的收入模式重算稳定：pure_sales_share=2578、pure_buyout=287、buyout_plus_sales=183、unknown=5。
- 最终 3053 部范围的前台评级重算稳定：S+=38、S=117、A=84、B=358、C=152、D=356、E=1948。
- v1.1 conditional 已被用户明确拒绝作为最终上线预测算法；旧 package 只保留审计和对照用途，禁止 approved/released。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，禁止依据旧 gap 报告重新生成待办。
- 用户最终分类标签基础表已固定：3053 部作品，出版物 1195 部、网文 1858 部，分类与标签人工缺口为 0；private 明细不进入版本控制。
- 最终表修正 836 部作品，固定 387 部作品、532 个标签赋值；新增分类和标签已进入受控词表 `2026-07-10-user-confirmed-v2`。
- 用户已确认 2 个作者显示改动属于误操作，系统已恢复此前已收口作者值；当前没有作者人工待办。
- 最终分类标签基础已恢复，M2 readiness/分类分层/本地评估一致性重算已通过：账单、基础表和评估范围统一为 3053 部，行数和收入守恒。
- 两类复核桶为到期但仍有收入 146、版权有效但收入稀疏 92；用户已完成全部 238 条确认，系统已校验并应用，待确认数为 0。
- 应用结果包含 238 条用户决定和 139 条事实型复核提示；作品状态为已上架 2298、已下架 755，音频版权状态为版权有效 2250、无限期 473、版权已到期 330。
- 用户已冻结 M2 产品口径：不输出自动运营建议或资源投入动作，只保留风险和事实型复核提示。
- 隔离本地正式执行已经完成：Flyway `0071.020`、3053 部基础信息、192872 条事实/projection、active mapping、3053 条 evaluation/input snapshot、task/audit 和 prepared export 均严格对账通过；自动运营建议为 0。
- M3 代表性材料和 formal execution 均暂缓；M2 完整收口前不准备 3 至 5 份选题材料。
- 当前业务数据决策缺口为 0。逐作品 private 正式基础信息输入候选覆盖 3053 部且已通过内容契约，并已用于 readiness 重算；不得依据旧恢复报告重开用户全量补表。
- 参考执行环境已用 PostgreSQL 16 和 Flyway `0071.020` 验证通过；每台开发机器必须自行核验本地隔离环境，不得在文档中写入机器专属绝对路径或假设 private 输出已经存在。
- 当前 3053 部基础信息和 192872 条收入事实是用户确认的最准确、后续上线时继续使用的权威输入。基础数据人工缺口为 0，不再生成补表；下一任务是算法校准。

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
19. `docs/analysis/m2-real-data/M2-formal-local-execution-summary-v1.md`
20. `scripts/m2-real-data/run_m2_formal_local_execution.mjs`
21. `src/repositories/m2EvaluationExportRepository.js`
22. `docs/analysis/m3/M3-next-execution-roadmap-v1.md`

## 下一轮推荐任务

优先执行：

`一次性完成 M2 最终上线预测算法校准与候选选择：只使用最终 3053 部权威基础数据和 192872 条收入事实，对旧 v1.1 做可复现基线对照，建立候选、滚动回测、分层误差、区间校准和业务可读验证包；未达到门槛则如实 FAIL，不得 release 或进入 M3`

执行要求：

1. 先确认 `HEAD == origin/main`、工作区范围和本机隔离环境；读取 README、AGENTS、当前 PRD、v1.1 验证报告、post-foundation readiness 和 formal-local execution 汇总。
2. 只使用最终 3053 部权威基础信息、最终 mapping 和 192872 条收入事实；不得重新清洗或覆盖已确认基础字段，除非发现可证明的工程错误并先报告。
3. 将 v1.1 作为被拒绝的历史基线，不做状态包装或小修粉饰。新候选必须重新完成 3/6/12/18/24 月滚动回测、关键分层比较、区间覆盖、P0/P1/P2、稳定性和高价值样本检查。
4. 生成中文、可读、Git 忽略的业务验证表，以及不含真实作品明细的可提交聚合报告；测试结果主要信息必须中文化。
5. 新候选通过工程门槛后仍不得自动 release；必须再次交给用户抽检并获得明确批准。M2 输出继续禁止自动运营建议或资源投入动作字段。

## 当前允许做的事

- 读取用户授权的 private 分类标签基础和既有本地 staging 证据。
- 重跑 M2 readiness、分类分层统计和本地评估一致性。
- 生成脱敏聚合报告并区分数据字段收口、业务复核和 formal gate。
- 读取已完成的本地正式执行和 prepared export 聚合证据作为历史对照。
- 修改 M2 预测算法、校准参数、回测脚本、测试和脱敏聚合报告。
- 在新候选获用户批准前保持所有结果 `not_for_formal_decision`，旧 v1.1 package 永不自动 release。

## 当前禁止做的事

- 禁止进入 M3 formal execution。
- 禁止实现正式 M3 API / write API / export API。
- M2 formal 链路确有需要时允许新增本地 forward migration，但必须先通过两类复核、内容契约和 dry-run 门禁；禁止在远端生产/共享/staging-like 数据库执行。
- 禁止连接远端生产、共享、staging-like 或未明确授权的数据库。
- 禁止提交 `data/private-output/**`、private Excel/CSV/JSON、原始账单、原始台账、完整作品明细、`.env`、`.pgpass`、dump、sqlite/db 文件。
- 禁止使用 `git add .`。
- 禁止触碰 stash。
- 禁止 force push。

## M3 formal 前置门槛

M3 formal 前必须满足：

1. M2 3053 部 readiness、两类复核、private 输入契约、formal input snapshot 与严格对账均已通过。
2. M2 formal master/mapping/evaluation/task/audit 已在隔离本地执行完成。
3. 基于最终权威输入的新预测算法通过回测、业务抽检和用户批准，新的 release 形成可审计完成证据；旧 v1.1 不满足本条。
4. M3 PRD/API/data/page/test contract pack 经用户确认。
5. 用户在 M2 正式链路完成后单独明确授权 M3 formal；当前已明确暂缓。

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

# M3 Private Completion Pack Recovery Reminder（当前暂缓）

On a new machine, ignored private materials and completion packs are intentionally absent. README/AGENTS must not record machine-specific absolute paths or promise that ignored artifacts exist. Regenerate the local pack with:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

Before running the command, the user must provide 3 to 5 materials through the Git-ignored private input role. If those files are missing, the command must stop with guidance and must not invent material or field values. Only code, format contracts, safety tests and sanitized evidence are committed.

Do not commit private input/output or generated completion packs. Do not enter M3 formal execution. Applying a filled pack is a separate user-authorized step.
