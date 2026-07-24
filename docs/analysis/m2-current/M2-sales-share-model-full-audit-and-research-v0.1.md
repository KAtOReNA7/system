# M2 仅分成收入模型全库审计与跨行业研究 v0.1

状态：`CURRENT TECHNICAL DIRECTION — DEVELOPMENT EVIDENCE ONLY`

审计日期：2026-07-25

## 执行结论

M2 的业务方向已纠正，但当前仍不具备成熟的作品级收入预测能力。

- 当前唯一预测目标是未来分成收入现金；全部买断现金均在模型外。
- 目标迁移没有改变 7,851 个冻结 case 的数值标签，因此不会自动改善 WAPE。
- 作品级 WAPE 为 0.50557140，intermittent 为 0.90732841，dormant 为
  1.00018361，距离可用仍很远。
- portfolio development WAPE 为 0.11681934，优于同窗口 seasonal-naive
  的 0.21217335，但它只有 12 个 development origins、30 个
  origin×horizon cells，不能代替独立 holdout。
- 当前正确方向不是继续堆叠同一批输入上的候选算法，而是先建设严格 as-of
  的分成事件事实层、到账成熟度层和作品可得信号，再分别开发 portfolio
  预测与作品分配/排序。

因此，上一步“隔离买断”的指令在业务语义、可审计性和跨电脑可移植性上是正确的；
它不能解决精度问题，是因为当前冻结标签原本就没有混入可预测买断。若把它理解成
“删掉买断后 WAPE 必然下降”，这个因果假设则不成立。

## 目标迁移的量化证据

当前每个 case 满足：

```text
salesShareCashActual
+ isolatedBuyoutCashActual
+ isolatedOtherCashActual
= totalLedgerCashActual
```

| 证据 | 冻结评估 | 稠密逐月诊断 |
|---|---:|---:|
| case 数 | 7,851 | 56,856 |
| 数值标签改变 | 0 | 0 |
| 隔离买断现金 case 求和 | 4,800,850.1534 | 11,578,794.9998 |
| 分成现金 case 求和 | 79,634,996.3352 | 470,865,214.3204 |
| 分成现金/重叠 case 账单现金 | 0.94314204 | 0.97599971 |
| 分类不确定 case | 1 | 6 |
| 分类不确定绝对金额 | 230.38 | 1,382.28 |
| 最大守恒误差 | 5.82e-11 | 2.33e-10 |

这些金额是重复 work-origin-horizon case 的评估求和，不是公司或全库经济总额。
冻结不确定项是同一笔 -230.38 元调整在一个冻结 case 中出现；它可能是分成退款，也
可能是买断冲回。缺少权威 cash type 时，零容忍门禁保持失败，不允许为通过门禁而
猜测分类。

## 模型状态

### 不同决策粒度必须分开

| 粒度/模型 | WAPE | signed bias | 结论 |
|---|---:|---:|---|
| B4 作品 case | 0.55648454 | 0.08910997 | comparator |
| v0.6 作品 case | 0.50557140 | -0.01198958 | FAIL |
| v0.6 dense 作品 | 0.46372935 | 0.02439915 | 局部可学习但未过总门禁 |
| v0.6 intermittent 作品 | 0.90732841 | -0.15945405 | FAIL |
| v0.6 dormant 作品 | 1.00018361 | -0.99972006 | FAIL |
| seasonal-naive portfolio | 0.21217335 | -0.19566080 | comparator |
| v0.6 portfolio development | 0.11681934 | -0.04876300 | DEVELOPMENT PASS |

作品级与 portfolio 数值不能横向当成同一任务排名。后者受聚合误差抵消影响，回答
“总盘子有多少”；前者回答“钱属于哪些作品”。portfolio 通过不证明作品分配、
排序或单书预测已经成熟。

### 当前误差的主要结构

1. 目标极重尾：冻结 case 的中位数仅 193.30，P99 为 168,563.65，
   变异系数 10.10。
2. 现金高度集中：最大的约 1% case 承担约 51.73% 绝对现金和 30.38%
   绝对误差；最大的约 10% case 承担约 91.44% 绝对现金。
3. dormant 与 intermittent 不是普通的同方差回归问题；“是否再次发生收入”和
   “发生时金额多大”是不同随机过程。
4. 现有信号主要来自历史现金自身，缺少严格记录可得时间的上架、渠道覆盖、曝光、
   销量、价格、促销、版权状态等作品级驱动。
5. 账单存在报告/到账延迟。若不保存每个 cutoff 当时可见的快照，成熟后的账单会
   泄漏到历史特征或标签。
6. 当前 2022 development window 已被多轮选择使用。继续在同一窗口调算法只能
   增加选择偏差，无法制造独立证据。

## 全库工程审计

### 范围

| 区域 | 文件数 | 文本行数 |
|---|---:|---:|
| `src` | 149 | 62,514 |
| `scripts` | 131 | 101,501 |
| `test` | 176 | 36,861 |
| `docs` | 1,118 | 197,700 |

### 已纠正

