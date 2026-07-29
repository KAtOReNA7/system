# 出版行业适配的渠道月度发生—条件金额核心：可预测性与 oracle 诊断

- 英文原名：Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core
- 稳定模型 ID：`M2-CHAN-PSC01`
- 所属实验臂：出版行业规模适配渠道核心实验的核心臂（`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`）
- 机器结论：原始候选完成评价但未达到冻结门或出现实质伤害
  （`M2_PUBLISHING_SCALE_CORE_FAIL`）

这些 retrospective oracle 只在原始候选输出冻结后运行，不参与训练、参数选择、
路由或晋级门，也不能证明 Bayes error、理论上限或“无法预测”。

| 诊断 | 主评价最多可移除绝对误差 | 严格滚动最多可移除绝对误差 |
|---|---:|---:|
| 真实发生替换（`ORACLE_OCCURRENCE_ONLY`） | 874261.26350915 | 2631667.92200416 |
| 真实条件金额替换（`ORACLE_AMOUNT_ONLY`） | 325185835.39492702 | 366379653.10524577 |
| 发生与金额同时替换（`ORACLE_BOTH`） | 416029696.40677136 | 458012200.67225587 |
| future-first 新渠道上限（`FUTURE_FIRST_ENTRY_CEILING`） | 47230846.92719561 | 26425839.94334412 |

主评价和严格滚动中，origin 时尚未观察到的新渠道正现金占比分别为
11.4801% 与
7.4178%。机制时间 basis 相对全局父层
的绝对误差增益分别为
21890728.99398452
与 25424959.23558229。

这些数值用于判断下一步证据应优先补发生、条件金额、新渠道进入、机制时间结构，
还是停止 cash-only 路线；它们不参与本轮模型选拔，也不授权任何后续实验。
