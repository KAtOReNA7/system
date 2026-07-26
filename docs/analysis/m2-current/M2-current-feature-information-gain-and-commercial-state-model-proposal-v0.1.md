# M2 feature information gain 与 commercial-state model proposal v0.1

日期：2026-07-26
状态：`ANALYSIS AND DESIGN ONLY — NO MODEL DEVELOPMENT`

## 1. 结论

下一代 M2 最可能降低作品级 WAPE 的信息，不是更多从同一现金序列派生的状态、
阈值或平滑参数，而是 origin 时真实可得的商业可用性变化：

1. 作品与渠道是否可售；
2. 渠道进入、退出和恢复；
3. 合同、授权和 rights window 的生效/失效；
4. 经验证的真实上线时间。

这些信号与未来分成现金具有直接业务因果关系，而且尚未被 learnedGlobal 吸收。
但当前合规历史覆盖均为 0，因此本轮只形成信息增益判断和
`M2-commercial-state-model-v0.1` 设计，不训练、不实现。

不应继续投入的方向：

- lifecycle-aware 的现金序列状态阈值；
- learnedGlobal、TSB occurrence 或 decay 参数的同窗调优；
- 把当前渠道属性、当前 rating 或当前合同状态事后回填到历史 origin；
- 在商业状态缺失时优先增加复杂 trajectory similarity 模型。

## 2. 判断口径

本报告把“有数据”拆成两种口径，避免把可事后重建误写成可预测使用：

- **重建覆盖**：当前完整账单缓存能否按 `billMonth` 计算该字段；
- **合规 as-of 覆盖**：是否有版本、`effectiveAt`、`availableAt`、完整性权威，
  能证明该字段在 origin 时已存在且可被使用。

当前证据：

- 3,053 部权威作品中，2,682 部有 2021—2025 分成事实，现代窗口作品覆盖
  87.85%；
- primary 为 1,125 部、12,039 个 36 月 case；
- canonical 渠道映射为 190,663/190,663 行，覆盖 100%，实际使用 39 个
  canonical 渠道；
- 25-origin 的合规 `availabilitySnapshot` 为 0/20,600
  work-origin-segment，覆盖 0；
- 历史渠道属性生效月、渠道状态 snapshot、合同可售 snapshot、verified launch
  month 和单购净单价覆盖均为 0。

因此下文的“预期信息增益”是基于因果距离、相对 baseline 的新颖性、收入质量失败
分布和既有实验 FVA 的排序，不是假装已经计算出的 mutual information。

优先级：

- `P0`：先采集/物化数据；没有这些数据不能做可信实验；
- `P1`：数据具备后第一批最小 ablation；
- `P2`：只作为 P1 的交互或第二批 ablation；
- `P3`：低增量，暂不开发；
- `STOP`：现有证据已足以停止该方向。

## 3. learnedGlobal 已包含的有效信息

### 3.1 Human prior 与学习增益

learnedGlobal 不是通用回归器，而是对人工主/边缘渠道公式的六个参数做受约束学习：

- `latestToAverageFloor`
- `edgeHistoricalShare`
- `lifecycleYear3Share`
- `lifecycleYear5Share`
- `mainChannelMaximum`
- `recentLevelBlend`

它把 manualFaithful 的 primary WAPE 从 0.53141021 降到 0.44022707，相对改善
17.16%；strict earlier-label WAPE 从 0.45621317 降到 0.41192870，相对改善
9.71%。这是当前最明确的正信息增益。

五个 primary work fold 的选择方向也较一致：

- `lifecycleYear3Share` 五折均为 0.35；
- `lifecycleYear5Share` 四折为 0.30、一折为 0.35；
- `recentLevelBlend` 四折为 0.75、一折为 0.50；
- `mainChannelMaximum` 四折为 1、一折为 4。

这说明当前有效结构主要是“少数主渠道 + 近期水平 + 年龄尺度”，不是复杂状态机。

### 3.2 Lifecycle decay

当前 lifecycle 只使用 `observedSalesAgeMonths`：