- `src/domain/m2Current/**` 继续是唯一 canonical core；v0.6 扩展现有 runner，
  没有新增平行 runtime。
- pure-buyout 始终 null abstain；mixed 只预测分成现金；cutoff commitment
  不再解锁买断预测点。
- rating 仍可展示买断历史上下文，但明确 `notCashForecast=true`。
- 配置使用受限的继承加载器，拒绝 `config` 目录逃逸、非 JSON 和继承环，减少
  v0.5/v0.6 配置复制。
- 公共输出不含作品标识、原始账单、private 路径或 private 数据行。
- `s1-source-evidence-authenticity-private-v0.1.json` 仍只属于退役历史能力；
  clone、安装、lint、build、公共测试、smoke、server 和公共 M2 诊断均不依赖它。
- `package.json` 的 254 个 scripts 继续由 command-lifecycle 的 current、
  archive-only、restricted 规则覆盖；没有复制历史 runner 作为新入口。
- GitHub Actions 从 Node 20 运行时的旧 action majors 升到 Node 24 majors，
  Linux/Windows 使用同一公共门禁。
- 仓库只有 `main` 和本轮活动分支；没有开放 PR、额外 worktree 或可安全删除的
  过期远端分支。

### 保留而不删除

- B0–B8、C1–C3 与 v0.1–v0.5 输出属于不可变审计重放证据。它们不是当前开发入口，
  但删除会破坏 digest、历史复验和 PR authority。
- 当前 runner 较大，因为要保持旧 schema 的 exact replay。现阶段拆成另一个 runner
  会扩大平行路线风险；后续只允许把无状态计算抽成 canonical library，并保持
  golden replay parity。
- private input/output 目录和 capability pack 必须继续 Git ignored。正确方案是
  核心开发不依赖它们，不是向 GitHub 上传真实私有材料或伪造替代品。

## 本轮新检索得到的跨行业方法

完整、机器可读来源登记在
`M2-sales-share-forecast-research-sources-v0.1.json`。本轮在完成本地审计后重新
检索，并排除了仓库已使用的 M5、MinT、ADIDA、DeepAR 等既有引用。

| 成熟领域 | 可迁移方法 | 对 M2 的限制条件 |
|---|---|---|
| 保险准备金 | origin×development-lag 三角、标准误 | 先有历史可见性快照，不能用最终账单倒填 |
| 电力负荷 | 概率分布、组合、残差模拟、滚动发布 | 必须按 horizon 校准，不能只报 WAPE |
| 酒店/航空收益管理 | booking/maturity curve 动态更新、删失识别 | 到账晚不是零需求；可见与最终需分开 |
| 非合约客户价值 | purchase occurrence 与 latent inactivity 分离 | dormant 不能直接当永远为零 |
| 保险定价/美元结果 | Poisson frequency + Gamma severity/Tweedie | Tweedie 仅支持非负过程，退款要单独建模 |
| 间歇需求 | renewal/arrival-time 过程 | 必须与 Croston/SBA/TSB 作强基线比较 |
| 流行病预测 | WIS、覆盖率、sharpness、按 horizon 评价 | 区间必须用 proper score，不能人为放宽 |
| 时间序列理论 | rolling origin、依赖下的 conformal、结构发现 | exchangeable split 和普通随机 K-fold 无效 |
| 层级预测 | 时间/横截面概率 reconciliation | portfolio 与 works 总和必须逐样本保持一致 |

关键来源：

