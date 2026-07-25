# M2 人工锚定层级概率模型：研究映射与开发决定 v0.1

日期：2026-07-26
状态：current development decision；`not_for_formal_decision`

## 1. 结论先行

本轮没有再凭空创造一条预测路线，而是把用户给出的主力/边缘渠道人工算法固定为
唯一结构主干，再让数据学习其中可以校准的参数。这个方向是正确的，但当前结果仍
不足以成为成熟预测模型：

- 36 个月主评估覆盖 1,125 部独立作品、12,039 个成熟 case；不是固定 300 本样本。
- 人工原式 WAPE/bias 为 `0.53141021 / -0.40552340`。
- 人工锚定模型 WAPE/bias 为 `0.44022707 / -0.12366598`，相对人工原式改善
  `17.16%`，但没有达到 `WAPE <= 0.30`、`|bias| <= 0.10`。
- 在 5,203 个与 v0.3 完全重叠的 case 上，新模型 WAPE 为 `0.27683274`，
  v0.3 为 `0.37610234`，相对改善 `26.39%`；这只是同一 development 窗口的
  配对比较，不能替代独立 later-origin。
- 按作品聚类 bootstrap 后，相对人工规则 WAPE 改善的 95% 区间为
  `[-38.40%, 5.36%]`，上界越过 0；目前还不能证明换一批作品仍稳定改善。
- active WAPE 为 `0.36837319`，intermittent 为 `0.82752420`，dormant 为
  `1.00000000`；主要失败不在总量公式，而在发生概率、长尾与失活作品。
- 四专家原始层 WAPE 为 `0.45540455`，发生/冲销原始层为 `0.44126080`，
  都劣于已学习人工参数层 `0.44022707`，因此按预设 nested FVA 规则拒绝并回退；
  报告中的后两层 FVA=0 是安全回退，不是这两层获得成功证据。

因此 v1.0 的正式判定为 `HUMAN_ANCHORED_DEVELOPMENT_FAIL`。exact v0.3
继续作为作品级 fallback；v1.0 参数和失败结论冻结，不得在同一窗口继续试参。

## 2. 数据质量与样本设计

### 2.1 预期粒度

主评估的一行是：

```text
authority work × forecast origin × 36-month horizon
```

辅助评估的一行仍是同一作品和起点，但 horizon 为 3/6/12/18/24 个月。重复
origin 只增加同一作品的时序观察，不冒充新的独立作品；抽样和置信区间以作品为
聚类单位。

### 2.2 完整性与守恒

| 检查 | 结果 |
|---|---:|
| 权威作品总数 | 3,053 |
| 2021—2025 有分成事实的作品 | 2,682（87.85%） |
| 2021—2025 分成事实行 | 167,972 |
| 渠道映射覆盖 | 100% |
| 映射前后净现金差 | 0 |
| 36 个月主评估独立作品 | 1,125 |
| 36 个月主评估成熟 case | 12,039 |
| 短周期辅助评估独立作品 | 2,650 |
| 未成熟标签填 0 | 0 |

现金标签只来自用户人工确认的分成账单。买断现金、2021 年以前和 2025 年以后
金额均未进入特征、标签或指标。正向收入与负数冲销分别聚合，并保持：

```text
positive sales-share cash - reversal cash = net sales-share cash
```

渠道角色与收入模式当前只有静态人工确认，没有历史 `effectiveAt` 覆盖，所以只
能用于 development 分层，不能宣称为严格历史 as-of 真值。三级分类只用于结果
报告，没有进入预测。

## 3. 人工算法的数学抽象

对作品 \(w\)、渠道 \(c\)、起点 \(t\)，定义最近 12 个月平均月收入
\(\bar y_{wct}\)、最近月收入 \(y^{last}_{wct}\)、本版权期累计收入
\(H_{wct}\)、下滑阈值 \(\tau\)、生命周期比例 \(q(a)\)。

主力渠道基础预测为：

```text
stable level   = trailing-12-month annual income
declining level = latest month
annual level    = smooth_mix(stable annual level, 12 × declining monthly level; τ)
main forecast   = annual level / q(age)
```

边缘渠道基础预测为：

```text
edge forecast = edgeHistoricalShare × H
```