- 36 月以内使用 `lifecycleYear3Share`；
- 60 月以后使用 `lifecycleYear5Share`；
- 36—60 月线性插值；
- 主渠道 36 月预测使用近期年化水平除以 lifecycle contribution share。

它是粗粒度年龄尺度，不是作品真实 release→peak→decay 曲线。年龄来自首笔观察到的
分成现金，不是真实上线月；verified historical launch month 覆盖为 0。

### 3.3 Channel role

learnedGlobal 的 `main/edge` 不是人工渠道主表中的业务角色，而是每个 origin 按最近
12 月正向分成现金排序后动态产生：

- 前 `mainChannelMaximum` 个渠道为 main；
- main 使用 trailing annual、latest month 和 recent-three-month level；
- edge 使用累计历史现金乘 `edgeHistoricalShare`；
- 所有渠道最终加总。

canonical `revenueMode`、top-two concentration 和 peer platform trend 主要进入后续
expert/hierarchy 层，不是 learnedGlobal 主公式的核心增益。该 raw hierarchy 的
primary WAPE 为 0.45540455，劣于 learnedGlobal 的 0.44022707；strict WAPE 为
0.46616815，劣于 0.41192870。因此静态渠道类型和 peer trend 尚未证明增量。

### 3.4 Reversal

正向分成与冲销已分开。当前 common reversal 按
`legacy segment × horizon` 对 reversal/positive 比率做强收缩，最终从正向点预测中
扣除。primary 中有 560/12,039 个 reversal target case。

reversal 是必要的现金守恒信息，但当前没有解释未来冲销发生的合同或结算事件。
单独 occurrence/reversal raw 层 primary WAPE 为 0.44126080，略劣于
learnedGlobal；它应继续作为共同 baseline 组件，而不是下一轮主要信息来源。

## 4. Feature information gain inventory

