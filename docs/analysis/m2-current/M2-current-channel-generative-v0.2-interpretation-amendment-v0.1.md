# M2 Channel Generative v0.2 科学解释边界修订 v0.1

日期：2026-07-27

检查点：K0

状态：

```text
GENERATIVE_V02_INTERPRETATION_BOUNDARY_AMENDED_NO_OUTCOME_READ
```

## 1. 修订范围

本修订在读取任何新 v0.2 outcome 前完成，只修正科学结论边界，不改变已经冻结的
候选、方程、feature allowlist/denylist、有限参数网格、time basis、seed、
inner/outer split、gate 或 phase stop。

绑定的预注册为：

```text
docs/analysis/m2-current/M2-current-channel-generative-v0.2-preregistration.json
sha256=ba8be0e03102b5d07957a6a078e2e8113b78ccd8632f3589b4d41f5a66b15a50
gitBlob=1321bf4011179f7f36e7b26ee806f7a46a2cc909
```

截至本修订：

```text
v02OutcomeRead=false
trainingExecuted=false
predictionExecuted=false
privateEvaluationRowsRead=false
productionSurfaceChangeCount=0
```

## 2. v0.1 与 v0.2 的证据边界

v0.1 失败只证明 scalar multiplier 架构失配。它没有直接检验独立的
mechanism-specific monthly channel generator。

G1/G2 是当前谱系中第一次直接检验该命题：

- G1 不使用 learnedGlobal feature 或 offset，独立生成 monthly occurrence 与
  conditional positive amount；
- G2 单独生成 occurrence，并只把 frozen learnedGlobal monthly positive
  component 作为 conditional-amount 的 log-space structured offset。

如果 G1/G2 通过，只能说明预注册的低复杂度现金历史路线在受控 development
窗口中存在增量信号，不能证明真实会员池、广告流量、订单、净价、合同或因果机制
已经被识别。

如果 G1/G2 失败，只允许支持：

```text
CURRENT_CASH_HISTORY_LOW_COMPLEXITY_GENERATIVE_CORE_NO_INCREMENTAL_VALUE
```

其精确定义是：

> 在当前 origin-visible 历史现金、冻结静态机制映射、当前 case window 和
> preregistered deterministic low-complexity GLM 家族内，没有稳定增量。

不得扩展为：

```text
FORECASTING_IS_THEORETICALLY_IMPOSSIBLE
```

也不得声称已测得 irreducible error、Bayes error 或 theoretical maximum。

## 3. 证据独立性

当前 primary/strict development window 已被多个历史候选反复分析。本轮仍是
严格受控的 reused-development-window evidence，不是全新 independent
holdout。

提高外推置信度只能依赖：

1. 真正独立且标签成熟的 later-origin；或
2. 具有 historical `availableAt`、来源版本和 lineage 的真实驱动数据。

本轮不打开 later-origin 或 final holdout。

## 4. 人工估算法的三个不同命题

### A. 人工主干是否是有效 baseline anchor

证据只包括：

- G0 在相同 case/fold 上的表现；
- G2 相对 G1；
- G2 dynamic residual 是否稳定向 0 收缩；
- G2 是否在不伤害 horizon 与 top-revenue 的情况下优于 G0。

解释固定为：

| 结果 | 允许解释 |
|---|---|
| G2 通过、G1 失败 | 人工主干作为 structured prior/offset 有 development 价值 |
| G1 通过、G2 失败 | 人工主干可能限制渠道时间过程 |
| G1/G2 都通过 | 两条低复杂度路线都有 development 信号 |
| G1/G2 都失败 | 人工主干可保留为稳定 fallback；不能声称机制理论错误 |

### B. 人工公式是否达到作品级自动化质量

只按现有绝对门禁、primary、strict、时间块、top-revenue、bias 和 paired
uncertainty 判断。selected fallback、组合层误差抵消或同窗 overlap 改善均不能
替代作品级证据。

### C. 人工业务机制是否真实

当前没有历史会员池、曝光、播放、订单、净价、渠道可售状态、合同状态或运营动作。
因此本轮只能检验 cash-history pattern，不能识别真实因果机制。

## 5. 状态解释

| 条件 | 状态 |
|---|---|
| G1 至少通过全部 raw core gate | `GENERATIVE_V02_G1_CORE_PASS` |
| G1 失败且 G2 通过全部 raw core gate | `GENERATIVE_V02_G2_CORE_PASS` |
| G1/G2 都通过 | `GENERATIVE_V02_BOTH_RAW_CORE_PASS` |
| G1/G2 都失败 | `GENERATIVE_V02_CORE_FAIL` 与允许的低复杂度结论 |
| raw 失败但 blend-only 通过 | `RAW_CORE_FAIL_BLEND_ONLY_SIGNAL`，仍停止 |
| 合同或数值阻断 | `GENERATIVE_V02_CORE_EXECUTION_BLOCKED` |

无论任何结果，本轮都在 G3 后停止。

## 6. 授权边界

本轮已授权：

- G0 semantic-equivalence；
- G1、G2、G3 实现与 synthetic 验证；
- K0/K1 exact-head CI 成功后的一次性 private development evaluation；
- 不参与训练、选模、gate 或 routing 的 forecastability/oracle diagnostic。

仍未授权：

- G4 platform；
- G5 taxonomy；
- G6 composition；
- 新模型家族或 outcome 后调参；
- later-origin/final holdout；
- provider、数据库、Canary、full160、automation、release；
- production loader/route/API；
- exact v0.3 替换；
- 合并 PR #28。

K1 只有在本修订与 oracle diagnostic contract 形成普通 K0 commit、push，且
exact-head Linux/Windows CI 全部成功后才可开始。K0 不读取 private outcome。

最终边界：

```text
safeToStartPlatform=false
safeToStartTaxonomy=false
safeToStartComposition=false
```