其中人工先验为：\(\tau=0.8\)、三年生命周期比例 0.5、五年 0.4、边缘历史份额
0.5、主力渠道数 1—3。本轮只允许学习这些人工公式里的阈值、生命周期比例、
边缘份额、主力渠道边界和近期水平混合，不允许另起无业务含义的平行模型。

四个受约束专家为：

1. 普通会员/广告分成：沿用主力/边缘与生命周期公式。
2. 平台主导：当 Top1/Top2 占比达到人工边界时，在作品公式与该平台历史趋势间
   加权。
3. 单购/点播：保留独立专家路由；没有可审计净单价和分成口径时不伪造销量。
4. intermittent/dormant：把是否再次发生收入与发生后的正金额分开，并保留
   历史衰减 fallback。

负数冲销作为独立发生/金额层建模，最终从正向预测中扣除。概率输出通过按作品
排除自身 fold 的残差分布校准，输出 0.05/0.10/0.20/0.50/0.80/0.90/0.95
分位数；中央 80% 区间实际覆盖率为 `0.80089708`。

## 4. 外部理论如何落实到本地模型

| 外部证据 | 可迁移原理 | 本地落实 | 本轮证据 |
|---|---|---|---|
| Yelland，Bayesian forecasting of parts demand，DOI `10.1016/j.ijforecast.2009.11.001` | 生命周期与层级部分汇聚 | 人工生命周期比例作为先验，按作品外训练 | 全局人工参数有正 FVA |
| Fildes、Goodwin、De Baets，Forecast Value Added，DOI `10.1016/j.ijforecast.2024.07.006` | 每层必须证明增量价值 | manual → learned → hierarchy → occurrence 逐层 FVA | 后两层 FVA 为 0，未被包装为成功 |
| Wang 等，Interpretable Mixture of Experts，arXiv `2206.02107` | 专家路由必须可解释 | 四个受约束业务专家 | 路由已实现，分群门禁仍失败 |
| Pradier 等，Preferential MoE，arXiv `2101.05360` | 人类知识应作为偏好/先验而非硬真值 | 人工公式为结构和 fallback，参数可学习 | 相对人工原式改善 17.16% |
| M5 uncertainty，DOI `10.1016/j.ijforecast.2021.10.009` | 点预测与不确定性要共同评价 | 分位数、WIS、覆盖率 | 80% 区间校准通过 |
| M5 overdispersion/intermittency，DOI `10.1016/j.ijforecast.2021.09.008` | 零膨胀与过度离散不可只用均值模型 | occurrence 与 positive amount 分离 | intermittent WAPE 仍为 0.8275 |
| M5 point/probabilistic blending，DOI `10.1016/j.ijforecast.2022.01.001` | 概率与点预测可以分层组合 | 点预测主干加 cross-work 残差分位数 | 覆盖率好于点误差成熟度 |
| M5 cross-validation warning，DOI `10.1016/j.ijforecast.2021.12.003` | 同窗反复选择会过拟合 | 按作品外五折、严格 earlier-label 辅助回测 | later-origin 仍缺失 |
| M5 partial pooling winner，DOI `10.1016/j.ijforecast.2021.11.007` | 大规模异质序列需要部分汇聚 | 全局参数与层级收缩 | 层级层未产生增量 FVA |
| Hyndman 等，Hierarchical forecasting，DOI `10.1016/j.csda.2011.03.006`；MinT，DOI `10.1080/01621459.2018.1448825` | 层级预测需一致性与可验证增量 | 保留作品、组合、origin×horizon 三种分辨率 | 组合提升不得分配回作品 |
| Boylan 与 Syntetos，Intermittent Demand Forecasting，ISBN `9781119976080` | 间歇需求需专门发生过程 | 单列 intermittent/dormant 门禁 | 当前仍是最大失败来源 |
| TSB/obsolescence，DOI `10.1016/j.ijpe.2018.01.026` | 失活概率需要随时间更新 | dormant 衰减专家 | dormant WAPE/bias 仍为 1/-1 |
| Xu 与 Xie，Sequential Predictive Conformal Inference，PMLR 202:38707–38727 | 时序区间校准不能读取未来 | fold 外残差与严格 earlier-label 校准 | 区间通过但不等于点预测成熟 |

这些论文提供的是可检验的结构、抽样和评价原则，不提供可直接复制到本账单的神奇
参数。外部行业经验只有在本地严格 as-of、同人口、独立作品和现金守恒条件下产生
FVA，才允许保留。

