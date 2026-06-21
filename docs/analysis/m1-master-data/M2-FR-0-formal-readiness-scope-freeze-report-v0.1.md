# M2-FR-0 formal readiness 范围冻结与实施切片确认 v0.1

生成时间：2026-06-22

## 1. 当前状态确认

本轮基于以下已入库结论进行范围冻结：

- M2 candidate-a 已被业务有条件接受；
- M2 允许按“非正式算法候选阶段”收口；
- 不继续技术线 C5/C6 参数微调；
- 不允许进入 formal evaluation；
- formal readiness 前置拆解已完成；
- 当前候选版本冻结为 `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`；
- 当前 commit：`dbec9640e02a51b3582930480dd538666bbb4ad5`。

本轮不是技术实现，不执行数据库写入、migration 实施、mapping_version 激活、formal evaluation、export / task / write API 开发。

## 2. FR-0 范围冻结结论

```text
M2-FR-0 formal readiness 范围冻结结论：
- candidate-a 是否冻结为 FR 阶段唯一非正式算法候选版本：是
- 是否继续 M2-C5/C6 参数微调：否
- 是否允许进入 formal evaluation：否
- 是否允许进入 formal readiness 技术实现：是
- 是否允许本轮执行数据库写入 / migration / API 开发：否
```

说明：

- FR 技术实现允许启动，是指后续可按切片进入 readiness 工程建设；
- FR 技术实现不等于 formal evaluation；
- candidate-a 在 FR 阶段作为唯一非正式算法候选版本，不再开启 C5/C6 无限调参；
- 如后续业务发现明确失败项，只允许针对失败项重开技术线，不默认重开整体参数校准。

## 3. 8 条 readiness workstream 冻结

### P0：进入第一批实现

| workstream | 优先级 | 进入 M2-FR 第一批实现 | 是否允许延后 | 冻结理由 |
|---|---|---:|---:|---|
| mapping_version readiness | P0 | 是 | 否 | active mapping_version 是正式评估输入合法性的前置条件。 |
| copyright end / basic info readiness | P0 | 是 | 否 | copyright end 缺口和基础信息缺口会直接影响正式评估可用性。 |
| blocking manual review readiness | P0 | 是 | 否 | 513 个 blocking manual review 必须在 formal evaluation 前完成处理。 |
| formal persistence | P0 | 是 | 否 | 正式评估必须具备可审计、可追溯、可失效的持久化模型。 |
| evaluation task API | P0 | 是 | 否 | formal evaluation 需要任务生命周期、状态、失败处理和审计链路。 |
| audit and release gate | P0 | 是 | 否 | 正式结果发布需要审计、版本、发布、回滚和 invalidation gate。 |

### P1：进入 FR 范围，但允许从第一批实现延后

| workstream | 优先级 | 进入 M2-FR 第一批实现 | 是否允许延后 | 冻结理由 |
|---|---|---:|---:|---|
| advisory review display | P1 | 否 | 是 | advisory review 不阻断 formal eligibility，但页面/报告必须提示。 |
| export API | P1 | 否 | 是 | export 不应阻塞 readiness gate 的核心建模，但正式结果发布/导出前必须完成。 |

P1 不代表可取消，只代表不进入第一批实现。进入 formal release、正式结果导出或业务发布前，P1 中的相关能力仍必须完成。

## 4. 最终实施顺序

确认采用以下顺序，不合并 FR-2 和 FR-3：

| 阶段 | 名称 | 目标 | 说明 |
|---|---|---|---|
| FR-1 | formal persistence data model + migration draft | 正式评估结果持久化模型、review state、invalidation state、algorithm/candidate version、input snapshot、audit metadata、migration 草案 | 先冻结数据模型和审计字段，避免后续 API 无持久化基线。 |
| FR-2 | mapping/basic-info/copyright readiness gate | active mapping_version 检查、copyright end 缺口、basic info 缺口、blocking/advisory 分类、formal evaluation 阻断原因 | 先建立输入合法性 gate。 |
| FR-3 | blocking manual review admin/API | 513 个 blocking review 处理清单、状态流转、通过/修正/豁免/拒绝进入正式评估、审计记录 | 与 FR-2 分离，避免 gate 判断与人工处理工作流耦合。 |
| FR-4 | evaluation task API + readiness gate | create/query/cancel/retry、未完成 readiness 时阻断、任务状态与失败审计 | 任务执行必须服从 readiness gate。 |
| FR-5 | advisory review display | 2,331 个 advisory review 进入页面或报告提示，不作为阻断，与 blocking review 明确区分 | P1，可在 P0 核心链路后实施，但不得在正式展示前遗漏。 |
| FR-6 | export API + audit/release gate | 导出字段、脱敏规则、审计、发布审批、回滚条件 | export 与最终 release gate 一并收口。 |

不合并 FR-2 + FR-3 的理由：

- FR-2 是机器可判定的输入 readiness gate；
- FR-3 是人工复核处理工作流；
- 两者职责、状态模型和审计粒度不同，拆分可降低实现和验收风险。

## 5. 必须确认的业务边界

| 业务边界 | 冻结结论 |
|---|---|
| `manual_review_required=513` 是否必须在 formal evaluation 前全部处理 | 是，必须全部处理并保留审计记录。 |
| `copyright end` 缺失 2,207 部是否必须全部补齐或逐项豁免 | 是，必须补齐或形成逐项可审计豁免。 |
| `advisoryReviewCount=2331` 是否只做展示，不阻断正式评估 | 是，只做页面/报告提示，不阻断 formal eligibility。 |
| `downlist_or_suspend=744` 是否必须人工确认后才允许导出 | 是，涉及下架/暂停/降投解释的导出必须人工确认。 |
| `renewal_review=209` 是否进入正式导出或仅作为页面提示 | 默认仅作为页面提示；如进入正式导出，必须在 FR-6 定义导出字段和审批边界。 |
| S/S+/A 是否仅作为资源优先级池，不自动触发投放 | 是，仅作为资源优先级池，不自动投放。 |
| D/E 是否仅作为低投入/观察/下架候选，不自动执行 | 是，仅作为候选，不自动执行。 |
| candidate-a 是否冻结为 FR 阶段唯一非正式算法候选版本 | 是，冻结为唯一非正式算法候选版本。 |

## 6. 本轮禁止事项确认

本轮未执行，且不得执行：

- 修改算法参数；
- 修改代码；
- 读取或提交原始真实账单；
- 输出作品级明细；
- 写数据库；
- 执行 Docker；
- 修改 `db/migrations/`；
- 激活 `mapping_version`；
- 调用 `switch_mapping_version`；
- 执行 formal evaluation；
- 新增 export / task / write API。

## 7. 下一步建议

推荐下一条线路：技术线。

推荐下一步任务：

```text
技术线：M2-FR-1 formal persistence data model + migration draft
```

最小边界：

- 只做 formal persistence 数据模型与 migration 草案；
- 不执行 migration；
- 不写数据库；
- 不激活 mapping_version；
- 不执行 formal evaluation；
- 不新增 export / task / write API 的运行能力；
- 不读取真实账单或输出作品级明细；
- 必须继续保留 candidate-a 的 nonformal 边界。
