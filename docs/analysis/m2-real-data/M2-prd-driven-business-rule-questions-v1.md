# M2 PRD-driven business rule questions v1

本问题包由 Codex 基于 PRD、当前仓库进度、聚合验证报告、用户填写反馈和当前规则代码自动归纳。目标是让用户直接在对话中回答业务决策，再由 Codex 一次性实施。本文不包含真实作品名、作者名、渠道名或原始账单行。

## 问题总览

- 问题数量：12
- 优先级分布：P0 = 6，P1 = 4，P2 = 2
- 覆盖域：收入模式、买断评级、买断+实销、货架/版权状态、单一前台评级、实销档位、forecast 与 rating、运营建议、M4 校准、M2 收口边界。

## Q1 P0 收入模式应以“渠道行为优先”还是“作品聚合优先”判定？

- 为什么现在必须问：PRD 要求 work-level 输出，但 M2 当前收入识别已引入按渠道行为聚合。v3 收入模式合理率 88.0%，说明方向可用但边界需确认。
- 当前系统行为：`revenueModelClassifier.js` 支持 channel 模式和 work 聚合，结果包含 `pure_sales_share`、`pure_buyout`、`buyout_plus_sales`、`unknown_revenue_model`。
- 用户反馈暴露的问题：收入模式仍有 3 条不合理反馈，集中在买断/实销/分成边界。
- 关联 PRD：M2 PRD 第 2、3、5、6 节要求标准作品层输出，同时保留 business form 与 channel income structure。
- 关联报告：`M2-rating-standard-v3-operator-validation-summary-v1.json`、`M2-revenue-model-classification-v2.json`
- Codex 推荐答案：A。渠道行为优先识别，再聚合为作品级收入模式；作品级输出仍只显示一个主收入模式和说明。
- 可选答案：
  - A：渠道行为优先，作品级聚合输出。
  - B：完全按作品聚合，不保留渠道行为优先。
  - C：只要渠道之间冲突就标 unknown，避免自动判断。
- 影响：A 平衡准确率和可解释性；B 可能重新误判买断+实销；C 会扩大人工复核量。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否，评级前置依赖收入模式。
- 推荐用户如何回答：采用 A；如有特殊业务例外，在备注中列出例外类型而非逐作品明细。

## Q2 P0 unknown 收入模式应保守保留到什么程度？

- 为什么现在必须问：unknown 过少可能误判，unknown 过多会阻塞评级和建议。
- 当前系统行为：当前报告显示 unknown 已明显收敛，但仍有 manual review 边界。
- 用户反馈暴露的问题：收入模式合理率较高，但仍存在边界问题。
- 关联 PRD：M2 PRD 第 10 节风险系统要求数据问题和业务形态 mismatch 可形成风险。
- 关联代码：`revenueModelClassifier.js`
- Codex 推荐答案：A。只有证据不足或冲突时保留 unknown；单纯低收入不应 unknown。
- 可选答案：
  - A：证据不足/冲突才 unknown。
  - B：低活跃、低收入、少月份一律 unknown。
  - C：只要非高置信就 unknown。
- 影响：A 可减少不必要阻塞；B/C 会放大人工复核量并削弱 M2 批量评估。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否。
- 推荐用户如何回答：采用 A。

## Q3 P0 纯买断评级是否必须从“买断总额”改为“买断历史价值折算”？

- 为什么现在必须问：v3 纯买断 8/8 被标记评级不合理，且 v3 买断金额档位匹配率 100%，说明问题不是计算错，而是业务口径错。
- 当前系统行为：v4 候选已改为 `ratingBasis=buyout_history`，默认 `buyoutEstimatedAmount / 5 年`。
- 用户反馈暴露的问题：一次性买断金额直接推高前台评级，不代表当前持续实销能力。
- 关联 PRD：M2 PRD 第 9 节 rating system 要求评级体现 forecast value、lifecycle、risk、opportunity；纯买断不能等同当前实销。
- 关联报告：`M2-rating-standard-v3-targeted-failure-analysis.json`、`M2-rating-standard-v4-targeted-correction-summary.json`
- Codex 推荐答案：A。纯买断必须用买断历史价值折算，不直接套实销档位。
- 可选答案：
  - A：折算为历史价值评级，前台说明不代表当前持续实销。
  - B：仍用买断总额，但降一档或两档。
  - C：纯买断不进入 S/A/B/C/D/E，只标“历史买断价值”。
- 影响：A 最容易接入现有单一评级；B 仍可能业务误解；C 会破坏 PRD 的统一评级输出。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否。
- 推荐用户如何回答：采用 A，并确认折算年限见 Q4。

## Q4 P0 买断折算默认年限应固定为 5 年，还是按版权剩余期动态限制？

