# M2 Channel Generative v0.2 forecastability diagnostic

候选输出没有冻结完成，因此按 K0 contract，本诊断未执行。不能在缺少 raw G1/G2
输出时使用未来 truth 构造 ORACLE_ENTRY 或 ORACLE_OCCURRENCE，也不能让 oracle
绕过 strict G0 semantic blocker。

状态为 `NOT_EXECUTED_CONTRACT_SEMANTIC_BLOCKER`。这不表示测得不可约误差、Bayes
error 或理论 ceiling，也不表示预测不可能；更不能授权 G4–G6。
