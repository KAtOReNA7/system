# M2 C2-R.1 买断承诺 as-of 审计 v1

- 状态：`not_for_formal_decision`
- 当前可审计 cutoff commitment：0
- 结论：现有权威输入不能证明后来买断在历史 cutoff 时已承诺

当前 3053 部作品、192872 条收入事实及校准 replay adapter 均没有独立的 `cash_commitment_snapshots` 数据角色，也没有承诺身份、未结应收状态、确认金额、未结金额、预计入账月、确认时间、证据可得时间和证据引用的完整 as-of 契约；逐账单事实 registry 与承诺 settlement link 角色同样不存在。

因此，历史 cutoff 之后识别到的买断不得事后恢复为“已承诺”。本次诊断识别到 466 个正 surprise case window，重叠 case-window 金额为 5517115.15，占 total ledger cash 的 6.2892%。这些只是 classifier-derived 诊断，不是合同已确认事实。

未来若要纳入已确认应收，必须另行提供经过授权、可审计的 as-of commitment snapshot、逐账单事实 registry 与 settlement link 角色；不得从后来账单、business form 或分类器结果反推。上述 surprise 不进入主要模型指标和 gate，但形成 6.2892% 的端到端业务 surprise gap，并使无承诺纯买断保持 route abstention。
