# M2 C2-R.1 设计 v1

## 冻结结论

C2-R.1 在任何 private case 或权威输入读取前冻结了 45 个透明候选。纯实销与买断+实销均逐渠道预测后严格求和；纯买断无 cutoff 承诺和缺少明确实销证据的 unknown route 均输出 null，不用 0 代替。

候选只使用零保留 trailing/seasonal/zero-aware/robust/trend/recency 组件与 formal B0b/B1/B3/B4。禁止 positive-only median、未来买断周期、买断概率、已到账买断摊销和事后 outer 缩放。每个 outer origin×route 只用 earlier origins，通过 bias feasibility 后才计算冻结的多目标分数；无可行候选时回退 B4，不移动阈值。

本设计保持 `not_for_formal_decision`，不授权 final holdout、release、C2/C3 或 M3。