| 候选 feature | 当前是否有数据 | 覆盖率 | 合规 as-of | 预期提升方向 | 主要风险 | 优先级 |
|---|---|---|---|---|---|---|
| A1 渠道 active/inactive 商业状态 | 有现金活动代理；无显式商业状态 | 现金代理可覆盖全部 model case；历史状态 snapshot 0% | 否 | 直接改善 occurrence、dead 与 revival 区分 | 无收入不等于下架；结算滞后 | `P0→P1` |
| A2 渠道 entry/exit 事件 | 账单可推首末收入；无合同进入/退出事件 | 2,682 部历史可重建；显式事件 0% | 否 | 捕捉突发增量、渠道流失和恢复，减少 level lag | 现金首末月晚于真实业务事件 | `P0→P1` |
| A3 渠道 concentration、top1/top2、HHI | top1/top2 已计算，main/edge 排序已间接使用 | 12,039 primary case 可计算 | 仅事后重建 | 识别单平台依赖和退出冲击 | 与 learnedGlobal 高度重复；单独信息增益低 | `P3` |
| A4 platform turnover / peer trend | 已有 target-excluded 6m/6m `peerTrendRatio`，无真实平台经营状态 | 每个 materialized channel 都产生值；无历史状态覆盖 | 否 | 区分作品自身衰退与平台整体变化 | 宏观共振、composition shift；既有 hierarchy 已失败 | `P2`，只作交互 |
| B1 verified release age | 有首笔分成月代理；无 verified launch month | age proxy 100%；verified launch 0% | 代理不合规，真实值无 | 校正 lifecycle share、早期峰值和不同发行阶段 | 首笔现金可能晚于上线且受结算影响 | `P0→P1` |
| B2 distance from revenue peak | 月序列可计算；当前未作为 baseline 参数 | model history 可重建 100% | 否 | 区分峰后下滑、二次峰值与短期噪声 | 同源信息；峰值对一次性大额高度敏感 | `P2` |
| B3 work decay-curve slope/half-life | 月序列可计算；learnedGlobal 已有粗 decay，lifecycle experiment 已加入趋势 | model history 可重建 100% | 否 | 对长周期 18/24/36 月校正 level | 与现有 recent blend 重复；cash-only lifecycle raw 已明显恶化 | `P3`，不独立开发 |
| C1 由现金阈值生成 active/stable/decline/dead/revival | 已实现并覆盖五状态 | 12,039/12,039；revival 仅 15 case | 只是账单切片，不是商业权威 | 理论上区分状态条件金额 | 同一收入序列重复编码；raw primary/strict WAPE 恶化 13.89%/51.19% | `STOP` |
| C2 权威 commercial state | 尚无历史状态 | 0% | 否 | 提供 baseline 没有的外生状态，直接解释收入能否继续产生 | 定义漂移、业务系统只保留当前值 | `P0→P1`，最高 |
| D1 `effectiveAt` + `availableAt` + complete snapshot | 公共 authority schema 与 portable intake 合同已存在；真实数据未物化 | 0/20,600 dense work-origin-segment | 否 | 消除事后回填，使所有商业状态特征可审计 | 采集成本、迟到记录、历史版本缺失 | `P0`，最高 |
| D2 rights window / saleable window | 当前系统可能有现值；无历史 exact-work snapshot | historical contract saleable coverage 0% | 否 | 解释计划性下降、不可售和恢复，尤其是长 horizon | 版权有效不等于渠道实际上架；尾款仍可能发生 | `P0→P1` |
| D3 单购净单价、净分成、销量换算 | 无 | 0%；单购/点播占完整分成现金约 10.12% | 否 | 把单购现金拆成销量×单位经济，改善该子群 amount | 合同差异大，不可假定统一价格或比例 | `P2` |
| E1 similar-work trajectory | 有 2,682 部现金历史；没有冻结 neighbor feature | reference pool 2,682；可用 feature 0% | 否 | 为稀疏作品借力，可能改善 intermittent | 邻居泄漏、头部作品缺少可比对象、距离度量不稳定 | `P3` |
| E2 release/channel/revenue-mode cohort | 有 current reporting category、channel mix、revenue mode；真实 release cohort 缺失 | 9 个二级 reporting group；verified launch 0% | 否 | 提供冷启动与弱历史先验 | 当前分类是 post-hoc；粗 cohort 会平均掉头部差异 | `P3` |

## 5. 信息增益排序

### 5.1 值得开发，但必须先有数据

第一组：**business availability + channel transition + rights window**。

原因：

- 它们是现有 baseline 没有的外生信息；
- 能在现金变化之前出现，而不是事后解释现金变化；
- 可以同时影响 occurrence 和 amount；
- 能直接回答 dead、decline、revival 为什么发生；
- top 1% 作品贡献 55.51% 正收入，top 10% 贡献 91.23%，exact-work 的可售和
  渠道状态比粗 cohort 更有机会改变 revenue-weighted WAPE。

第二组：**verified release age**。

它可以替换首笔分成月代理，修正 learnedGlobal 已证明有效的 lifecycle share。
这是低复杂度、高可解释性的增量，但前提是真实 launch/effective 时间可追溯。

### 5.2 只值得作为交互或 ablation

- channel concentration：已被 main/edge 排序大量吸收，只在渠道退出时作为风险暴露；
- platform turnover：只与权威 active/exit 状态组合，不能单独再做 hierarchy；
- peak distance：只作低维 work-state 辅助，不再重新建立现金阈值状态机；
- single-purchase unit economics：只覆盖约 10.12% 收入，应独立评估该子群。

### 5.3 当前不值得开发

- 继续调整 lifecycle state 阈值；
- 继续调整 TSB occurrence/amount smoothing；
- 用更多 log、slope、months-since-positive 组合替代缺失的商业事件；
- 直接做 nearest-neighbor、embedding 或复杂 mixture-of-experts；
- 使用 current channel role、current rating、current category 或 current rights
  事后填充历史；
- 以 case 数大代替独立时间证据。

## 6. M2-commercial-state-model-v0.1 proposal

状态：`DESIGN ONLY — NOT IMPLEMENTED`

