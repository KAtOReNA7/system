# 渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心：可预测性诊断

## 状态

渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心
（Channel Generative v0.2 — Independent Monthly Occurrence × Conditional
Amount Core，`M2-CHAN-GEN02`，`M2-EXP-CHANNEL-GENERATIVE-02/G1`）在产生候选
输出前被预注册的交易型机制父节点资格门槛阻断，最终状态为
`M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED`。

## 为什么没有 oracle 结果

预注册要求候选输出先冻结，再执行只读诊断。本次没有形成任何外层候选预测或评价行，
因此以下诊断全部保持未执行：

- 真实发生替换诊断（`ORACLE_OCCURRENCE_ONLY`）；
- 真实金额替换诊断（`ORACLE_AMOUNT_ONLY`）；
- 双重真实值聚合校验（`ORACLE_BOTH`）；
- 新渠道进入上限（`FUTURE_FIRST_ENTRY_CEILING`）；
- 机制时间 basis 信息增益（`MECHANISM_INFORMATION_GAIN`）。

不得从“未执行”推断 occurrence 或 conditional amount 谁是主要误差来源，也不得
声称测得 Bayes error、理论上限或预测不可能。

## 已知的前置缺口

主集第 1 个外层折的 5 个内层训练折中，交易型机制父节点只有 25–32 个独立作品，
低于预注册门槛 50。会员型与广告型父节点合格；交易型的训练行数和正月份也合格，
唯一触发项是独立作品支持不足。

若未来另行授权，优先证据应是更多交易型作品和真正机制驱动、origin 可见的数据，
包括平台在架/上下架、播放或阅读消费、会员池、曝光与 eCPM、订单与退款、合同
有效期及运营动作。本报告不授权降低门槛、重跑、执行后续实验臂或进入生产。
