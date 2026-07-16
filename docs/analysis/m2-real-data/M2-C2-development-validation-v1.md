# M2 C2 development 验证 v1

C2 已在冻结的 18615 个 development case、12223 个 statistically scoreable case 和 7851 个 formal-cash 模型人口 case 上执行。总体 WAPE 为 0.55695480，signed aggregate bias 为 +0.09289130。

货币 reconciliation 已改为 Decimal 量化到 0.01 元后按整数分精确相等。原始浮点最大差异 0.0000001100 元保留为诊断，整数分差异为 0；因此 25 项通过数由 15 修正为 16。仅该数值表示门槛变化，模型预测和指标不变。

模型质量判定仍为 FAIL；业务覆盖判定为 CONDITIONAL；总判定为 MODEL_FAIL_BUSINESS_COVERAGE_CONDITIONAL。所有选择只使用 strictly-earlier origin，B4 始终为锚，高价值证据不足时强制回退 B4。

pure-buyout 无 cutoff commitment 时继续 null abstain；mixed 只预测实销和 cutoff 已确认应收。通用其他或新增渠道残差不预测真实渠道身份，也不重复已知渠道现金。

结果继续为 not_for_formal_decision。final holdout、embargo shadow 和 deferred 60-month labels 均未打开；未进入 C3，未 release，未进入 M3。
