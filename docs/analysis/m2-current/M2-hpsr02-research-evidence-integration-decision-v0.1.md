# M2 HPSR02 研究实现与冻结证据集成决策 v0.1

## 决策

本记录授权把 LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected
Tail-Band Correction Model v0.2，`M2-WORK-HPSR02`）的研究实现与已冻结证据，
通过保留完整提交轨迹的 merge commit 集成进 `main`。这是结果冻结后的独立 Git
集成授权（`AUTHORIZED_FOR_GIT_INTEGRATION_ONLY`），不是模型激活、production、
automation、release、final holdout 或财务使用授权。

## 冻结时点与集成时点

- 唯一一次 2026-03 起点独立评价形成和冻结时，PR #36 必须保持
  Draft / Open / Unmerged；该约束保证结果形成过程不被提前集成，不是冻结结果完成后
  永久禁止 Git 合并。
- 冻结结果形成后，用户另行授权只做 Git 集成。集成不得重新运行模型、评价或
  bootstrap，也不得形成第二个起点或后继模型。
- 冻结结果保持不变：冻结 LG01 同案例基线 WAPE 为 64.4488%，HPSR02 WAPE 为
  64.1150%，relative FVA 为 0.5179%，2,000 次作品 cluster bootstrap 95% 区间为
  `[-2.4406%, 3.8718%]`；最终科学状态仍为证据不足并结束现金-only 相邻研究
  （`M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED`）。

## 不可改写边界

本次集成不改写冻结评价 JSON、private 预测、指标、bootstrap、digest、历史阻断、
不可变参数或参数谱系。历史报告中关于结果形成时 PR 状态的记录继续作为当时事实保留。

集成后模型治理状态仍为：

| 治理字段 | 冻结值 |
|---|---|
| 活动候选（`activeCandidate`） | `null` |
| 自动化批准（`approvedForAutomation`） | `null` |
| 生产就绪（`productionReady`） | `false` |
| 前瞻最终留出已打开（`finalHoldoutOpened`） | `false` |
| 第二独立起点 | 未启动（`NOT_EXECUTED`） |
| 后继现金模型 HPSR03 | 未启动（`NOT_EXECUTED`） |
