# M2 非正式算法候选阶段收口与 formal readiness gate v0.1

## 结论

M2 当前可以按“非正式算法候选阶段”收口。候选版本为 `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`。

当前不能进入 formal evaluation，也不能进入 M2-D 正式评估执行。下一步应转为业务/运营验收 candidate-a 与正式化前置条件确认，而不是继续技术线参数微调。

## 必答判断

| 问题 | 判断 | 说明 |
|---|---|---|
| M2-B fixture 阶段是否完成 | 是 | fixture API、管理端、E2E、CI、fixture-only engine 已形成闭环 |
| M2-C 非正式算法校准阶段是否完成 | 是，候选版完成 | C0-C4 已形成 aggregate-only 非正式候选链路 |
| M2 是否可以非正式算法候选阶段收口 | 是 | candidate-a 已形成可验收包，且未发现安全边界破坏或明显算法事故 |
| 当前是否可以进入 formal evaluation | 否 | 正式数据 readiness、业务验收、mapping activation、持久化和任务流程未完成 |
| 当前是否可以进入 M2-D formal evaluation | 否 | M2-D 的最小进入条件尚未满足 |
| 下一阶段最小任务 | 运营线验收 candidate-a 与 formal readiness 前置确认 | 先确认业务解释、阻断复核范围和基础信息补齐要求 |

## 已完成能力

- 老品 work-level 评估候选；
- 生命周期识别候选；
- 历史收入摘要候选；
- 三情景预测候选；
- 评级候选；
- 风险识别候选；
- 建议候选；
- 聚合 dry-run 与回测链路；
- fixture/admin 只读展示；
- 非正式参数版本管理。

## 当前阻断 formal evaluation 的事项

1. candidate-a 尚未经过业务/运营验收。
2. `manual_review_required=513` 的处理方式未确认。
3. `advisory-only review=2,331` 是否进入页面提示或报告提示未确认。
4. 缺失版权到期日的 2,207 部作品未补齐。
5. 正式 `mapping_version` 未激活。
6. 正式评估数据未写入数据库，且本阶段禁止写库。
7. evaluation task API、export API、正式发布审计链路未实现。
8. downlist、promote、renewal 等建议尚未形成运营策略确认。

## 进入 formal readiness 的最小条件

1. 运营确认 candidate-a 的评级、风险、建议解释可接受。
2. 明确 S/S+/A、D/E、manual review、advisory review 的业务使用边界。
3. 明确版权 fallback 是否可用于非正式预测，以及正式评估前是否必须补齐版权到期日。
4. 明确 513 个阻断复核是否全部需要正式评估前处理。
5. 明确 2,207 个缺失版权到期日作品的补齐策略。
6. 明确 downlist_or_suspend 和 renewal_review 是否必须人工确认。
7. 完成正式数据 readiness 与 mapping_version 激活前置检查。
8. 设计正式评估持久化、任务、审计和导出边界。

## 不建议继续技术线无限迭代

candidate-a dry-run 与 C-3 聚合结果一致，且本轮未发现以下问题：

- 原始明细泄露；
- 数据库连接或写库；
- Docker 执行；
- `db/migrations/` 修改；
- `mapping_version` 激活；
- `switch_mapping_version` 调用；
- 新增 write/export/task/formal/local_dry_run 产品能力；
- 明显算法事故。

因此，除非运营验收发现严重业务解释错误，否则不建议继续 C5/C6 参数微调。继续技术线微调的收益低于业务验收和正式化前置确认。

## 建议下一阶段

下一阶段建议为：运营线：M2 candidate-a 业务验收与正式化前置确认。

目标不是再调参数，而是确认 candidate-a 能否作为 M2 非正式算法候选版本被业务接受，并明确 formal readiness 的最小阻断项。
