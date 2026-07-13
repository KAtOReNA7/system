# M3 下一阶段执行路线图 v1

状态：`prototype complete / user-deferred until M2 formal closure / formal blocked`

确认日期：2026-07-10

## 1. 当前结论

M3 已完成本地 fixture/synthetic prototype 主链，具备从选题物料到候选评估、流程状态和回测锚点的非正式工程能力。2026-07-13 用户明确暂缓 3 至 5 份代表性选题材料、private human acceptance 和 M3 formal execution，直到 M2 两类复核桶及正式链路彻底收口。后续恢复时再按以下顺序执行：

1. 完成代表性 private 材料的人工补全；
2. 完成 local human acceptance；
3. 冻结 PRD/API/Data/Page/Test contract；
4. 补齐 M2 formal input、private 合规、持久化和审计门禁；
5. 再由用户单独授权 M3 formal execution。

当前结果不等于 production-ready、formal complete、approved evaluation 或 release-ready。

## 2. 已完成能力

当前 prototype 已覆盖：

- material-first 输入；
- 文本、docx、旧 doc fallback、图片人工转录路径；
- 字段抽取候选、缺口和人工补全包；
- readiness hard-blocker 判定；
- research questions；
- external evidence 数据结构；
- 系统对标、运营指定对标和同作者作品分开展示；
- 作者排位；
- 每个目标渠道单独 point forecast；
- 渠道权重、贡献和总额解释；
- `new_product_candidate_rating` 及支撑、限制、warning/risk 解释；
- workflow state machine；
- 首年、三年、五年 backtest anchor；
- private dry-run review prototype；
- bootstrap、补全包生成、校验和受控 apply 命令。

证据：

- `docs/analysis/m3/M3-local-prototype-closeout-v0.1.md`
- `docs/analysis/m3/M3-formal-boundary-after-prototype-v0.1.md`
- `docs/analysis/m3/M3-private-material-dry-run-human-acceptance-plan-v0.1.md`

## 3. 输入契约

### 3.1 主入口

M3 主入口是 private 选题物料，包括 Word、PDF、PPT、图片、文本和物料表。结构化选题表是 fallback，不是唯一入口。

### 3.2 来源枚举

`source` 只能是：

- `publication`；
- `web_original`。

其他值必须阻断，不能静默归类。

### 3.3 Numeric forecast hard blockers

只有以下字段具备后，才允许进入数值预测：

1. 书名；
2. 作者；
3. 合法来源；
4. 分类候选或确认分类；
5. 字数或有声体量估计至少一个；
6. 至少一个可用热度信号；
7. 版权期限范围；
8. 至少一个目标渠道；
9. 已核查同名有声状态；
10. 网文完结状态。

出版物可默认完结，但必须保留 warning。分类候选仍需用户确认。

### 3.4 Warning-only 字段

下列字段缺失通常只产生 warning，不应过度阻断：

- 简介；
- 评论数；
- 改编信号；
- 运营推荐理由；
- 运营指定对标；
- 非关键补充证据。

## 4. 输出契约

M3 local candidate 可以输出：

- 字段抽取候选、来源和缺口；
- readiness 状态与原因；
- research questions；
- 外部证据结构及 confidence；
- 系统对标、运营对标和同作者作品；
- 作者排位及是否启用；
- 每渠道 point forecast；
- `totalForecast = sum(channelForecasts)`；
- 首年预测、第 1—5 年拆分和五年总额；
- `new_product_candidate_rating`；
- 评级支撑、限制和 warning/risk；
- workflow 状态、时间线和审计候选事件；
- 首年、三年、五年 backtest anchor。

禁止输出：

- 预测区间；
- high/base/low；
- optimistic/pessimistic；
- 自动开发建议；
- 资源投入等级；
- formal release conclusion；
- formal task/export/write API 结果。

Blocked 项不能使用 `E` 作为占位评级；`E` 只有在完成候选评估后才是合法评级。

## 5. 分阶段执行计划

### 阶段 0：当前 checkpoint 与跨电脑可重复性

任务：

- 提交并推送当前 M2/M3 脱敏 checkpoint；
- 确认提交后 `HEAD = origin/main`；
- 保持工作区 clean；
- 公开仓库只保存恢复脚本、schema、内容契约、安全测试和脱敏聚合证据；
- private 原件和逐作品输出通过批准的 private 存储恢复，不通过 Git 传播；
- M2 逐作品输入必须通过内容契约，不能仅凭文件存在解除门禁。

退出条件：

- Git 中无 private 明细；
- M2 private 输入状态可解释为 `verified` 或明确 `blocked`；
- README/AGENTS 无机器绝对路径；
- M3 仍标记为 non-formal。

### 阶段 1：代表性 private dry-run

任务：

- 选择 3—5 份有代表性的 private 选题材料；
- 至少覆盖出版物、原创网文和字段稀疏材料；
- 运行 bootstrap 和材料解析；
- 输出匿名材料 ID、字段候选、缺口和补全包；
- 不在日志、公共报告或 Git 中出现真实标题、作者或材料原文。

