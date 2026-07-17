# M2 v2 B4 能力与限制分析

## 结论

B4 是当前最可靠的 formal-cash 比较器，但不是可发布的最终模型。它的价值在于简单、确定、可审计、对稀疏数据有强 fallback；它的主要限制不是单一算法缺陷，而是四类因素叠加：已测试结构的表达能力不足、cutoff 可得信息不足、商业价值目标尚未定义、以及买断承诺和可评分人口的覆盖不足。

证据必须按模型质量与发布覆盖分开解释：

1. **D 覆盖不足是已证明的发布硬阻断**：没有买断承诺快照，formal-cash 模型只覆盖 824/3,053 部作品；这些 abstained case 不进入模型 WAPE，因此不能把覆盖失败冒充模型误差根因。
2. **A 模型结构不足是 served sales 子集的直接证据**：B4 使用平坦、近线性的历史统计延展，无法表达事件、非线性衰减、层级借力和作品间异质性。
3. **B 信息不足是领先但未证实的增量假设**：没有历史外部证据快照，且存在未匹配未来渠道现金；在完成 external-feature ablation 或 Human-vs-AI 数值基准前，不能断言外部信息一定降低 WAPE。
4. **C 目标问题已经部分修正**：旧买断月均目标已由 formal cash 取代；当前 cash target 本身不应再改，但它不能代表完整商业价值，需新增独立 value target。

## B4 的模型身份

B4 不是 `src` 下的正式产品服务。它位于校准脚本：

- `scripts/m2-real-data/m2_calibration_v1.py`
- `scripts/m2-real-data/m2_calibration_v1_2.py`
- `scripts/m2-real-data/m2_formal_cash_comparator_v1.py`

v1.2 入口通过同一 `predict_as_of` 内核 materialize 所有 baseline。B4 使用 B0b 基础入口以保持 case-key、as-of、路由和锁一致，再标记为 `B4_formula_switched_legacy_variant`。B0a 只作历史审计，不能参与 comparator selection。

formal cash decorator 再将未来实销与 cutoff 已确认应收组合，并对没有承诺的纯买断执行 null abstention。B4 本身没有独立的 API、repository 或正式导出实现。

## 输入变量与模型逻辑

### 主要输入

- cutoff 前月收入序列；
- 渠道拆分后的历史销售现金；
- 首个观察月与可观察长度；
- 收入模式/业务形态；
- 生命周期分类；
- 批次或均分聚类线索；
- horizon 与预测期长度。

### 未进入 B4 点预测的信号

- 作者影响力与作者层级；
- 分类、标签和题材层级；
- 标题或作品身份；
- 外部搜索、社交、改编、出版、市场趋势；
- 无 cutoff 快照的当前货架、版权、评级和风险；
- 后来发生的买断或 cutoff 后 outcome。

### 公式形态

B4 对每条销售路径采用下列统计量的保守组合：

```text
monthlyLevel = max(
  mean(last 12 observed months),
  trimmedMean(last 24 observed months),
  0.4 * median(all positive months)
)

forecast = monthlyLevel * horizon * lifecycleFactor
```

随后施加低收入 cap，并对销售渠道分别预测后求和。已提交 lifecycle factor 对大多数活跃生命周期为 1，对 inactive/insufficient 为 0，因而并未形成细粒度的增长、衰减或反弹曲线。月度路径基本平坦，3/6/12/18/24 月主要通过 horizon 线性伸缩。

## 优势

1. **确定和可复现**：无需随机训练，容易锁定逐 fold 预测。
2. **低复杂度**：对 824 部 formal-cash 模型作品和稀疏月序列具有较低方差。
3. **可审计**：每个统计量都可追溯到 cutoff 前收入。
4. **强 fallback**：C2/C3 大量 case 最终回退 B4，说明它仍是稳定锚点。
5. **路由安全**：经 formal-cash decorator 后，纯买断无承诺为 null，不以 0 或月均等效值冒充现金。
6. **比较基础一致**：B4、C2-R.1、C2、C3 共享 7,851 case / 824 work 的 formal-cash 人口。

## 指标证据

### 总体与分层

