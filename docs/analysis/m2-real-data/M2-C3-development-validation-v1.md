# M2 C3 Development Replay 验证 v1

C3 已在固定的 18615 个 development case、12223 个 statistically scoreable case 和 7851 个 formal-cash 模型人口 case（824 部作品）上执行。最终模型为 C3-A；总体 WAPE 为 0.55394517，signed bias 为 +0.08273913。

模型人口中 B4 保持不变 4786 个 case，发生有限修正 3065 个 case，fallback 4774 个 case。C3-S 状态为 skipped。

模型质量结论为 FAIL，业务覆盖结论为 CONDITIONAL，组合结论为 MODEL_FAIL_BUSINESS_COVERAGE_CONDITIONAL。结果仍为 `not_for_formal_decision`；final holdout、embargo shadow 和 deferred 60-month labels 均未打开，未进入 C4、M3 或 release。
