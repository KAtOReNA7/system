# M2 current 自动评价与 two-part development 复验 v0.4

> 历史检查点：当前正式目标已于 2026-07-25 改为纯分成收入。当前入口为
> `M2-v2-current-state-index-v0.12.md`。

日期：2026-07-24
状态：`CANDIDATE_DEVELOPMENT_PARTIAL_BLOCKED`
用途：冻结 development 诊断；不是 final holdout、Canary 或 release 结论

## 结论先行

本轮取消了人工预估书单和人工/机器数值竞赛。旧 120 部样本不再是 current
配置、runner、loader、readiness 或验收依赖；其 JSON 只保留历史审计用途。
人工的唯一当前角色是自动技术门禁之后的 post-gate quality assurance。

`M2-current-occurrence-amount-calibration-v0.3` 在严格 rolling-origin、
同人口 development 回测中相对 v0.2 有 1.0913% WAPE 改善，paired work×origin
95% CI 不穿零；但绝对 WAPE 仍为 0.5056，远高于 0.30 development 门槛，
intermittent 和 dormant segment 仍明显不可用。因此本轮证明的是“受约束
two-part 方向有小幅增量信号”，不是“模型已能替代人工”。

## 用户决策如何落地

1. 删除 current core 中的 120 部抽样生成器。
2. `config/m2-current.v0.3.json` 明确：
   - `humanNumericBaselineRequired=false`
   - `businessSampleRequired=false`
   - `humanRole=post_gate_quality_assurance_only`
3. 无 cutoff 承诺的 pure-buyout 在 route policy 中返回 `null abstain`：
   - 不返回 0；
   - 不使用 `buyoutMonthlyEquivalent`；
   - 不进入机器或人工数值预估；
   - 只有已签署、确认、可审计且在 cutoff 前已知的 commitment 才可按未结金额进入。
4. `buyout_plus_sales` 在没有 commitment 时只预测 sales cash，不猜测未来买断。

## 自动评价合同

同一冻结人口包含 824 部作品、7,851 个 formal-cash case、5 个 origin 和
3/6/12/18/24 月 horizon。所有候选选择只读取 outer origin 之前且标签已成熟的
development case。

强制 comparator：

- zero
- seasonal naive
- SBA
- TSB
- ADIDA
- B4
- v0.2
- v0.3

强制报告：

- WAPE 与 signed bias
- MASE 与 RMSSE
- occurrence rate/Brier 与 positive-amount WAPE
- horizon、segment、route
- eligibility、cash observability、served coverage、abstention

MASE/RMSSE 在本仓库短、稀疏、异质序列上的数值很大，因此只作为诊断，不替代
现金加权 WAPE，也不能单独决定 release。

## v0.3 方法

v0.3 以 exact v0.2 point forecast 为 base，将现金拆为：

\[
E(Y) = P(Y > 0) \times E(Y \mid Y > 0)
\]

对 dense/intermittent，每个 outer origin 只使用严格更早成熟 case：

1. 以 Beta shrinkage 估计 occurrence probability；
2. 估计正金额相对 base forecast 的 conditional scale；
3. 将二者组合成受限 factor；
4. 只有样本数至少 80、training WAPE 相对 base 至少改善 1%，且 signed bias
   不超过 0.15 时才启用；
5. 否则回退 exact v0.2。

dormant 没有新增可识别 as-of 信号，继续回退 v0.2，并保留其失败指标，不通过
删除困难 case 美化总体结果。

## 冻结 development 结果

| 模型 | WAPE | signed bias |
|---|---:|---:|
| B4 | 0.55648454 | 0.08910997 |
| v0.2 | 0.51114966 | -0.00586227 |
| v0.3 | 0.50557140 | -0.01198958 |

| 比较 | relative WAPE | paired 95% CI |
|---|---:|---:|
| v0.3 vs v0.2 | -1.0913% | [-3.7146%, -0.0152%] |
| v0.3 vs B4 | -9.1491% | [-16.7095%, -3.2281%] |

v0.3 分 horizon：

| horizon | WAPE | signed bias |
|---|---:|---:|
| 3 | 0.42753233 | -0.04217977 |
| 6 | 0.44567024 | -0.08724698 |
| 12 | 0.43856557 | -0.02348523 |
| 18 | 0.54602120 | 0.07125145 |
| 24 | 0.74355858 | 0.01617873 |

