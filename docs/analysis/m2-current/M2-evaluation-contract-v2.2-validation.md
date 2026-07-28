# M2 评价合同 v2.2 验证

状态：`M2_EVALUATION_V2_2_BLOCKED_UNRESOLVED_REVERSAL`。

v2.2 的公共统计修正、冲销追溯实现、权威审计和冻结预测标签重评分已经完成并验证；但最终重述视图存在非零未分配冲销残差，未满足合同激活条件。因此 v2.2 不激活，不能写成全面通过，也不改变任何模型角色。

## 激活条件核验

| 条件 | 结果 | 说明 |
| --- | --- | --- |
| 冲销现金类型权威唯一 | 通过 | 人工复核账单成员关系是唯一现金类型权威；未用负号做机器分类 |
| 冲销 scope 唯一 | 通过 | `cashCategory + standardWorkId + channelMemberId + currencyScope`；不跨作品、canonical 渠道、币种或现金类型 |
| 原入账视图 | 通过 | 冻结历史 posting-time actual 原样保留 |
| 截止时点重述视图 | 通过 | 只使用截止时点可见的冲销 |
| 最终重述视图 | **阻断** | 未分配冲销残差为 `-267.769000000000330000` 权威货币单位 |
| 未分配冲销残差为 0 | **不通过** | 精确整数残差为 `-267769000000000330000`，尺度为 10^18 |
| 整数现金守恒差为 0 | 通过 | 精确整数守恒差为 `0` |
| 无未来泄漏 | 通过 | 未发现未来冲销进入 origin 特征；origin 截止后使用行数为 0 |
| 2,000 次完整排序 bootstrap | 通过 | 每次重采样完整作品 cluster，并在 cell 内重算 rank、Spearman、Kendall tau-b 与 top capture |
| 时间独立性声明真实 | 通过 | 独立时间块不足时返回准确缺失状态，没有伪造时间置信区间 |
| conditional amount / reversal | 通过 | 有对应冻结输出时实际评分；无输出时返回精确 `NOT_COMPUTABLE_*` 状态 |
| PR-AUC 语义 | 通过 | 梯形 PR-AUC 与 Average Precision 分开计算和报告 |
| top revenue 语义 | 通过 | 正收入、绝对现金规模、冲销规模分开，全部仅作后验归因 |
| 冻结预测不可变 | 通过 | 读取 716,801 行，生成与修改预测行数均为 0 |
| 重复执行确定性 | 通过 | 两次完整执行比较 7 个输出文件，逐字节一致 |
| 公共隐私 | 通过 | 公共 artifact 仅含聚合，无行级身份和私有路径 |
| Linux / Windows CI | 运行时核验 | 精确 HEAD 由每次 CI 的 `Verify exact event head` 证明，不把活动提交 SHA 固化进合同或状态文档 |

K3A 公共统计修正的双平台 CI run `30333013207` 已成功；K3B 冲销重述与冻结标签重评分的双平台 CI run `30337283094` 已成功。K3C 最终提交的 exact-head CI 以 GitHub 实时状态为准，不预写尚未发生的结果。

## 重评分边界

本轮只对既有冻结预测替换评价标签：

- 模型执行、训练、拟合、调参、选择均为 0；
- 预测生成和预测修改均为 0；
- production 变更为 0；
- 受未解决残差影响的 scope 不进入完整标签成绩；
- 组合 30 个 cell 没有完整权威 case，因此不发布部分组合成绩；
- 原入账 actual 与冲销重述 actual 使用不同 `comparabilityGroupId`，差异只能解释为 actual definition 影响，不能跨定义评选赢家；
- v2.1 及历史 raw failure 均未覆盖。

## 模型与发布状态

- 作品现行运行回退模型仍为 `M2-WORK-OA03`；
- 作品研究比较基线仍为 `M2-WORK-LG01`；
- 组合级参考仍为 `M2-PORT-ETS01`；
- `activeCandidate=null`；
- `approvedForAutomation=null`；
- production、later-origin、final holdout、Canary/full160、release 和 M3 formal 继续关闭。

结论：v2.2 已实现、已验证到可验证范围，但**未授权激活，也不可发布为生产或自动化评价门禁**。阻断原因是非零未分配冲销残差，不是模型失败或新模型选择结果。
