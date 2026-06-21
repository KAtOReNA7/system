# M2 candidate-a 业务验收与正式化前置确认 v0.1

生成时间：2026-06-22

## 1. 验收对象

本轮验收对象为：

```text
m2-c3-cleaned-bill-nonformal-v0.2/candidate-a
```

当前边界：

```text
notForFormalDecision=true
formalEvaluationAllowed=false
```

当前关键结果：

| 指标 | 数值 |
|---|---:|
| evaluatedWorkCount | 3,054 |
| blockingManualReviewCount | 513 |
| advisoryReviewCount | 2,331 |
| copyrightFallbackUsage | 2,207 |
| downlist_or_suspend | 744 |
| renewal_review | 209 |

评级分布：

| 评级 | 数量 |
|---|---:|
| S+ | 7 |
| S | 30 |
| A | 160 |
| B | 647 |
| C | 704 |
| D | 395 |
| E | 1,111 |

## 2. 业务验收结论

```text
M2 candidate-a 业务验收结论：
- 是否接受 candidate-a 作为 M2 非正式算法候选版本：有条件接受
- 是否允许 M2 按非正式算法候选阶段收口：是
- 是否继续技术线 C5/C6 参数微调：否
- 是否允许进入 formal evaluation：否
- 是否进入 formal readiness 前置准备：是
```

解释：

- candidate-a 已具备作为“非正式算法候选版本”的业务解释性和收口条件；
- 当前风险 cap、manual review、advisory review 的分层边界清晰，足以支持非正式阶段收口；
- 当前不应继续扩大为 C5/C6 无限参数微调；
- formal evaluation 仍被阻断，原因是正式 mapping_version 未激活、版权到期信息缺口未闭环、blocking review 未处理、正式持久化 / task / export / 审计发布链路未完成。

## 3. 10 项业务确认

| # | 问题 | 业务确认结论 |
|---:|---|---|
| 1 | S+ / S / A 是否作为资源优先级池 | 是。S+ / S / A 可作为资源优先级池，但不等于自动投放或自动加预算。 |
| 2 | S+ / S / A 分别对应什么运营动作边界 | S+：头部重点人工评审与资源优先排期；S：重点运营/渠道/包装候选；A：常规增投、渠道优化或活动候选。三者均需结合版权、风险和人工复核。 |
| 3 | D / E 是否对应降投入、观察或下架候选 | 是。D / E 可进入降投入、观察或下架候选池，但不得自动下架或自动降权。 |
| 4 | `downlist_or_suspend=744` 是否必须逐项人工确认 | 是。任何下架、暂停、降投执行前必须逐项人工确认；candidate-a 只能给出候选队列。 |
| 5 | `manual_review_required=513` 的阻断复核规模是否可接受 | 可接受。513 作为 formal readiness 前必须处理的阻断复核规模可接受，不构成继续 C5/C6 参数微调的理由。 |
| 6 | `advisoryReviewCount=2331` 是否进入页面提示或报告说明 | 是。advisory review 必须进入页面提示或报告说明，但不阻断非正式候选阶段收口。 |
| 7 | `channel_concentration` 对天然单渠道作品是否降权或仅提示 | 默认仅提示，不自动降权。天然单渠道作品应结合业务形态、版权和历史表现判断；只有额外风险成立时才进入人工复核或 cap。 |
| 8 | `copyrightFallbackUsage=2207` 是否允许用于非正式预测 | 允许。可用于非正式预测和风险提示，但必须显式标记 fallback，不得作为正式评估依据。 |
| 9 | 缺失版权到期日的 2,207 部作品是否必须在正式评估前补齐 | 是。正式评估前必须补齐版权到期日，或形成逐项可审计的业务豁免；否则不得进入正式评估结论。 |
| 10 | `renewal_review=209` 的提前期和业务节奏是否合理 | 合理，作为非正式续约评审候选队列可接受；正式节奏仍需在 formal readiness 中确认排期、责任人和处理 SLA。 |

## 4. S+ / S / A 与 D / E 的运营动作边界

### S+ / S / A

S+ / S / A 只定义资源优先级池，不触发自动执行。

- S+：高优先级人工评审，适合进入重点资源排期、重点版权/运营复核和头部资源策略讨论；
- S：重点运营候选，可进入渠道、包装、活动、定价或版权策略评审；
- A：常规优先候选，可进入批量运营策略、渠道优化或轻量资源试投。

共同边界：

- 必须结合 blocking review；
- 必须结合版权有效期；
- 必须结合异常峰值、一次性收入和渠道结构风险；
- 不得自动生成投放、采购、续约或资源承诺。

### D / E

D / E 只定义低投入、观察或下架候选池，不触发自动下架。

- D：降投入、观察、重包装或渠道复核候选；
- E：低投入、观察、下架或暂停候选；
- `downlist_or_suspend=744` 必须逐项人工确认后才可执行任何下架、暂停或降投动作。

## 5. formal readiness 最小阻断项

进入正式评估前必须完成以下最小条件：

| 条件 | 是否必须 | 说明 |
|---|---:|---|
| 正式 mapping_version 激活 | 是 | 当前 mapping v0.2 未正式激活，不能作为正式评估依据。 |
| 补齐 copyright end | 是 | 2,207 部缺失版权到期日必须补齐，或形成逐项可审计业务豁免。 |
| 处理 513 个 blocking manual review | 是 | 513 是正式化前阻断队列，必须处理并留下确认记录。 |
| advisory review 页面提示 / 报告说明 | 是 | 2,331 条 advisory review 不阻断非正式收口，但正式页面和报告必须提示。 |
| 正式评估持久化 | 是 | formal evaluation 需要可审计、可追溯的持久化结果。 |
| evaluation task API | 是 | 正式评估需要任务生命周期、状态、失败处理和审计链路。 |
| export API | 是 | 正式结果发布、复核和归档需要受控导出能力。 |
| 审计与版本发布流程 | 是 | 必须建立算法版本、数据版本、mapping 版本、人工确认和发布时间的审计链路。 |

## 6. 不继续 C5/C6 参数微调的理由

candidate-a 当前问题不是“参数继续调优不足”，而是正式化前置治理问题：

- 风险分层已经能表达 blocking / advisory / non-blocking；
- 评级分布能形成运营优先级池；
- D / E 与 downlist_or_suspend 已明确为候选，不是自动执行；
- copyright fallback 可用于非正式预测，但不能替代正式版权到期信息；
- formal readiness 阻断项集中在数据、确认、持久化、task、export、审计与发布流程。

因此下一步不建议继续 C5/C6 参数微调，除非后续业务明确拒绝某个具体算法行为并给出失败项。

## 7. 禁止事项确认

本轮未执行，也不得执行：

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
- 新增 export / task / write API；
- UI 重构。

## 8. 下一步建议

因本轮为“有条件接受”，下一步不进入 C5/C6 无限参数微调。

推荐下一步：

```text
M2 formal readiness 前置拆解
```

建议拆解重点：

1. mapping_version 正式激活前置检查；
2. copyright end 补齐或业务豁免机制；
3. 513 个 blocking manual review 的处理流程；
4. advisory review 的页面 / 报告提示方案；
5. formal persistence、evaluation task API、export API；
6. 审计与版本发布流程。