### 6.1 设计原则

- frozen comparator 为 `learnedGlobal positive + common reversal`；
- 新模型只估计商业状态带来的增量，不重写 baseline；
- 状态由版本化业务事件定义，不由收入阈值定义；
- `unknown_at_origin` 必须回退 baseline，不填 0；
- 不使用 buyout、commitment、current rating 或 post-hoc category；
- 使用低维、强收缩模型，避免新增复杂专家层。

### 6.2 State space

五个预测状态和一个缺失哨兵：

| state | 业务定义 |
|---|---|
| `active` | origin 后可售关系净增加，或新渠道/新授权生效，且 active set 非空 |
| `stable` | origin 时 active saleable set 非空，观察窗口内没有 entry/exit/expiry |
| `decline` | 发生渠道退出、授权到期或可售关系减少，但 active set 仍非空 |
| `dead` | complete snapshot 证明 active saleable set 为零 |
| `revival` | 前一 complete snapshot 为 dead，随后有新 relation 生效并恢复可售 |
| `unknown_at_origin` | snapshot 不完整、版本缺失或 `availableAt > origin`；不参与状态拟合，预测回退 baseline |

这里的 active/stable/decline/dead/revival 是商业关系状态，不是现金曲线阈值。

训练标签取 horizon 末端最近一份 complete snapshot，并用窗口内的版本化事件确定
transition。多事件冲突时使用固定优先级：
`dead > revival > decline > active > stable`。其中 `active` 表示 active set
保持非空且净新增，`stable` 表示保持非空且没有关系变化；标签规则在读取评价结果
前冻结。

### 6.3 Feature schema

建议新建 `commercialStateSnapshot`，复用现有 authority envelope，但不把商业状态
塞进 cash `availabilitySnapshot`：

| 组 | 字段 |
|---|---|
| identity | `standardWorkId`, `origin`, `horizonMonths` |
| authority | `snapshotId`, `sourceSystem`, `sourceVersion`, `recordId`, `contentHashSha256`, `completeness` |
| time | `effectiveAt`, `availableAt`, `originCutoffAt` |
| availability | `saleable`, `activeSaleableChannelCount`, `activeTerminalPlatformCount`, `activeRightsRelationCount` |
| transition | `entryCount3m/6m/12m`, `exitCount3m/6m/12m`, `lastEntryAt`, `lastExitAt`, `priorState` |
| rights | `rightsValidAtOrigin`, `earliestRightsExpiryAt`, `saleableMonthsWithinHorizon` |
| exposure | `activeChannelTop1Share`, `activeChannelTop2Share`, `activeChannelHhi` |
| work time | `verifiedReleaseAt`, `releaseAgeMonths`, `availableAtForReleaseSource` |
| cash history | `trailing3/6/12Positive`, `monthsSincePositive`, `peakDistanceMonths`，全部只读 origin 前数据 |
| baseline offset | `learnedGlobalPositivePoint`, `commonReversalPoint` |
| missingness | 每个来源的 `known/unknown_at_origin` 与 missing reason |

字段必须支持 exact-work 和 channel relation 级 lineage；不能只保存最终 state 字符串。

### 6.4 Training target

状态层：

\[
P(S_{w,o,h}=s \mid X_{w,o}),\quad
s\in\{active,stable,decline,dead,revival\}
\]

标签来自 origin 后、目标 horizon 内的版本化商业 snapshot，不从未来现金反推。

金额层以 frozen baseline 为 offset：

\[
r_{w,o,h}
=\log(1+Y^+_{w,o,h})
-\log(1+\hat Y^{+,LG}_{w,o,h})
\]

对每个状态只学习强收缩 residual multiplier：

\[
\hat Y^+_{w,o,h}
=\sum_s P(S=s)\,
\left[
\exp\left(
\log(1+\hat Y^{+,LG}_{w,o,h})+\hat r_s
\right)-1
\right]
\]

最终 net cash：

