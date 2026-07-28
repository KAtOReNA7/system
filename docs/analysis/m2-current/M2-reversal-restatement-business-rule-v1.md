# M2 分成收入冲销追溯重述业务规则 v1

状态：公共语义已实现；private authority、现金守恒和冻结标签重评分必须通过后，才能
作为开发评价 actual。

机器权威为 `config/m2-reversal-restatement.v1.json`，actual definition stable ID
为 `M2-ACTUAL-REVERSAL-RESTATEMENT-01`。中文名为“分成收入冲销追溯重述 v1”，
英文名为 “Sales-Share Revenue Reversal Restatement v1”。

## 1. 业务含义

财务冲销是在后续月份发现过去提前确认的错误收入后，以负数金额进行追溯取消。它
不是冲销入账月份独立产生的新负收入。

每笔冲销从发生月开始，逐月向过去消耗同一经济作用域仍未被冲销的正分成收入：

1. 当月余额足够时，只减少当月余额；
2. 当月余额恰好抵消时，当月余额归零；
3. 当月余额不足时，当月归零，剩余金额继续向前一个月追溯；
4. 第一个未被完全抵消的月份保留调整后的正数，更早月份不变；
5. 到达权威历史边界后仍有剩余时，保留带负号的
   `unresolvedReversalResidual`，不得伪造为已完成。

同月正收入先在同一 scope 内聚合。多笔冲销按入账月份、可用时间、权威记录 ID
稳定排序；后发生的冲销只能使用前序冲销后仍剩余的 balance。

## 2. 作用域

`reversalScopeKey` 至少包含：

- 现金类型，且必须为分成收入；
- 标准作品；
- 权威渠道成员；
- 权威币种字段，或经证明的单一账本货币单位。

合同、statement 或结算主体字段在权威来源存在时继续加入 scope。禁止跨作品、跨
渠道、跨币种、跨现金类型追溯，也禁止因字段缺失退化为公司总额。

负数符号本身不是冲销分类权威。只有人工分账成员关系和用户确认的负数事件政策同时
通过时，分成账单负数才进入冲销算法；其他负数事件不会误入 allocation。

## 3. 整数现金

现金计算不使用浮点累加。private adapter 从权威金额文本推导能够无损往返的最大
小数位数，将每笔金额转换为整数最小货币单位。若任何金额不能无损转换，立即阻断。

每个 scope、评价时间范围及全局必须精确满足：

```text
正分成收入 + 带负号冲销
= 重述后非负收入 + 带负号未分配残差
```

守恒差只能是整数最小货币单位下的 `0`。

## 4. 三种时间视图

### 4.1 原入账视图

`posting_time_actual` 保留正收入和冲销的财务入账月份，用于审计、原始现金守恒和
冲销事件评价。

### 4.2 截至当时可知的重述视图

`restated_actual_as_of(cutoff)` 只读取入账可用时间不晚于 cutoff 的事件。forecast
origin 的历史只能使用 origin cutoff 的视图；之后出现的冲销不得倒灌。

### 4.3 最终财务重述视图

`final_restated_actual` 只读取不晚于该冻结案例 label maturity cutoff 的事件，用于
重述后的经济标签。它必须记录 cutoff 和数据 as-of，不能冒充 origin 当时已知信息。

缺少可证明的入账时间字段时，返回安全阻断，不用 current-state 记录回填历史。

## 5. 可审计输出与隐私

private 输出保存逐笔 allocation、scope reconciliation、冻结标签重评分行和执行
回执，全部位于 capability-scoped Git ignored 目录。公共文件只能包含满足隐私阈值
的聚合金额、数量、追溯深度和状态；不得出现作品、渠道、账单成员、行级 actual、
行级 prediction 或 private path。

本规则只变换 actual 标签，不运行、训练、拟合、调参、选择或晋升模型，也不生成或
修改冻结预测。