退出条件：

- 材料组数量在 3—5；
- unsupported/missing 输入会明确停止；
- 没有伪造字段；
- private 输入输出均未被 Git 跟踪。

### 阶段 2：人工字段补全

用户只处理：

- 系统无法可靠抽取的 hard blockers；
- 分类确认；
- 同名有声核查；
- 网文完结状态；
- 必要的体量、版权范围、热度信号和目标渠道。

系统处理：

- 校验字段类型和值域；
- 区分缺失、冲突和低置信；
- 不将 warning 自动升级为 blocker；
- 不将用户输入泛化到未确认作品。

退出条件：

- 补全包校验通过；
- 每项人工值可追溯到匿名材料 ID；
- apply 尚未执行或已取得单独授权。

### 阶段 3：受控 apply 与 after-completion 重算

前置：用户单独授权 field-completion apply。该授权只适用于 local private dry-run。

重算链：

1. readiness；
2. research questions；
3. external evidence structure；
4. comparables；
5. author ranking；
6. channel forecasts；
7. candidate rating；
8. rating explanation；
9. workflow；
10. backtest anchor。

退出条件：

- `totalForecast` 与各渠道预测求和严格一致；
- blocked 项不产生数值预测或候选评级；
- 所有输出保留 non-formal 标记；
- 无禁止输出回归。

### 阶段 4：用户 human acceptance

每份材料可选择：

- `pass`；
- `minor_issue`；
- `major_issue`；
- `blocked`；
- `needs_more_material`。

逐份检查：

1. 字段抽取；
2. 缺口提示；
3. research questions；
4. 外部证据及 confidence；
5. readiness；
6. 系统与运营对标；
7. 作者排位；
8. 渠道预测；
9. 评级；
10. 评级解释；
11. workflow；
12. backtest anchor；
13. 禁止输出。

最低通过条件：

- 至少 3 份材料端到端完成；
- blockers 可解释；
- 预测保持 channel point-only；
- 评级保持 `new_product_candidate_rating`；
- workflow/backtest 可见；
- 未产生 formal 结果；
- private 数据未进入 Git。

### 阶段 5：PRD 与 contract 冻结

任务：

- 发布 M3 状态修订；
- 固定输入字段、readiness、预测、评级和对标口径；
- 固定外部证据来源、时间、confidence 和人工确认规则；
- 固定 private 材料保留、访问、删除和脱敏政策；
- 冻结 API/Data/Page/Test contract；
- 运行 formal-boundary 和 PRD-alignment audit。

该阶段只决定是否可以进入 formal 设计，不等于 formal execution 授权。

### 阶段 6：M2 formalization 与 M3 formal 设计

必须完成：

- formal basic-info version；
- immutable input snapshot；
- mapping version reference 和 activation 流程；
- M2 formal readiness rerun 或可审计 exception；
- M3 DB/schema/migration 设计；
- task、result version、export、release、audit；
- 权限、幂等、回滚和审计轨迹；
- private 数据泄漏防护；
- formal acceptance criteria。

146 个“到期仍有收入”和 92 个“版权有效但收入稀疏”样本需要形成业务处置或可审计例外，但不得重新包装为全量基础字段补表。

### 阶段 7：formal execution

只有用户再次单独授权后才允许：

- 写正式 migration；
- 实现正式持久化；
- 开放受控 task/write/export API；
- 实现正式页面、发布门禁和审计；
- 运行 formal 数据、功能、安全、流程、回滚和发布验收。

### 阶段 8：上线后回测与 M4 校准

- 保存上线前最后一次正式评估快照；
- 在首年、三年、五年执行回测；
- 将偏差、对标有效性、渠道权重和评级校准输入 M4；
- 不用后验结果覆盖原始评估快照。

## 6. 用户当前人工事项

现在需要：

1. 完成 M2 的两类业务复核；
2. 完成 3—5 份 M3 private 材料的 hard-blocker 补全；
3. 单独授权 local field-completion apply；
4. 按 human acceptance 清单逐份打标；
5. 决定是否接受 v1.1 conditional 与 rating-standard-v3 作为有限业务复核基线。

未来另行授权：

- 正式主数据写入；
- mapping activation；
- formal input snapshot；
- M3 formal DB/migration；
- task/export/release/audit；
- private material compliance；
- M3 formal execution。

## 7. 文档优先级

业务规则优先读取：

1. `docs/prd/30-new-product-evaluation/M3-restart-prd-v0.2.md`；
2. 本路线图；
3. `docs/analysis/m3/M3-local-prototype-closeout-v0.1.md`；
4. `docs/analysis/m3/M3-formal-boundary-after-prototype-v0.1.md`；
5. `docs/analysis/m3/M3-private-material-dry-run-human-acceptance-plan-v0.1.md`。

早期 M3 计划中的旧 M2 缺口数字和“尚未实现 prototype”阶段描述仅供历史追溯，不再作为当前待办来源。
