# M2 C2 活跃度分层与路由清单 v1

dense、intermittent、dormant 均由 cutoff 及以前的实销完整月历史判定，case 分布为 {"dense": 5174, "intermittent": 1844, "dormant": 833}。每个 case 保存 segmentReason；短历史或从未出现正实销证据时直接使用 B4。

分层阈值未按 outer 结果移动，当前生命周期、rating、risk、版权和货架状态均未作为历史预测特征。结果仅供 development 校准，继续 not_for_formal_decision。
