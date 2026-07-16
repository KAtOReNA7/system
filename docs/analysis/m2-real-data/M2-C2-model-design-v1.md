# M2 C2 模型设计 v1

C2 以 B4 为锚，冻结 dense、intermittent、dormant 三类 cutoff-only 活跃度路由。候选总数按分层分别为 37、37、5；选择顺序固定为偏差可行性、WAPE、高价值安全、horizon 安全和最小复杂度。

其他或新增渠道只使用 strictly-earlier origin 聚合证据形成通用组件，不记忆作品或未来渠道。Top1、Top5、Top10 按 cutoff 前 trailing-12 收入定义；高价值覆盖 B4 必须先通过冻结的 earlier-origin 稳定性条件，否则回退 B4。

产品、API、Excel 和正式导出仍只允许一个点值、年度拆分、confidence 和 limitation。80% 区间仅供内部 coverage、WIS 与宽度审计，不公开端点。

该设计继续保持 not_for_formal_decision；pure-buyout 无 cutoff commitment 时为 null abstain；未开始 C2 outer replay、C3 或 release。
