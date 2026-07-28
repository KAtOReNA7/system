# M2 分成收入预测 PRD v0.2

日期：2026-07-26
状态：current development contract；`not_for_formal_decision`

本版本取代 v0.1 中与现金目标、人工样本和当前开发顺序冲突的内容。v0.1 继续保留
作历史审计，不是 current 执行指令。

## 1. 唯一预测目标

M2 只预测未来**分成收入现金**：

```text
futureM2CashForecast = futureSalesShareCash
```

全部买断现金、其他非分成现金和 commitment 均在预测范围外，包括 cutoff 时已经
签署、确认、金额可审计的买断应收。它们只能进入独立账单/审计层；买断历史可用于
评级背景，但必须标记 `notCashForecast=true`。

禁止：

- 将买断、授权费或其他非分成现金作为特征、标签、actual、预测或区间；
- 将 pure-buyout 输出为 0；必须 `null abstain`，原因为
  `buyout_outside_m2_forecast_scope`；
- 按金额形态、备注、渠道或正负号重新推断买断；
- 使用 commitment 作为分成预测信号；
- 把 null、缺失或未成熟标签改成 0。

现金类型只由用户人工复核的总账、分成账单和买断账单成员关系决定。总账用于守恒，
分成账单是预测现金唯一来源，买断账单只作模型外审计/评级背景。

## 2. 渠道主数据合同

渠道主表必须把 `原始渠道ID + 原始文学库渠道名称` 映射为：

- canonical 渠道名称；
- 渠道角色；
- 收入模式；
- 内容形态；
- 人工确认状态；
- 可选生效年月。

系统根据 canonical 名称生成稳定内部 `channelUid`。该 UID 不由用户填写，也不在
人工表中展示。渠道主表和原始账单保持 Git ignored；公开仓库只保留 schema、
synthetic fixture、加载器、门禁和聚合证据。

渠道映射硬门禁：

1. 原始组合唯一；
2. 映射覆盖 100%；
3. 映射前后行数不变；
4. 映射前后金额精确守恒；
5. 同一 canonical 渠道的角色、收入模式和内容形态无冲突；
6. 未确认或无 historical effective time 的属性不得冒充历史 as-of truth。

## 3. 模型结构

M2 新候选必须以用户提供的主力/边缘渠道人工算法作为结构主干、参数先验和
fallback，不得另建没有业务含义的平行预测路线。目标结构是：

```text
作品 × canonical 平台 × 平台类型 × 三级分类 × 级别 × 上线月龄
```

但只有 cutoff 时真实可得、可审计、可版本化的字段才能进入预测：

- 作品分成历史；
- canonical 渠道身份；
- 带生效时间的渠道角色/收入模式；
- 带 available-at 的合同可售、渠道状态；
- 可证明的上线时间。

当前三级分类与 rating 可以用于 post-hoc 结果分组；若没有历史 snapshot，不得作为
回测特征。首笔实销月只能报告为 `observedSalesAge`，不能冒充真实上线月。

人工算法中的 80% 下滑阈值、三年 50%/五年 40% 生命周期比例、边缘渠道 50%、
主力渠道边界和近期收入水平允许按作品外训练学习，但每个变化都必须报告相对人工
原式的逐层 FVA。模型必须同时包含普通会员、平台主导、单购和
intermittent/dormant 四个受约束专家，并把正向收入与负数冲销分开。点预测之外
必须输出分位数和风险区间。

### 3.1 会员/广告分成平台

允许在 strictly as-of 历史上建立渠道季节、趋势、持续性、occurrence 和 positive
amount 模型。所有平台曲线必须经 nested earlier-label 选择，并与 exact v0.3、
seasonal naive、Croston/SBA/TSB/ADIDA 等基线比较。

### 3.2 单购/点播平台

只有存在可审计的作品净单价、分成比例或“净收入到销量”的等价口径时，才能先换算
销量，再建首发衰减和季节曲线。缺少该证据时：

- 禁止假定统一 30 元或固定 50% 分成；
- 禁止把收入除以虚构价格得到销量；
- 单购分支保持 fallback/blocked。

### 3.3 非终端合作方

版权/代理、制作、聚合/分发角色不能自动视作终端消费平台。没有可审计的传导关系时
保持作品级 fallback。

## 4. 评价与晋级

必须同时报告：

- 作品 case；
- origin 组合；
- origin × horizon；
- activity segment；
- 收入模式；
- risk–coverage 与业务损失。