- 为什么现在必须问：v4 候选默认 5 年，但 PRD forecast period 依赖剩余版权期；买断历史价值如果不受版权期约束，可能仍虚高。
- 当前系统行为：v4 候选默认 5 年，并在代码候选中支持按剩余版权期限制。
- 用户反馈暴露的问题：买断评级虚高与版权/下架状态混杂。
- 关联 PRD：M2 PRD 第 8、9、10 节要求剩余版权期、评级和风险协同。
- 关联代码：`ratingCalibration.js`
- Codex 推荐答案：A。默认 5 年；如剩余版权期更短，则按剩余版权期限制，最低 1 年。
- 可选答案：
  - A：默认 5 年，并受剩余版权期上限限制。
  - B：固定 3 年，不看版权剩余期。
  - C：固定 5 年，不看版权剩余期。
- 影响：A 最保守且能避免到期作品虚高；B 更严厉；C 解释简单但可能高估。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否。
- 推荐用户如何回答：采用 A。

## Q5 P0 买断+实销前台评级是否确认“当前实销优先，买断最多上调一档”？

- 为什么现在必须问：v3 买断+实销 11 条中 9 条评级不合理，是评级层核心失败域。
- 当前系统行为：v4 候选为 `ratingBasis=mixed`，当前实销优先，买断最多上调一档。
- 用户反馈暴露的问题：v3 过度取买断历史价值，忽略当前实销。
- 关联 PRD：M2 PRD 第 6、9 节要求一个 work-level rating 和 rationale。
- 关联报告：`M2-rating-standard-v3-operator-validation-summary-v1.json`、`M2-rating-standard-v4-targeted-correction-summary.json`
- Codex 推荐答案：A。确认当前实销优先，买断历史价值最多上调一档。
- 可选答案：
  - A：当前实销优先，买断最多上调一档。
  - B：实销和买断取高者。
  - C：实销和买断分别展示，不合成主评级。
- 影响：A 与用户反馈最一致；B 会复现 v3 问题；C 与单一前台评级冲突。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否。
- 推荐用户如何回答：采用 A。

## Q6 P0 版权到期、尾部收入和下架状态应如何互相约束？

- 为什么现在必须问：v3 下架/版权状态合理率 72.0%，7 条不合理；PRD 风险系统要求 inactive/down-shelf status 但不能伪造事实。
- 当前系统行为：v4 候选将版权到期视为强信号但非绝对事实；尾部收入转为需核查状态；展示状态置信度。
- 用户反馈暴露的问题：版权到期、尾部收入、当前上架状态缺口混在一起。
- 关联 PRD：M1 REQ-WORK-007 规定标准作品状态；M2 PRD 第 10 节要求风险和 mitigation。
- 关联代码：`shelfStatusInference.js`
- Codex 推荐答案：A。版权到期不等于绝对下架；到期且有收入标“已下架但有尾部收入/需核查”；无明确上架字段时降置信。
- 可选答案：
  - A：状态事实和权利风险分开，全部展示置信度。
  - B：版权到期默认下架。
  - C：有收入默认在架。
- 影响：A 最能避免误导；B/C 都会把风险信号误当事实。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否。
- 推荐用户如何回答：采用 A。

## Q7 P1 单一前台评级是否确认只保留一个 rating，内部评级隐藏？

- 为什么现在必须问：PRD 要求 result rating，但用户复核需要看到原因；多评级会增加误解。
- 当前系统行为：v3/v4 候选前台保留一个评级，辅助评级隐藏或放在辅助列。
- 用户反馈暴露的问题：用户主要判断前台单一评级是否合理，内部评级不是最终业务语言。
- 关联 PRD：M2 PRD 第 6、9 节。
- 关联报告：`M2-front-rating-simplification-v1.json`
- Codex 推荐答案：A。只保留一个主 rating，内部评级不作为主阅读列，但评级说明必须包含依据。
- 可选答案：
  - A：一个主 rating + 评级依据 + 说明。
  - B：多个评级并列展示。
  - C：取消 rating，仅展示标签。
- 影响：A 最利于收口和页面/API 一致；B 复核成本高；C 偏离 PRD。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否。
- 推荐用户如何回答：采用 A。

## Q8 P1 用户实销档位是否确认作为 M2 v1 基准？

- 为什么现在必须问：纯实销/纯分成样本按用户实销档位直接匹配率 100.0%，说明该域不是主要问题。
- 当前系统行为：销售金额阈值用于 `ratingFromSalesAmount`，v4 不改纯实销阈值。
- 用户反馈暴露的问题：纯实销规则可冻结，避免继续无效调整。
- 关联 PRD：M2 PRD 第 9 节具体阈值 PENDING-DATA，需真实反馈确认。
- 关联报告：`M2-rating-standard-v3-operator-validation-summary-v1.json`
- Codex 推荐答案：A。以最近 12 个完整月实销优先，不足 12 月才用年化 run-rate；边界含等号按当前代码执行。
- 可选答案：
  - A：最近 12 月优先，不足时年化；边界含等号。
  - B：统一自然年收入。
  - C：统一年化 run-rate。