\[
\hat Y_{w,o,h}
=\hat Y^+_{w,o,h}
-\hat R^{common}_{w,o,h}
\]

`dead` 不自动硬编码为 0，因为下架后仍可能有结算尾款；其 multiplier 必须从历史
状态标签与后续现金共同估计。预测正向金额下限为 0；`unknown_at_origin` 的
log-residual 固定为 0，即完整回退 frozen baseline。

推荐的模型族：

- state：强正则 multinomial logistic 或离散 transition table；
- amount：state×horizon 的 shrinkage log-residual；
- 不使用树模型、embedding、深度模型或新的 mixture-of-experts。

### 6.5 Evaluation design

只在合规 snapshot 具备后执行：

1. 以 snapshot version 冻结 dataset 和 feature version；
2. 每个 outer origin 只读取 `availableAt <= originCutoffAt` 的 complete snapshot；
3. primary information-gain 评估使用成熟的 3/6/12 月 rolling origin；
4. 18/24/36 月只在标签成熟时作 secondary 结果；
5. 同一 outer origin 内按作品分折，validation work 不进入 state 或 residual 拟合；
6. exact same cases 比较 frozen `learnedGlobal + common reversal`；
7. 不用 outer 指标改变 state 定义或字段变换。

每个实验只保存一份可复现记录，至少包含：

- `datasetVersion`：输入 snapshot/fact digest、origin 范围和标签截止月；
- `featureVersion`：字段清单、as-of 过滤规则、缺失语义和 state label 规则；
- `modelConfig`：baseline 身份、正则/收缩参数、随机种子和训练 fold；
- `evaluationResult`：case universe、覆盖率、总指标、分群指标、top-revenue
  误差和 paired comparison。

该记录是实验溯源，不是新的治理或发布门禁。

最小 ablation 顺序：

| 实验 | 新增信息 |
|---|---|
| B0 | frozen learnedGlobal + common reversal |
| B1 | B0 + saleable/rights window |
| B2 | B1 + channel entry/exit/revival |
| B3 | B2 + verified release age |
| B4 | B3 + concentration/platform turnover interaction |
| B5 | 仅在 B1—B4 有稳定增量后，再评估 trajectory/cohort |

核心评价：

- revenue-weighted WAPE；
- signed bias；
- active/stable/decline/dead/revival 分群 WAPE；
- top 1%/5%/10% revenue works 的 WAPE 和绝对误差占比；
- paired work-origin absolute-error change；
- feature coverage 与 `unknown_at_origin` 分布。

这些是 development 比较指标，不新增复杂决策门禁。

### 6.6 Baseline comparison hypothesis

应验证的单一假设：

> 在 exact same work-origin-horizon cases 上，版本化 commercial state 是否能在
> 不改变 learnedGlobal 结构和 common reversal 的前提下，降低 revenue-weighted
> WAPE，尤其是 channel exit、rights expiry 和 revival case 的绝对误差。

若 B1/B2 不能稳定改善 WAPE，则停止 commercial-state 路线；不通过调整现金阈值、
增加模型深度或加入 similarity 来挽救。

## 7. 最小数据需求

下一步最小输入不是更多预测金额，而是一张历史、版本化的 relation/event ledger：

- exact work；
- exact channel/contract/right relation；
- event type：entry、exit、saleable_on、saleable_off、rights_start、
  rights_expiry、reactivation；
- `effectiveAt`；
- `availableAt`；
- source version、record id、content hash、lineage；
- complete-as-of snapshot 标志。

只提供 current 状态没有信息价值，因为无法进行历史 as-of 评估。

## 8. 证据来源

- `src/domain/m2Current/humanAnchored.js`
- `scripts/m2-current/materialize_human_anchored_cases.py`
- `config/m2-current-human-anchored.v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/analysis/m2-current/M2-current-signal-gap-diagnostic-v0.1.json`
- `src/domain/m2Current/revenueShareFact.js`
- `src/domain/m2Current/availabilitySnapshot.js`

本轮没有修改任何 production 代码、模型配置、阈值或训练 artifact。