| 指标 | B4 | 冻结门槛 | 判断 |
|---|---:|---:|---|
| overall WAPE | 55.6485% | ≤60% | 通过绝对门槛；仍需相对与其余 gate |
| overall signed bias | +8.9111% | ±10% | 通过 |
| high-value WAPE | 46.1613% | 受高价值 gate 约束 | 报告 |
| high-value signed bias | +12.0534% | ±10% | 失败 |
| full-library forecastable cash coverage | 73.9647% | ≥90% | 失败 |
| Top10 forecastable cash coverage | 75.9413% | ≥90% | 失败 |

### horizon 稳定性

| Horizon | WAPE | signed bias | 说明 |
|---:|---:|---:|---|
| 3 月 | 47.3668% | +8.2762% | 短期相对较稳 |
| 6 月 | 48.8934% | +3.1817% | bias 较低 |
| 12 月 | 49.0681% | +8.2354% | 中期可用但误差仍高 |
| 18 月 | 60.6004% | +15.5063% | bias 超过 ±15% |
| 24 月 | 79.2565% | +8.7816% | 长期 WAPE 显著恶化 |

内部 80% 区间 coverage 为 84.9319%，WIS 为 5,083.94；这些仅用于内部校准，不构成产品输出。

## 失败原因归因

| 类别 | 证据 | 结论 |
|---|---|---|
| A. 模型结构 | 平坦月度路径、粗生命周期因子、线性 horizon；C3 内部特征只能带来约 0.46% WAPE 改善 | 对 served sales 子集成立，但尚未测试非线性 tree residual 与新信息集 |
| B. 信息不足 | B4 不使用作者/分类层级、外部需求、改编、搜索、市场事件；C3 也只允许 20 项内部聚合 | 领先假设；“信息缺失”已证实，但“加入后改善”尚未由 ablation 证明 |
| C. 目标定义 | legacy buyout target 曾导致极端偏差；formal cash 已纠正 | 当前现金目标不是 bug；“商业价值”需另建 target，不能混入现金 |
| D. 数据覆盖 | formal model 仅 824/3,053 works；无承诺快照的 pure-buyout 必须 abstain；Top10 coverage 75.94% | 强发布阻断；不进入模型 WAPE，不能通过调参或降低 gate 解决 |

### 可解释但不可消除的误差

- 未来新渠道或未匹配渠道的现金无法从现有同渠道历史直接恢复；
- 真实异常、首发爆发、结算滞后和买断批次在无审计类型前不能自动衰减；
- 24 月线性外推积累误差；
- long-tail/intermittent/dormant 序列的零膨胀使均值与正收入统计量都不稳定。

## C1–C3 对 B4 的增量证据

- C1 证明特定 transparent ensemble 与 fallback 失败，不证明所有 ensemble 无效。
- C2-R.1 证明 route-specific 组合可以降低 bias，但未能稳定超过 B4。
- C2 证明冻结的硬活跃度分层、Croston/SBA/TSB/ADIDA/hurdle 组合没有稳定增益；高价值 case 大量直接回退 B4。
- C3 证明只靠当前 20 项内部聚合特征的透明/线性 residual correction 增益有限；它没有测试 tree boosting 或外部证据。

因此“继续对同一信息集做小公式搜索”的边际价值很低，但“在严格 as-of 外部证据与层级特征上测试受控 residual learning”尚未被否定。

## 发布阻断

B4 当前同时存在模型、业务与工程阻断：

1. 高价值和 18 月 bias gate 未通过；
2. forecastable cash coverage 未达到 90%；
3. final holdout 未打开；
4. 中文业务抽检与明确批准未完成；
5. B4 没有正式 serving runtime；
6. DB/API/export 仍保留旧三情景与建议字段；
7. 所有结果仍 `not_for_formal_decision`。

## M2 v2 中的建议角色

B4 不应被删除或直接替换。建议固定为：

- formal-cash anchor；
- 每个候选的 primary comparator；
- 外部证据缺失、质量失败或 provider 故障时的 fallback；
- explanation 中的历史惯性基准；
- shadow 阶段的业务安全下限。

任何新模型必须在相同 case keys、相同 formal-cash target、相同 seals 下证明增量价值；否则保持 B4。