- 影响：A 保留当前通过反馈；B/C 需重新验证。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否。
- 推荐用户如何回答：采用 A。

## Q9 P1 forecast 是否只能辅助 rating，不能把低实销作品抬成高评级？

- 为什么现在必须问：forecast v1.1 conditional pass，但 rating v3 未通过；如果 forecast 直接覆盖 rating，会扩大业务不信任。
- 当前系统行为：v4 候选说明 forecast 只辅助，不覆盖真实账单实销档位。
- 用户反馈暴露的问题：评级合理率低，必须减少非实销信号对主评级的越权。
- 关联 PRD：M2 PRD 第 8、9、12 节。
- 关联报告：`M2-v1.1-conditional-baseline-freeze-decision.json`、`M2-v1.1-forecastability-after-dual-source-staging-v1.json`
- Codex 推荐答案：A。forecast 只作为说明和风险/机会辅助，不直接把低实销作品抬成高评级。
- 可选答案：
  - A：forecast 辅助，不覆盖实销主评级。
  - B：forecastable cohort 可直接提高评级。
  - C：forecast 完全不进入评级说明。
- 影响：A 平衡预测价值和业务可解释性；B 风险高；C 浪费 forecast 成果。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：部分可推迟，但 M2 需先定边界。
- 推荐用户如何回答：采用 A。

## Q10 P1 M2 是否确认删除自动运营建议主字段，仅保留风险/复核提示？

- 为什么现在必须问：PRD 包含 operating suggestions，但当前用户反馈使建议主输出被删除。需要确认这是 M2 收口边界，而不是临时遗漏。
- 当前系统行为：`M2-suggestion-removal-boundary-v1.json` 显示自动运营建议主字段已删除，保留风险/复核提示和 M4 校准候选。
- 用户反馈暴露的问题：建议不可执行时会削弱整个任务包可信度。
- 关联 PRD：M2 PRD 第 11 节。
- 关联代码：`suggestionCalibration.js`
- Codex 推荐答案：A。M2 删除自动运营建议主字段，只保留风险/复核提示；建议功能延后 M4 校准。
- 可选答案：
  - A：M2 删除建议主字段，M4 再恢复。
  - B：M2 保留建议，但全部标“仅供参考”。
  - C：M2 继续生成完整建议。
- 影响：A 最利于 M2 快速收口；B/C 需要重新验证建议准确性。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：是，建议主功能可推迟。
- 推荐用户如何回答：采用 A。

## Q11 P2 M4 校准案例池应自动纳入哪些样本？

- 为什么现在必须问：v3 系统建议 25 个样本进入 M4，但用户只标记 1 个，说明自动候选规则过宽。
- 当前系统行为：v4 候选继续保留 M4 标记，但还没有正式校准规则。
- 用户反馈暴露的问题：M4 候选需要更窄、更有解释性。
- 关联 PRD：scope.md 中 M4 为案例、规则、反馈、修复、重评和回滚。
- 关联报告：`M2-rating-standard-v3-operator-validation-summary-v1.json`
- Codex 推荐答案：A。只自动纳入用户明确不合理、规则变化影响评级、低置信状态、收入模式冲突四类；其余不自动纳入。
- 可选答案：
  - A：窄口径自动纳入。
  - B：所有被抽检样本都纳入。
  - C：只允许用户手工标记纳入。
- 影响：A 便于沉淀校准案例；B 噪声大；C 可能遗漏系统性问题。
- 是否影响 M2 收口：否，但影响后续 M4。
- 是否可推迟到 M4：可，但建议先定 M2 标记口径。
- 推荐用户如何回答：采用 A。

## Q12 P2 M2 收口应定义为 engineering/local complete，还是 formal complete？

- 为什么现在必须问：当前 formal readiness blocked，M3 not allowed；但本地工程候选已经较完整。
- 当前系统行为：README 和 AGENTS 均强调本地真实数据开发候选不是最终正式发布审批。
- 用户反馈暴露的问题：如果不区分收口类型，M2 与 M3 的边界会混乱。
- 关联 PRD：scope.md 要求正式投入使用前完成 M1-M6；M2 PRD phase split 区分 M2-A/B/C/D。
- 关联报告：`M2-v1.1-business-readiness-after-dual-source-staging-v1.json`
- Codex 推荐答案：A。M2 可以在用户确认上述业务规则后做 engineering/local closeout；formal complete 继续 blocked；M3 只能做 parallel planning，不能正式启动。
- 可选答案：
  - A：本地工程收口与 formal 收口分开。
  - B：必须 formal complete 后才允许任何 M3 规划。
  - C：当前直接允许 M3。
- 影响：A 最符合当前证据；B 会暂停规划；C 与现有阻断冲突。
- 是否影响 M2 收口：是。
- 是否可推迟到 M4：否。
- 推荐用户如何回答：采用 A。

