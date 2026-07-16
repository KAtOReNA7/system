# 下一步交给 Codex 的指令

请使用最高模型能力和充分上下文。当前入口不是重新打开版权/作者/状态/分类补表，不是 release 旧 v1.1 prepared export，也不是进入 M3。

当前入口是：

`复核已完成的 Gate C 与 C2 FAIL/业务覆盖 CONDITIONAL 证据；停在 C3 与 final holdout 前，等待用户明确授权，不得重复训练 C2、进入 C3/M3、打开 final holdout 或 release`

2026-07-15 用户已冻结新的最高优先级业务口径：M2 正式点值只预测未来实销现金与 cutoff 时已确认且可审计的未来应收。未承诺买断、历史周期猜测、概率模型、已到账款未来摊销和 `buyoutMonthlyEquivalent` 不得进入现金预测。legacy-target C2-R development 已完成但结果为 `FAIL`，只保留为历史目标口径证据，不是 formal-cash 指标，也不得与 C2-R.1 直接比较。

当前 formal-cash correction 已完成 18615/12223 原 case universe 的三套 actual 和桥接：scoreable 重叠 case-window 聚合 `forecastableCashActual=82206415.70`、`uncommittedBuyoutSurpriseActual=5517115.15`、`totalLedgerCashActual=87723530.85`，466 个正 surprise case window，占比 0.06289208。当前权威输入没有 cutoff commitment as-of 数据角色，纯买断无承诺必须 null abstain。formal-cash comparator replay 在 7851 个固定模型人口 case 上冻结 B4；Gate B 经远端 checkpoint 重跑验证 14/14。C2-R.1 已按 45 个预冻结候选执行，overall WAPE 0.58382425、signed bias +0.02933805，23 项通过 13 项，结论 `FAIL`。C2 已在 Gate C 14/14 后按 79 个冻结候选执行，overall WAPE 0.55695480、signed bias +0.09289130；货币 reconciliation 已按 `calibration-spec-c2-v1.1-reconciliation-amendment` 改为整数分精确相等，预测和指标未变，25 项通过 16 项，`modelQualityDecision=FAIL`；全库/Top10 forecastable cash coverage 为 0.73964685/0.75941253，`businessCoverageDecision=CONDITIONAL`。

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
- `calibration-spec-v1.2-amendment` 已纠正 baseline 身份：faithful B0b 是旧 v1.1 Model E（A/B/C/D selector）的无泄漏 as-of 重放；此前误称 B0b 的公式切换版本已改名 B4。
- development forward 每模型 18615 个 case，statistically scoreable 12223，覆盖 1044/3053 部作品；served null 不按 0 混入模型 WAPE，`zeroImputationUsed=false`。
- faithful B0b/B1/B2/B3/B4 all-scoreable WAPE 分别为 1.6996/1.9022/1.8640/1.6995/1.6666，signed bias 分别为 +1.1024/+1.4794/+1.4497/+1.2348/+1.1961；所有 baseline 均不满足最终候选 bias gate。
- practical-equivalence 已改为 WAPE 相对差、paired block-bootstrap 等价区间、bias 差和 top10/horizon 回退四项严格 AND；仅 B4 属于严格等价集合，primary comparator 锁定 B4。B1、B3 和 faithful B0b 仍必须并列报告。
- 完整人口覆盖使用 3053 部和 192872 条权威事实，其中截至 2026-04 的 192869 条完整月事实作为非重叠收入分母；历史 scoreable 1044 部、unscoreable 2009 部。
- Phase A checkpoint `879fbd0a951ce6d465082321b38f965b14815935` 已 push；推送后 runtime receipt 已核对真实远端 SHA、重跑全部验证并独立复算 Gate A，所有条件为 true。
- C1 transparent ensemble 已按 8 个组件、148 个候选和 nested expanding-origin 完成 development validation；5 个 outer origin 均没有 bias-feasible candidate，使用预注册 fallback，未放宽任何 gate。
- C1 all-scoreable WAPE / signed bias 为 3.8502 / +3.5114，高价值 WAPE / bias 为 2.9538 / +2.7188，内部 80% coverage 为 0.8302；相对 B4 overall WAPE 回退 131.02%，bootstrap 相对差 95% CI 为 [0.0531, 4.5434]。19 项验收仅 5 项通过，结论为 `FAIL`。
- C1 结构验证、同 case-key、无泄漏、future perturbation、raw/served/abstention、C1-only interval 和脱敏契约全部通过；legacy-target C2-R 随后已执行但结论为 `FAIL`，旧 development 写入口已 fail-closed，只保留历史验证入口。formal-cash comparator、Gate B 和 C2-R.1 development 已完成；C2-R.1 结论同样为 `FAIL`。Gate C 与 C2 development 也已完成，C2 结论为 `FAIL`、业务覆盖为 `CONDITIONAL`。C3 未开始；final holdout、embargo 和 60 月标签仍 sealed，状态保持 `not_for_formal_decision`。
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
- 当前 3053 部基础信息和 192872 条收入事实是用户确认的最准确、后续上线时继续使用的权威输入。基础数据人工缺口为 0，不再生成补表；C2 development 已完成并 FAIL，下一算法动作须由用户另行明确授权。

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
23. `src/domain/oldProductEvaluation/calibrationSpec.v1.1.amendment.json`
24. `docs/analysis/m2-real-data/M2-calibration-baseline-scoring-correction-v1.md`
25. `docs/analysis/m2-real-data/M2-B0a-B0b-replay-attribution-v1.md`
26. `docs/analysis/m2-real-data/M2-calibration-baseline-development-v1.1.md`
27. `scripts/m2-real-data/run_m2_calibration_scoring_correction.py`
28. `src/domain/oldProductEvaluation/calibrationSpec.v1.2.amendment.json`
29. `docs/analysis/m2-real-data/M2-baseline-comparator-identity-correction-v1.md`
30. `docs/analysis/m2-real-data/M2-calibration-population-coverage-v1.md`
31. `docs/analysis/m2-real-data/M2-calibration-gate-a-v1.json`
32. `docs/analysis/m2-real-data/M2-C1-development-validation-v1.md`
33. `scripts/m2-real-data/run_m2_c1_development_validation.py`
34. `src/domain/oldProductEvaluation/calibrationSpec.c2r.v1.1.amendment.json`
35. `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md`
36. `docs/analysis/m2-real-data/M2-C2R1-formal-cash-target-separation-v1.md`
37. `docs/analysis/m2-real-data/M2-C2R1-buyout-commitment-as-of-audit-v1.md`
38. `docs/analysis/m2-real-data/M2-C2R1-old-target-new-target-bridge-v1.md`
39. `docs/analysis/m2-real-data/M2-C2R-legacy-target-supersession-v1.md`
40. `scripts/m2-real-data/m2_formal_cash_target_v1.py`
41. `scripts/m2-real-data/run_m2_formal_cash_target_correction.py`
42. `src/domain/oldProductEvaluation/calibrationSpec.formalCashComparator.v1.json`
43. `docs/analysis/m2-real-data/M2-formal-cash-comparator-replay-v1.md`
44. `docs/analysis/m2-real-data/M2-surprise-buyout-unique-impact-audit-v1.md`
45. `docs/analysis/m2-real-data/M2-calibration-gate-b-v1.json`
46. `src/domain/oldProductEvaluation/calibrationSpec.c2r1.v1.amendment.json`
47. `docs/analysis/m2-real-data/M2-C2R1-development-validation-v1.md`
48. `scripts/m2-real-data/run_m2_c2r1_development_validation.py`
49. `src/domain/oldProductEvaluation/calibrationSpec.c2.v1.amendment.json`
50. `docs/analysis/m2-real-data/M2-calibration-gate-c-v1.json`
51. `docs/analysis/m2-real-data/M2-C2-development-validation-v1.md`
52. `docs/analysis/m2-real-data/M2-C2-model-quality-decision-v1.md`
53. `docs/analysis/m2-real-data/M2-C2-business-coverage-decision-v1.md`
54. `scripts/m2-real-data/run_m2_c2_development_validation.py`

