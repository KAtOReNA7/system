# M2 当前状态索引 v0.45

截至 2026-07-30，核心老品分周期金额模型恢复任务已完成首个完整结果边界治理和
正式链路 R0 合成冒烟，但尚未执行真实私有开发。因此当前仍没有新的 3、6、12 月
模型成绩。

## 当前结论

| 对象 | 当前状态 | 中文解释 |
|---|---|---|
| 恢复执行权威 | `RECOVERY_AUTHORIZED_UNTIL_FIRST_VALID_COMPLETE_OUTCOME` | 固定重试次数不再阻断本次恢复；首个完整有效私有结果形成后立即停止 |
| 冻结科学合同 | `UNCHANGED` | B0–B3、公式、特征、窗口、网格、fold、权重、人口、实际值、基线、指标和门禁均未变化 |
| 正式链路 R0 | `R0_FORMAL_CHAIN_SYNTHETIC_SMOKE_VERIFIED` | 同入口、同能力隔离、共享 Python 物化、拟合、评价、序列化和收据闭合均通过 |
| 私有源读取 | `NOT_PERFORMED_IN_R0` | R0 只使用合成 fixture |
| 真实私有训练与评价 | `NOT_EXECUTED_AWAITING_PUBLIC_GATES_AND_CI` | 3、6、12 月均无新真实结果 |
| 活动候选 | `null` | 未晋升任何模型 |
| 自动化批准 | `null` | 未授权自动化 |
| 现行运行回退 | `M2-WORK-OA03` | 兼容性运行回退未改变 |

## 已实现、已验证、已授权、可发布

| 层次 | 状态 | 说明 |
|---|---|---|
| 已实现 | 是 | 恢复边界、失败分类与进度收据、同正式入口的 R0 冒烟已实现 |
| 已验证 | R0 本地通过 | 27 个伪起点、B0–B3、3/6/12 月、Core80/Core90、预测/评价/bootstrap/manifest/receipt 全部闭合 |
| 已授权 | 有条件继续 | 公共门禁与 exact-head Linux/Windows CI 通过后，可继续能力盘点与私有恢复 |
| 可发布 | 否 | 没有活动候选、生产、自动化、release 或 M3 formal 权限 |

## 历史执行关闭记录

`M2-core-legacy-horizon-amount-execution-closure-v0.1` 继续不可变地记录此前两次
基础设施失败。它仍是历史事实，但“固定重试次数耗尽”不再是本次用户恢复指令的
当前执行权威。历史文件没有被改写、删除或重新解释为模型成绩。

## R0 证据

R0 复用了正式私有命令入口和能力 ID，运行共享 Python materializer，并完成：

- 冻结人工锚定可学习全局研究比较基线 / B0 的合成重建；
- 等作品权重 / B1、起点收入秩权重 / B2、冻结 LG01 输入 / B3 的合成拟合；
- 3、6、12 月独立预测及 Core80/Core90 评价；
- 预测、评价、bootstrap、manifest、receipt 和公开聚合的临时序列化；
- 零收入与负冲销边界覆盖；
- 能力目录内临时输出的精确清理。

合成链路结果只用于工程恢复验证，不进入模型排行榜，不改变现行模型角色。

## 当前模型角色

- 兼容性现行运行回退：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- Core 老品 3/6/12 月研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 恢复就绪、尚无真实结果的开发模型：核心老品分周期金额模型 v0.1
  （Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）。
- 当前恢复实验：核心老品分周期金额模型开发 v0.1
  （`M2-EXP-CORE-HORIZON-AMOUNT-01`）。
- 活动候选与自动化批准：均为空。

## 下一步与停止条件

先完成完整公共基线，再提交、推送并核验精确提交的 Linux/Windows CI。随后运行
能力 doctor 和私有源前检；若只是完整结果前的基础设施失败，则修复、补正式链路
回归并重新通过同样门禁。若发现源权威、泄漏、科学合同变化、授权撤回，或首个完整
结果已经形成，则立即停止。

## 当前证据

- `config/m2-current-core-legacy-horizon-amount-recovery.v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-recovery-readiness-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-recovery-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-execution-closure-v0.1.json`
- `config/m2-model-registry.v1.json`

本索引取代 v0.44 作为当前阅读入口，但不改写 v0.44 或任何历史成绩、收据、schema、
digest 与执行记录。

## Public / Private 与授权边界

- Git 只包含代码、合同、测试与脱敏聚合状态，不包含私有行、身份、金额、路径、
  transport hash、缓存或收据。
- private source、derived cache 与 run provenance 继续留在 Git ignored 能力目录。
- 未授权渠道分配、taxonomy、36 个月、新作品、新渠道、later-origin、final
  holdout、Canary/full160、production、release、M3 formal 或 PR 合并。
