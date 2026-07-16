# M2 C3 模型设计 v1

C3 是 B4 锚定的有限修正路线，不重新定义预测对象，也不重做收入目标。A 学习 signed residual，B 使用两阶段 hurdle，C 学习 log1p offset；所有路线都保留 correction cap、shrinkage 和 B4 fallback。

最终路线规则在 outer replay 前固定：主路线为 C3-A；只有 C3-S 依靠严格更早 OOF 证据触发冻结激活规则时，才由 C3-S 条件替代。outer actual 和 outer 指标不得选择或缩放最终路线。

权威范围固定为 7851 个 formal-cash 模型人口 case、824 部作品。Gate D 全真之前禁止执行 outer replay；本设计不授权 release、holdout、C4 或 M3。