原始来源：

- <https://www.sciencedirect.com/science/article/pii/S0169207009001770>
- <https://research.ou.nl/en/publications/forecast-value-added-in-demand-planning-2/>
- <https://arxiv.org/abs/2206.02107>
- <https://arxiv.org/abs/2101.05360>
- <https://www.sciencedirect.com/science/article/pii/S0169207021001722>
- <https://www.sciencedirect.com/science/article/abs/pii/S0169207021001527>
- <https://www.sciencedirect.com/science/article/pii/S0169207022000012>
- <https://www.sciencedirect.com/science/article/abs/pii/S0169207021002090>
- <https://www.sciencedirect.com/science/article/abs/pii/S0169207021001813>
- <https://robjhyndman.com/publications/hierarchical/>
- <https://www.tandfonline.com/doi/abs/10.1080/01621459.2018.1448825>
- <https://onlinelibrary.wiley.com/doi/book/10.1002/9781119135289>
- <https://www.sciencedirect.com/science/article/pii/S0925527318300562>
- <https://proceedings.mlr.press/v202/xu23r>

## 5. 已否决的替代方案

本轮探索后已经删除、未保留为平行 runtime 的方案：

- 高维 ridge 残差校准：WAPE 恶化到约 `0.5131`。
- 无业务解释的整体 level calibration：WAPE 约 `0.4747`，劣于当前冻结结果。
- 把生命周期比例网格下探到 0.15/0.20：作品外结果恶化。

这些失败说明现有误差不是简单“乘一个系数”或堆更多回归特征可以解决。继续在同一
2021—2025 development 窗口寻找更漂亮参数只会增加选择偏差。

## 6. 为什么仍未成熟

1. **独立性不足**：36 个月标签在 2021—2025 窗口内只成熟到 2022-12 起点；
   没有未参与本轮选择的 later-origin。
2. **长尾发生过程失败**：intermittent/dormant 的主要不确定性是未来是否还会
   发生收入，不是发生后的金额均值。
3. **历史状态缺失**：渠道角色、收入模式、合同可售状态、真实上线月没有历史
   `effectiveAt/availableAt`，当前静态值不能事后回填。
4. **专家信号不足**：单购没有可审计作品净单价/净分成/销量换算；平台主导专家
   缺少历史平台状态。
5. **作品间不稳定**：作品聚类 bootstrap 改善区间仍跨 0，表明结果可能被少数
   大额作品或特定作品组合驱动。

## 7. 下一开发方向

严格顺序如下：

1. 冻结 v1.0 代码、参数空间和失败结论；exact v0.3 继续 fallback。
2. 优先取得一个未参与本轮选择、36 个月标签已经成熟的 later-origin；若时间上
   尚未成熟，则保持阻断，不能用未成熟标签填 0。
3. 或者只接收具备明确公式目标的历史 as-of 信号：
   - 渠道/合同在每个起点是否可售；
   - 真实上线月；
   - 单购作品净收入到销量的可审计换算；
   - 信号的 `effectiveAt` 与 `availableAt`。
4. 新信号先做覆盖、唯一性、守恒、时间泄漏与作品级缺口 ledger，再以 25-origin
   辅助目标验证 occurrence/positive amount；不得先要求人工填写预测金额。
5. 预注册新 challenger 的唯一变化、目标分群和最小 FVA，再评价未见 origin。
6. 只有作品级绝对质量、分群、聚类 bootstrap、风险覆盖和业务损失全部通过，才
   申请 final holdout。provider、数据库、Canary、release、M3 formal 继续封存。

当前没有必须让人工立即补充的新表格。只有在下一模型公式明确需要上述某个历史
信号时，才应提供中文简化表格、填写用途和“没有/不清楚”选项。

## 8. 可复现入口与边界

公开、无 private：

```bash
npm run diagnose:m2:current
npm run verify:m2:current
```

本机受控 development：

```bash
npm run doctor:capability -- m2-current-human-anchored
npm run develop:m2:current:human-anchored
```

第二组命令缺少 private 账单或人工渠道表时可以失败，但不得影响 clone、`npm ci`、
lint、build、公共测试、smoke、公共 M2 诊断和本地服务启动。
