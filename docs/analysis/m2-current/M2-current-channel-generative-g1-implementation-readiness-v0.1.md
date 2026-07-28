# 渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心：K5 实现就绪

## 结论

`M2-CHAN-GEN02` 的实验臂
`M2-EXP-CHANNEL-GENERATIVE-02/G1` 已完成独立核心所需的实现与公共合成验证。
当前状态为
`G1_IMPLEMENTATION_READY_FOR_AUTHORIZED_PRIVATE_DEVELOPMENT_EVALUATION`。
这不是模型结果：K5 没有读取候选结果、没有训练 private 数据、没有生成 private
预测，也没有进行 private development evaluation。

## 前置条件已经按实验臂拆分

独立核心的训练和 inner selection 只依赖 forecast origin 可见的作品—渠道现金
特征、在相应外层起点前已经成熟可得的 v2.2 开发可建模月度标签，以及自己的 inner
validation WAPE。它不读取冻结 learnedGlobal 的渠道值作为 feature、offset 或
multiplier，也不需要 strict auxiliary G0 state。

冻结 G0 只在 raw 独立核心外层预测已经存在后，作为相同
`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01` 实际值定义、相同 case 的配对
比较基线。缺少结构化偏置或混合臂所需的辅助 offset 不再阻断独立核心。

## 标签与时间可得性

private 物化的原入账标签继续原样保留；运行器只在内存中把候选训练/评价标签绑定到
`DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW`。成功分配的冲销从对应作品—渠道—月份
标签中扣除，无法归属的 residual 不会分配给任何月度标签。若冲销晚于收入月份才被
记录，标签的 `labelAvailableAsOf` 延后到该冲销的记录月份；严格时间训练只允许
`labelAvailableAsOf < outerOrigin`，未来冲销不会回流到更早起点。

## 已实现的冻结形式

- 月度发生：确定性的 L2 logistic，金额点预测直接使用概率，不使用 0.5 阈值。
- 条件金额：只在正金额月份拟合 `log1p(cash)` L2 ridge；smearing 只从当前训练
  partition 估计。
- 网格：occurrence L2 与 conditional amount L2 均为 `[1, 10, 100]`，共 9 组。
- 选择：只在各 outer training 内做 nested selection；outer outcome 不参与。
- future-first-seen 渠道继续预测 0，并在最终报告中单列不可达现金。
- 无支持或数值失败时 raw 独立核心 fail closed，不用冻结 G0、fallback 或 blend
  覆盖 raw 结果。

## 合成与泄漏验证

公共 synthetic fixture 共 6,696 条唯一月度行、180 个作品。验证覆盖三个冻结变现
机制、重叠 horizon 不重复计权、训练分区标准化、smearing、确定性、数值失败、
future-first-seen、严格标签可得性和 public/private 边界。改变或移除 G0 字段不会
改变独立核心的拟合与预测；本检查点执行候选仅为 raw G1，其它实验臂均未执行。

五项只读诊断已实现：
`ORACLE_OCCURRENCE_ONLY`、`ORACLE_AMOUNT_ONLY`、`ORACLE_BOTH`、
`FUTURE_FIRST_ENTRY_CEILING`、`MECHANISM_INFORMATION_GAIN`。运行器强制它们只能
在 raw G1 输出冻结后执行，并且不参与训练、选择、门禁或路由。

## 下一门禁

只有 K5 普通提交推送后的 exact-head Linux 与 Windows CI 全部成功，才允许执行
一次 K6 private development 训练与评价。结构化偏置、混合、平台、taxonomy、
composition、production、provider、数据库、later-origin、final holdout、
Canary/full160、release 和 M3 formal 仍保持关闭。
