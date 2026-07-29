# M2 核心老品统一同案例全周期冻结重评分 v0.1

## 结论

本报告属于实验“M2 核心老品全周期同案例证据补齐、按周期模型路由与已有渠道分配验证 v0.1”
（M2 Core Legacy Full-Horizon Same-Case Evidence Completion, Horizon Router and Observed-Channel Allocation Validation v0.1，`M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01`）的
统一同案例阶段（`K1_FULL_HORIZON_SAME_CASE_FROZEN_RESCORE_COMPLETE`）。评价只使用同一评价族、人口、粒度、
origin、horizon、作品、已有成熟渠道集合和 actual 定义的交集；不同 case 数的
独立 WAPE 没有被直接排名。

首次有效 private evaluation 的代码身份为
`f30fbc0660d90197bd44e516a0c07439fe08219b`（`evaluationHead`），对应双平台 exact-head CI
`30461873691`。最终文档身份（`finalDocumentationHead`）仍为空，
将在最终治理提交后单独记录。

## 各 horizon 判定

| horizon（月） | 主滚动评价（Primary rolling） | 严格滚动评价（Strict rolling） |
| ---: | --- | --- |
| 3 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） WAPE `0.262460` / bias `-3.65%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） WAPE `0.265224` / bias `24.65%`（`NO_STABLE_WINNER`） | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） WAPE `0.292427` / bias `-12.14%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） WAPE `0.691435` / bias `57.19%`（`NO_STABLE_WINNER`） |
| 6 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） WAPE `0.265139` / bias `11.39%`；作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） WAPE `0.283949` / bias `0.08%`；判定模型：核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）（`WAPE_WIN_BIAS_TRADEOFF`） | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） WAPE `0.303323` / bias `15.53%`；人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） WAPE `0.333977` / bias `-11.36%`；判定模型：核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）（`WAPE_WIN_BIAS_TRADEOFF`） |
| 12 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） WAPE `0.248919` / bias `0.83%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） WAPE `0.379738` / bias `30.97%`（`NO_STABLE_WINNER`） | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） WAPE `0.306360` / bias `-6.47%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） WAPE `0.803814` / bias `65.39%`；判定模型：人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）（`CLEAR_WINNER`） |
| 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） WAPE `0.284898` / bias `7.56%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`） WAPE `18.649596` / bias `1861.46%`；判定模型：人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）（`CLEAR_WINNER`） | 不可比较（`NOT_COMPARABLE`） |

## Core80 / Core90 作品总额同案例结果

| 人口 | 评价族 | horizon（月） | 同案例数 | 模型成绩 | 判定 |
| --- | --- | ---: | ---: | --- | --- |
| CORE80 | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 65 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）：WAPE `0.262460`，bias `-3.65%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.265224`，bias `24.65%` | `NO_STABLE_WINNER` |
| CORE80 | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 65 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.265139`，bias `11.39%`；作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）：WAPE `0.283949`，bias `0.08%` | `WAPE_WIN_BIAS_TRADEOFF` |
| CORE80 | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 47 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）：WAPE `0.248919`，bias `0.83%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.379738`，bias `30.97%` | `NO_STABLE_WINNER` |
| CORE80 | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 408 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）：WAPE `0.284898`，bias `7.56%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `18.649596`，bias `1861.46%` | `CLEAR_WINNER` |
| CORE90 | 主滚动评价 (`PRIMARY_ROLLING`) | 3 | 158 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.280420`，bias `24.79%`；作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）：WAPE `0.292441`，bias `-1.58%` | `WAPE_WIN_BIAS_TRADEOFF` |
| CORE90 | 主滚动评价 (`PRIMARY_ROLLING`) | 6 | 158 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.295512`，bias `13.15%`；作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）：WAPE `0.316779`，bias `1.88%` | `WAPE_WIN_BIAS_TRADEOFF` |
| CORE90 | 主滚动评价 (`PRIMARY_ROLLING`) | 12 | 115 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）：WAPE `0.302780`，bias `3.04%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.407659`，bias `30.72%` | `NO_STABLE_WINNER` |
| CORE90 | 主滚动评价 (`PRIMARY_ROLLING`) | 36 | 927 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）：WAPE `0.332402`，bias `7.75%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `10.560634`，bias `1046.53%` | `CLEAR_WINNER` |
| CORE80 | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）：WAPE `0.292427`，bias `-12.14%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.691435`，bias `57.19%` | `NO_STABLE_WINNER` |
| CORE80 | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 36 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.303323`，bias `15.53%`；人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）：WAPE `0.333977`，bias `-11.36%` | `WAPE_WIN_BIAS_TRADEOFF` |
| CORE80 | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 36 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）：WAPE `0.306360`，bias `-6.47%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.803814`，bias `65.39%` | `CLEAR_WINNER` |
| CORE80 | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 0 | 无合法同案例交集 | `NOT_COMPARABLE` |
| CORE90 | 严格滚动评价 (`STRICT_ROLLING`) | 3 | 75 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）：WAPE `0.348152`，bias `-17.23%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.682264`，bias `42.33%` | `NO_STABLE_WINNER` |
| CORE90 | 严格滚动评价 (`STRICT_ROLLING`) | 6 | 75 | 核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.342546`，bias `13.69%`；人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）：WAPE `0.360216`，bias `-13.77%` | `NO_STABLE_WINNER` |
| CORE90 | 严格滚动评价 (`STRICT_ROLLING`) | 12 | 75 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）：WAPE `0.331856`，bias `-7.47%`；核心收入人工规则基线 v0.1（Core-Revenue Manual Rule Baseline v0.1，`M2-WORK-CRMR01`）：WAPE `0.783873`，bias `57.23%` | `CLEAR_WINNER` |
| CORE90 | 严格滚动评价 (`STRICT_ROLLING`) | 36 | 0 | 无合法同案例交集 | `NOT_COMPARABLE` |

## 稳定性与极端贡献

每个可比较单元均执行 2,000 次作品聚类配对 bootstrap，并分别记录匿名独立时间块
和日历年份胜负。每个模型还报告单一匿名作品及前五匿名作品对绝对误差的贡献率；
公开文件不包含作品 ID、渠道 ID 或 case key。

清晰胜者（`CLEAR_WINNER`）必须同时满足：相对 WAPE 改善至少 1%，absolute
bias 不恶化超过 2 个百分点，bootstrap 95% 下界支持改善，并在多数独立时间块和
年份获胜。WAPE 达标但 absolute bias 恶化超过 2 个百分点时明确标为
`WAPE_WIN_BIAS_TRADEOFF`，不会自动晋升。

## 仍存在的证据缺口

- 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，
  `M2-WORK-OA03`）没有合法 Strict rolling、36 个月或直接作品×渠道冻结行。
- 人工锚定可学习全局模型（Human-Anchored Learned Global，
  `M2-WORK-LG01`）不能通过复制 36 个月参数补造 Primary 3/6/12 个月；
  Strict 36 个月也没有成熟选择起点。
- Strict rolling 当前合法同案例时间窗很短；这一限制必须保留在后续路由判定中，
  不能用 Primary 结果替代。

## 治理边界

现行运行回退仍为作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`），研究比较基线仍为
人工锚定可学习全局模型（Human-Anchored Learned Global，
`M2-WORK-LG01`）。本阶段没有训练、调参、修改 fallback、打开 later-origin
或 final holdout；活动候选与自动化批准仍为空。
