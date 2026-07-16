# M2 C2 失败机会与设计审计 v1

本报告只比较完全一致的 development case、actual 和模型人口。B4 与 C2-R.1 的共同模型人口为 7851 个 case；审计不读取 final holdout，也不直接决定任何 outer origin 的候选。

## 结论

- 可继续探索的活跃度区域：["intermittent"]。
- 必须保留 B4 回退的区域：["dense", "dormant", "horizon_18", "top10_until_earlier_origin_guard_passes"]。
- 高价值保护：Top10 在 strictly-earlier 证据通过前一律回退 B4。
- 其他或新增渠道现金暴露存在：true；后续只允许通用残差组件，不预测真实渠道身份。
- 小样本或证据不足区域继续互补抑制，不用于事后移动分层或 gate。

## 边界

当前结果为 not_for_formal_decision。final holdout、embargo shadow 和 deferred 60-month labels 均未打开；未进入 C3，未 release。