新模型必须从全部 3,053 部权威作品建立资格 ledger，使用全部合格独立作品，不得
固定抽取 300 本。重复 origin 不能冒充新的独立作品；bootstrap 和分折必须按作品
聚类。2021—2025 是当前现代平台阶段，36 个月未成熟标签必须排除而不是填 0；
2023—2025 只能用于对应标签已成熟的短周期辅助目标。

新信号先通过逐月 rolling-origin 辅助诊断，再做按作品隔离的 nested 比较，同时
保留旧 7,851 machine-route case 与当前人工权威 served 人口的差异审计。任何
promotion 还必须使用未参与模型设计的预注册 later-origin 或经单独授权的 final
holdout。

### 4.1 later-origin 独立性与一次性消费

later-origin 必须在读取任何预测指标前预注册。预注册至少绑定冻结模型代码和
commit、训练与选择证据边界、候选时间块、36 个月标签截止、资格和排除 ledger、
private 数据摘要、人口/守恒、指标、分群、bootstrap、时间块敏感性与门槛。

独立性按时间证据判断，不能只看某个 origin 是否出现在 36 个月主评估中：

1. origin 必须晚于 v1.0 参数选择、层比较和阈值判断所读取的最晚标签月份；
2. 相邻候选月份必须作为一个连续时间块，不得按作品数或月份数冒充多份独立证据；
3. 未成熟标签和不完整月份必须排除，禁止填 0；
4. 只允许直接复用原运行时冻结的完整模型状态；不得在验证前重新拟合人工参数、
   专家权重、occurrence/reversal 或分位数残差池；
5. 指标一旦读取，该时间块即消费；失败后只允许误差归因，不自动授权 v1.1。

2026-07-26 资格审计确认：2023-01 至 2023-04 的 36 个月标签已成熟，但
2023-03 已进入既有短周期辅助评估，v1.0 选择/比较证据的标签边界到 2025-12，
且原运行没有留下完整 frozen state。因此该连续块不合格，未读取指标。最早可能
时间独立的 origin 为 2026-01，需要账单完整到 2029-01 并取得原始 frozen state。

最低 development 门禁：

- WAPE ≤ 0.30；
- |bias| ≤ 0.10；
- 相对 WAPE 至少改善 1%；
- segment 与长周期不得出现不可接受退化；
- as-of、映射、守恒、泄漏和独立验证全部通过。

失败时必须保持 exact v0.3 fallback；不得通过增加模型数量、移动人口、删除困难
case 或调整同窗参数来代替证据质量。

## 5. 人工角色

120 部人工预测清单已永久退出 current 流程，不得重建或生成替代样本。人工算法
是模型结构与先验，不是一个需要人工继续填写金额的比赛样本。人工只负责：

- 账单分区；
- 渠道主数据；
- 技术门禁通过后的 `accept`、`accept_with_limits` 或 `reject`。

人工不提供预测金额，也不与模型进行准确率竞赛。

## 6. 当前状态

canonical 渠道治理已完成：133 个原始组合归并为 74 个 canonical 渠道，分成账单
190,663 行 100% 映射且金额守恒。v0.9 渠道曲线候选已经失败。随后完成的
人工锚定层级概率 v1.0 使用 2021—2025 分成账单，从全部 3,053 部权威作品开始，
形成 1,125 部独立作品、12,039 个成熟 36 个月 case：

- 人工原式 WAPE/bias 为 `0.53141021 / -0.40552340`；
- v1.0 WAPE/bias 为 `0.44022707 / -0.12366598`，相对人工原式改善
  `17.16%`；
- 5,203 个与 v0.3 精确重叠的 case 上，v1.0 WAPE 为 `0.27683274`，
  v0.3 为 `0.37610234`；
- active/intermittent/dormant WAPE 分别为 `0.36837319 / 0.82752420 /
  1.00000000`；
- 作品聚类 bootstrap 的相对人工 WAPE 改善 95% 区间为
  `[-38.40%, 5.36%]`，仍跨 0；
- 后两层公开 FVA=0 只表示 selected pipeline 安全回退。回退前选择口径中，
  四专家 candidate FVA 为 `-0.015177`，发生/冲销 candidate FVA 为
  `-0.001034`；当前门禁必须检查 candidate FVA，并同时保留 selected-pipeline
  FVA，不能让回退后的非负值替代层级证据；
- strict rolling 必须把相邻 calendar origin 合并为一个时间证据块；作品或 case
  数不能替代独立时间块数量；
- 历史渠道属性生效时间、渠道状态、真实上线月、单购净单价和独立 later-origin
  均缺失。

