# 下一步交给 Codex 的指令

请使用最高模型能力和充分上下文。当前入口不是继续修改 M2 收入模式、评级、预测或建议规则，不是重新打开版权/作者/状态补表，也不是进入 M3 formal execution。

当前入口是：

`基于用户最终固定基础表的 M2 readiness 重算与剩余 formal gap 审计`

## 当前状态

- 项目处于 **authorized local real-data development mode**。
- M2 本地候选阶段已经保存为大版本 checkpoint：
  - `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.md`
  - `docs/analysis/m2-real-data/M2-local-candidate-major-version-checkpoint-v1.json`
- M2 local candidate 尚未 formal complete；人工基础数据字段已在本地候选层收口。
- M3 只允许 parallel planning，不允许 formal execution。
- 收入模式候选稳定：pure_sales_share=2579、pure_buyout=287、buyout_plus_sales=183、unknown=5。
- 评级层候选稳定：S+=38、S=117、A=84、B=358、C=152、D=356、E=1949。
- 预测层仍为 v1.1 conditional；该模型边界不在当前任务中修改。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，禁止依据旧 gap 报告重新生成待办。
- 用户最终分类标签基础表已固定：3053 部作品，出版物 1195 部、网文 1858 部，分类与标签人工缺口为 0；固定结果为 `M2-classification-tag-foundation-local-fixed-cn-v1.xlsx/json`。
- 最终表修正 836 部作品，固定 387 部作品、532 个标签赋值；新增分类和标签已进入受控词表 `2026-07-10-user-confirmed-v2`。
- 用户已确认 2 个作者显示改动属于误操作，系统已恢复此前已收口作者值；当前没有作者人工待办。
- 人工字段本地收口不等于正式主数据写入或 M2 formal complete。下一步必须使用固定基础 JSON 重跑 M2 readiness 和本地评估一致性。

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

## 下一轮推荐任务

优先执行：

`使用最终固定基础 JSON 重跑 M2 readiness、分类分层统计和本地评估一致性`

执行要求：

1. 以 `data/private-output/m2-readiness/M2-classification-tag-foundation-local-fixed-cn-v1.json` 为分类与标签唯一输入，不得退回早期候选覆盖用户确认值。
2. 重算 M2 readiness、分类/标签分层统计、预测可用性和评级解释的一致性；不修改 forecast 模型规则。
3. 对齐旧 M2 聚合 3054 部与最终固定基础表 3053 部的范围差异，输出脱敏原因，不把该差异交给用户手工猜测。
4. 单独汇总到期但仍有收入 142 个、版权有效但收入稀疏 92 个业务复核桶的当前状态，不能把它们重新表述为基础字段缺失。
5. 输出脱敏聚合结果，不得在可提交报告中输出作品名、作者名或行级收入明细。
6. 不写正式主数据、不执行 mapping activation、不进入 M3 formal execution；如需正式主数据写入，必须先取得用户单独授权。

## 当前允许做的事

- 读取最终固定分类标签 JSON 和既有本地 staging 结果。
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

1. M2 readiness rerun 通过，或用户明确给出 formal exception。
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

On a new machine, the M3 private completion pack is intentionally absent because `data/private-output/**` is not committed. Regenerate it locally with:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

Before running the command, the user must place 3 to 5 private topic materials in `data/private-input/m3-material-dry-run/`. If those files are missing, the command should stop with guidance and should not invent private material or field values. If the files are present, it regenerates the JSON and Markdown completion packs under `data/private-output/m3-dry-run/`.

Do not commit private input/output or generated completion packs. Do not enter M3 formal execution. Applying a filled pack is a separate user-authorized step.
