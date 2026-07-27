# M2 Channel Generative v0.2 core development

## 结论

最终状态为 `GENERATIVE_V02_CORE_EXECUTION_BLOCKED`。G0 在已有 frozen
primary/strict evaluation rows 上通过 semantic-equivalence；但在任何 G1/G2
拟合发生前，strict nested training 所需的早期 auxiliary G0 offset 与
horizon-specific frozen common reversal 没有被既有 frozen evaluation 保存。

不能用 primary 36 月 reversal 代替短 horizon、选择某个 horizon、取平均或重训
learnedGlobal/common reversal。故 raw G1、raw G2、G3、oracle 与全部 core gate
均未执行、不得推断为 pass 或 fail。

## 已验证边界

- 物化 58,986 条 primary packed rows、102,743 条 auxiliary packed rows，
  共 3,800,643 个唯一 monthly labels；重叠 horizon 未复制 monthly training row。
- positive/reversal/net 守恒差均为 0；没有未成熟标签补零，没有买断现金。
- G0 frozen primary WAPE/bias 为 0.44022495 / -0.12377106；strict 为
  0.41191878 / -0.03847401。
- G4、G5、G6、production、exact v0.3、holdout、provider、database、Canary
  与 release 均未打开。

首次运行只在 materialization manifest 计数阶段暴露明确内存实现 bug，未读取
frozen evaluation rows、未产生候选结果；receipt 已保留并标记
`INVALIDATED_BY_IMPLEMENTATION_BUG`。只修复 bounded counting 后经独立
commit/push/双平台 CI，再从新 receipt 完整重跑；第二次运行在上述来源合同缺口
处 fail closed。

当前证据只支持保留 frozen learnedGlobal/exact v0.3 作为既有 fallback；不支持
作品级自动化，也没有证明或推翻真实渠道业务机制理论，更没有证明预测在理论上
不可能。任何补充 frozen auxiliary G0 state/evaluation 的动作都需要用户重新授权。