v0.3 分 segment：

| segment | WAPE | signed bias | 结论 |
|---|---:|---:|---|
| dense | 0.46372935 | 0.02439915 | 仍未达到绝对门槛 |
| intermittent | 0.90732841 | -0.15945405 | 严重失效 |
| dormant | 1.00018361 | -0.99972006 | 基本无法预测 reactivation |

简单基线 WAPE：

| baseline | WAPE |
|---|---:|
| zero | 1.00000000 |
| seasonal naive | 1.00887339 |
| SBA | 1.00878923 |
| TSB | 1.14457798 |
| ADIDA | 1.04419282 |

这些基线明显弱于 B4/current candidate，但仍必须保留。它们证明 improvement
不是通过打败一个随意选择的弱 comparator 得到，也为未来数据和代码漂移提供
sanity floor。

## 为什么模型仍不可用

1. **总体指标被 dense cash 主导。** overall bias 接近零不能抵消 intermittent
   与 dormant 的严重 segment 失效。
2. **dormant reactivation 缺少可识别 as-of signal。** v0.3 不伪造信号，也不读取
   当前 shelf/rights 状态回填历史 origin，因此只能保留失败。
3. **现金可观察性不足。** 全库/Top10 现金覆盖约为 73.96%/75.94%，均低于 90%。
4. **长 horizon 明显恶化。** 24 月 WAPE 达 0.7436，不能用短 horizon 平均掩盖。
5. **scaled error 很不稳定。** 很多作品的 seasonal/naive in-sample scale 很小，
   使 MASE/RMSSE 极大；必须与 WAPE、coverage 和 segment 指标联合解释。
6. **development improvement 很小。** v0.3 相对 v0.2 的 CI 上界仅略低于 0，
   不能外推为 holdout 或生产优势。

## 理论与成熟行业映射

- Hyndman 与 Koehler 提出 MASE，支持跨序列 scaled error，但本项目保留 WAPE、
  bias 与 coverage，避免单指标治理：
  [Another look at measures of forecast accuracy](https://doi.org/10.1016/j.ijforecast.2006.03.001)。
- TSB 将 occurrence probability 与 positive size 分开并在零需求期更新概率，
  对应本轮 two-part 设计：
  [Intermittent demand: Linking forecasting to inventory obsolescence](https://doi.org/10.1016/j.ejor.2011.05.018)。
- ADIDA 通过时间聚合降低零值稀疏性，因此被保留为间歇需求 sanity baseline：
  [An aggregate–disaggregate intermittent demand approach](https://doi.org/10.1057/jors.2010.32)。
- M5 强调大规模同人口、层级、简单基线与 scaled error 的竞争式评估；其结果也
  表明低层级 intermittency 会显著恶化：
  [M5 accuracy competition](https://doi.org/10.1016/j.ijforecast.2021.11.013)。

本项目没有机械复制库存预测：账单现金允许负冲销，pure-buyout 又具有承诺边界，
所以 SBA/TSB/ADIDA 只作 comparator；正式候选继续使用现金 route、as-of 标签
成熟度和审计约束。

## 下一步

1. 保持 v0.3 exact replay 和自动 baseline 回归，不继续同类 scale 搜索。
2. 优先补真实 cutoff commitment snapshot，改善 cash observability，但不移动
   824/7,851 冻结人口。
3. 在获得新授权后，研究 intermittent/dormant 的全局共享 occurrence model、
   survival/hazard、非负层级协调和可校准分布；仍需 outer-origin/no-leakage。
4. 绝对 WAPE、segment、coverage 门禁通过后，才讨论 final holdout 授权。
5. 人工只做 post-gate quality assurance；不恢复人工预测金额或 120 部书单。

## 可复现入口

公共电脑：

```bash
npm run verify:m2:current
```

具备已验证 private capability 且获授权的本地 exact replay：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

公共聚合证据：

- `docs/analysis/m2-current/M2-current-occurrence-amount-candidate-v0.3.json`
- `docs/analysis/m2-current/M2-current-automated-evaluation-v0.1.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.4.json`

边界保持：provider/database/final holdout/release/M3 formal 均未授权、未执行。