## 下一轮推荐任务

优先执行：

`停在已验证的 C2 FAIL checkpoint，先报告 Gate C、C2 25 项 gate、渠道残差、高价值保护和业务覆盖双判定；等待用户明确授权下一动作，不得重复训练 C2、进入 C3、打开 final holdout、release 或进入 M3`

执行要求：

1. 在 `codex/m2-c2-v1` 上确认 C2 两个 checkpoint 均已正常 push 且 `HEAD == origin/codex/m2-c2-v1`、工作区 clean；读取 README、AGENTS、formal-cash comparator、C2 spec、Gate C 和 C2 validation。
2. 只使用最终 3053 部权威基础信息、最终 mapping 和 192872 条收入事实；不得重新清洗或覆盖已确认基础字段，除非发现可证明的工程错误并先报告。
3. 将旧 v1.1 作为被拒绝的 B0a 历史锚点；faithful B0b、B1、B2、B3、B4 使用已冻结的 12223 个 scoreable keys。不得恢复 forecastabilityStatus 混合口径，不得把 abstained served null 按 0 计入模型 WAPE。
4. 生成中文、可读、Git 忽略的业务验证表，以及不含真实作品明细的可提交聚合报告；测试结果主要信息必须中文化。
5. C1、legacy-target C2-R、formal-cash C2-R.1 与 C2 均已完成并 FAIL；不得重复训练、改 gate、进入 C3、打开 final holdout 或 release。下一算法动作必须由用户在复核 Gate C、C2 渠道残差、高价值保护、25 项 gate 和业务覆盖双判定后另行明确授权。M2 输出继续禁止自动运营建议或资源投入动作字段。

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