- [Mack：准备金三角标准误](https://www.cambridge.org/core/journals/astin-bulletin-journal-of-the-iaa/article/distributionfree-calculation-of-the-standard-error-of-chain-ladder-reserve-estimates/E8D207F9A4DCE30300A76780FE510437)
- [GEFCom2014 概率负荷获胜方案](https://www.sciencedirect.com/science/article/pii/S0169207015001405)
- [酒店 booking horizon 动态更新](https://www.sciencedirect.com/science/article/pii/S0169207011000100)
- [客户活跃/复购概率模型实证比较](https://www.sciencedirect.com/science/article/pii/S0167811607000171)
- [零值美元结果的 compound Poisson-Gamma](https://www.cambridge.org/core/journals/political-analysis/article/compound-poissongamma-regression-models-for-dollar-outcomes-that-are-sometimes-zero/21FBA865FCD63ADEB0AD25643DB4141F)
- [间歇序列的 probabilistic renewal framework](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0259764)
- [时间序列 adaptive conformal](https://arxiv.org/abs/2202.07282)
- [区间预测 WIS](https://pmc.ncbi.nlm.nih.gov/articles/PMC7880475/)
- [时间层级 reconciliation](https://robjhyndman.com/publications/temporal-hierarchies/)
- [Diebold：预测比较检验的适用边界](https://www.nber.org/papers/w18391)

## 建议的数学模型

### 1. 事实过程

对作品 \(i\)、origin \(o\)、未来月份 \(t\)，先建立不可变事件：

\[
Y_{i,t}=S_{i,t}-R_{i,t}
\]

其中 \(S\ge 0\) 是分成入账，\(R\ge 0\) 是分成退款/冲回。买断 \(B\) 永远不在
\(Y\) 中。每个事件必须有 `economic_period`、`posted_at`、`available_at`、
`cash_type` 与来源摘要；训练只能使用 `available_at <= origin` 的行。

### 2. 作品级 occurrence–amount–adjustment

\[
P(N_{i,t}>0\mid\mathcal F_o)
=\operatorname{logit}^{-1}(\eta_{i,t})
\]

\[
N_{i,t}\mid N_{i,t}>0 \sim
\text{renewal/zero-truncated count},\quad
A_{i,t,j}\sim\text{Gamma or LogNormal}
\]

\[
S_{i,t}=\sum_{j=1}^{N_{i,t}}A_{i,t,j}
\]

退款/冲回用单独的发生概率和 severity 过程生成 \(R\)，不能把带负数的净现金硬塞
进非负 Tweedie。最终通过 Monte Carlo 得到 \(Y\) 的 quantiles、零概率与负调整风险。
模型采用 segment/global partial pooling，作品级随机效应必须收缩，禁止为每本书
单独拟合高方差参数。

### 3. portfolio 状态空间

portfolio 是独立 capability。用局部水平、阻尼趋势、季节项和可检测 change point
构成状态空间候选；现有 Holt-Winters 继续作强基线。输出每月 joint samples，再聚合
到 3/6/12/18/24 月，而不是分别训练互相矛盾的 horizon point。

### 4. 成熟度与层级

- 用 `origin × posting/development lag` 三角估计“当时已看到多少最终分成现金”。
- portfolio predictive samples 向 segment/work allocation 下分，并在每个 sample
  中保持加总一致。
- works 无可靠可得信号时必须 abstain 或只做排序/风险带，不能把 portfolio 精度
  冒充单书精度。

### 5. 评价函数

每个 rolling origin 同时报告：

- point：WAPE、signed bias、MASE/RMSSE、horizon/segment/origin 分层；
- probabilistic：pinball、WIS/CRPS、50%/80%/95% coverage 与 interval width；
- occurrence：Brier/log loss、precision-recall、零/非零校准；
- business：portfolio FVA、top-cash risk coverage、abstention coverage、
  allocation/ranking loss；
- stability：later-origin、change-point 前后和 paired cluster bootstrap。

WAPE 只是一个 point loss。它不能评价区间校准、错误发生在哪些作品、排序是否可用，
也不能证明未来稳定性。

## 必须按顺序执行的后续开发

### D0：目标分类闭环

由账单权威来源判定 -230.38 的 `cash_type`，保留变更前后摘要。无法判定则继续
abstain，`maximumClassificationUncertainCashShare=0` 不下调。

### D1：as-of 分成事实层

新增版本化 `revenueShareFact` 与 `availabilitySnapshot`：

- sale、refund、reversal 分开；
- economic/posting/availability 时间分开；
- channel、currency、work、source lineage 可审计；
- 缺失历史快照时明确 `unknown_at_origin`，禁止使用最终状态回填。

这是当前最高优先级，也是成熟模型的前置条件。

### D2：冻结现有模型选择窗口

2022 development window 只作回归重放。新数据准备好后，预先注册：

- train/calibration/later-origin development；
- gap/embargo 与标签成熟期；
- 作品、origin、horizon 的 cluster bootstrap；
- 决策粒度与阈值。

在获得单独授权前 final holdout 继续 sealed。

### D3：最小候选族

只实现三个可解释候选，避免再次扩张模型动物园：

1. portfolio structural state-space/ETS ensemble；
2. work-level dynamic two-part frequency–severity–adjustment；
3. booking/triangle maturity adjustment + hierarchical probabilistic reconciliation。

renewal、Tweedie、TFT 只作 challenger；必须逐层击败 seasonal-naive、现有
portfolio、Croston/SBA/TSB/ADIDA，且计算 forecast value added。

### D4：能力拆分

分别给出门禁：

- `portfolio_cash_forecast`；
- `work_cash_allocation_or_ranking`；
- `work_point_forecast`；
- `abstention_and_interval_service`。

前一项通过不自动授权后一项。作品级成熟仍要求总 WAPE ≤ 0.30、各 segment
通过、bias/interval calibration 通过，并在未参与选择的 later-origin 或单独授权
holdout 上复现；portfolio development pass 只能保持 development 声明。

### D5：自动化和发布

只有目标分类、数据 lineage、later-origin、独立 holdout、概率校准、业务损失和
portable public CI 全部通过后，才讨论 Canary/full160、release 或 M3 formal。
人工不提供数字基线，只在门禁之后检查异常样本和业务可解释性。

## 当前授权边界

本报告不打开 provider、远端/共享/staging-like 数据库、final holdout、
Canary/full160、release 或 M3 formal。当前允许的结论只有：

> M2 已完成“仅分成收入”目标合同迁移，并存在一个 portfolio development
> backtest pass；作品级预测、独立验证、自动化和发布均未成熟。