2026-07-26 获准执行的
`M2-current-human-anchored-tsb-occurrence-challenger-v0.1` 是 v1.0 之后唯一的
受控单变量候选。它只用 canonical TSB 替换 occurrence/positive amount 子层，
共同 reversal 层保持不变；预注册冻结 occurrence smoothing `{0.05, 0.10, 0.20}`、
positive amount smoothing `{0.05, 0.10, 0.20}` 和 blend
`lambda {0, 0.25, 0.50}` 共 27 个组合。inner selection 只能读取当前 outer fold
之前的 origin，observed zero 更新 occurrence，unobserved month 禁止填 0。

受控 development 结果：

- 主评估仍覆盖 1,125 部独立作品、12,039 个成熟 36 个月 case；
- learnedGlobal、raw TSB、选前 blend 的 WAPE 分别为
  `0.44022495 / 0.54346231 / 0.45348237`；
- raw TSB 与选前 blend FVA 分别为 `-0.10323736 / -0.01325742`；selected
  pipeline 回退 `lambda=0` 后 FVA=0，只表示安全回退；
- active/intermittent/dormant WAPE 为
  `0.40697875 / 0.70411859 / 1.82646345`；
- strict rolling 74,320 case 中 learnedGlobal/blend WAPE 为
  `0.41191878 / 0.44487051`，11 个连续时间块只有 3 个改善；
- 作品聚类相对候选改善 95% 区间为
  `[-0.02847674, 0.09264632]`；
- 与 v0.3 精确重叠的 5,203 个同窗 case 中，blend/v0.3 WAPE 为
  `0.26352433 / 0.37610234`，但这不是独立 later-origin，不能推翻总体门禁。

结论：v1.0 保持 `HUMAN_ANCHORED_DEVELOPMENT_FAIL`，TSB 单变量候选为
`TSB_OCCURRENCE_DEVELOPMENT_FAIL`，总体仍是 `M2_NOT_MATURE` /
`REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK`。v1.0 参数、TSB 27 组合、inner
selection、预测结果与失败结论均冻结；不得在同一窗口继续调参或建立第二个候选。
later-origin readiness audit 已授权并完成，但 2023 候选块不独立，
`metricsRead=false`、`laterOriginConsumed=false`。下一次资格审计最早等待
2026-01 origin 的标签完整到 2029-01，并要求原运行时 frozen v1 state；或者仅在
明确模型公式需要时接收历史 as-of 可审计信号。final holdout、provider、数据库、
Canary/full160、release 和 M3 formal 均未授权。

FVA 语义修复仅增加 raw/candidate/selected 报告、非恒真门禁和时间块审计，
不改变 v1.0 参数、专家结构、冻结预测路径或历史失败结论，也不授权在同一
development 窗口开发 v1.1。

## 7. 出版行业规模适配 amendment

向前的新模型修订必须遵守
`M2-forecast-intelligence-v2-publishing-scale-amendment-v0.1.md` 和
`M2-PUBLISHING-SCALE-SUPPORT-01`。

本出版社的年度新品 SKU、标准作品、版本、授权关系、账单行、月度现金行和预测 case
不得混用。当前可审计人口为 3,053 个标准作品，但没有注册的 ISBN/SKU—作品—版本
权威，不能把 distinct work 解释为年度新品 SKU。

固定 `50/100` 作品门槛继续属于历史渠道时间生成实验；新的出版行业适配版本必须
使用 `DIRECT_FIT`、`SHRUNK_FIT`、`POOLED_PARENT`、`REPORT_ONLY` 四级支持、
作品聚类有效样本量、现金集中度、时间正确的训练侧学习曲线和连续 partial pooling。

三级分类只有 current-only assignment 且没有历史 `effectiveAt/availableAt`，
当前只能报告；已观察作品—渠道现金关系不是授权关系。缺少 as-of 权威时禁止把分类
或授权回填到 forecast origin。

小样本节点可以进入低维、强收缩的开发检验，但训练资格不等于模型晋升资格。禁止
为了保留旧人口把弃权写成 0，也禁止从其他行业移植未经本项目证据验证的样本门槛。

本 amendment 不改写历史模型、配置、分数或阻断；也不授权 outer outcome、
sealed holdout、later-origin、production 或 release。
向前实现身份冻结为出版行业适配的渠道月度发生—条件金额核心
（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，
`M2-CHAN-PSC01`，`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`），其运行配置为
`config/m2-current-publishing-scale-channel.v0.1.json`。该身份不改写历史
`M2-CHAN-GEN02`，也不改变作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）的运行回退角色。
