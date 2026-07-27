# M2 channelExperts v0.1 architecture failure audit

日期：2026-07-27

范围：PR #28，冻结 A0–A6 architecture failure audit

状态：`BOUNDED_ARCHITECTURE_FAILURE_AUDIT_COMPLETE`

## 1. 结论先行

本审计选择唯一架构结论：

```text
CHANNEL_EXPERT_V01_IMPLEMENTATION_MISMATCH_CONFIRMED
```

并选择唯一后续决定：

```text
PREREGISTER_GENERATIVE_V02
```

这个决定只支持**预注册**一个能真正检验渠道生成机制的 v0.2，不授权实现、训练、
调参或选择 v0.2。它也不证明原渠道生成理论正确。它证明的是：v0.1 没有把该理论
实现成独立的渠道时间生成器，因此冻结的 v0.1 失败不能解释为对生成理论本身的
充分否定。

代码和冻结 rows 给出的共同结论是：

- v0.1 的 A2–A6 均从 learnedGlobal 已经生成的逐渠道正向现金分量出发；
- 每一层只对该分量应用机制 factor 和一个金额 calibration scale；
- membership、advertising、transactional 都没有独立 occurrence、conditional
  amount、horizon curve、spike/long-tail 或 time-varying work residual；
- taxonomy 在 A5 是 `actualPositive/rawPrediction` 的直接金额修正，在 A6 是
  围绕父级金额 scale 的 shrinkage；它不是生成器参数的 prior；
- common reversal 在所有 ablation 最后统一应用。

第一处 WAPE 恶化已经出现在 `A1→A2`：

| 窗口 | 绝对误差增加 | WAPE 增量 | bias 增量 |
|---|---:|---:|---:|
| primary | 3,929,389.84 | +0.8707 个百分点 | +8.1144 个百分点 |
| strict | 3,280,684.74 | +0.6552 个百分点 | +2.2351 个百分点 |

但主导最终失败的层不同：

- primary 的最大增量来自 `A4→A5` taxonomy 直接金额修正：
  绝对误差增加 54,966,684.86，WAPE 增加 12.1798 个百分点；
- strict 的最大增量来自 `A2→A3` mechanism scale：
  绝对误差增加 64,254,366.70，WAPE 增加 12.8330 个百分点；之后 A4 和 A5
  又分别增加 22,783,523.77 和 35,664,183.75。

primary 与 strict 的最终 `A1→A6` 绝对误差净增加分别约为
44.02 百万和 123.54 百万。全部预测变化在机械上都由 level rescaling 产生；
rows 不支持把最终增加唯一拆成相互独立的 horizon、occurrence、taxonomy 和
fallback 因果比例。下文只报告可审计的重叠关联，不把关联冒充因果分解。

冻结决定继续有效：

```text
CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3
```

## 2. 输入、receipt 与边界

审计没有重跑训练，也没有调用原 private development runner。它只读取现有
`channelExperts.js`、materializer/runner、tracked development evidence 和冻结的
395,904 条 private evaluation rows，执行确定性代数归因。

| Receipt | 值 |
|---|---|
| 冻结 evaluation row | 395,904 |
| work row | 86,359 |
| work-channel row | 309,545 |
| evaluation SHA-256 | `aee288069e2cee728d26797df24c48f186e9083c49235f9e4c77ccc0e74922fd` |
| primary supplement SHA-256 | `fd7e4ea011125480e1870befa6e5622493052db9c4c2305f1344bae00c4ac1c5` |
| auxiliary supplement SHA-256 | `0838fa02847fe6f417f432e07c3d1f79f3943152049320021180f8cd78ba9ed5` |

派生的逐 row 诊断和含 private taxonomy 值的 cell 诊断保存在新的 Git-ignored
capability 目录：

```text
data/private-output/m2-current-channel-experts-architecture-audit/
```

公开 JSON 保留全部 aggregate slice，但不含作品 ID、channel UID 或作品分类值。
所有 post-hoc 诊断都固定为：

```text
postHoc=true
selectionEligible=false
modelUpgradeEvidence=false
```

## 3. A0–A6 的精确方程

令：

- `B[w,c,o,h]` 为 learnedGlobal 对 origin 已观察渠道 `c` 生成的
  `forecast36 × h/36` 正向现金分量；
- `F[m]` 为机制 raw factor；
- `S[node]` 为当前层选中的单一金额 scale；
- `R[w,o,h]` 为共享 human-anchored reversal rate。

所有 work 级点预测最终都使用：

```text
workPoint(Ak) =
  (1 - R[w,o,h])
  × Σ(origin 已观察渠道 c 的 positivePoint(Ak,w,c,o,h))
```

未来首次出现的渠道只保留 label，所有 A0–A6 预测均为 0。

| Ablation | 逐渠道 positive point |
|---|---|
| A0 | `B`，直接 learnedGlobal work baseline |
| A1 | `B`，只做逐渠道精确分解与重组 |
| A2 | `B × F[mechanism]` |
| A3 | `B × F[mechanism] × S[mechanism, κ=80]` |
| A4 | `B × F[mechanism] × S[platform×mechanism, κ=80]` |
| A5 | `B × F[mechanism] × S[taxonomy, unshrunk]` |
| A6 | `B × F[mechanism] × S[taxonomy, selected κ]` |

其中固定 A3/A4 的 `κ=80` 是 `{20,80,240}` 的中位数。A6 的 `κ` 才在每个 outer
training 内部由 deterministic inner-work holdout 选择。

机制 factor 为：

```text
membership:
  clamp(0.75 + 0.25 × recent3Annual / trailingAnnual, 0.25, 2)

advertising:
  clamp(sqrt(leave-one-work-out peerTrendRatio), 0.25, 2)

transactional:
  clamp(exp(-monthsSinceLastPositive / 12), 0.1, 1)

other:
  1
```

支持节点的 hierarchical scale 为：

```text
priorExposure = κ × max(mean(rawPrediction), 1e-9)

S[node] = clamp(
  (actualPositive[node] + priorExposure × S[parent])
  / (rawPrediction[node] + priorExposure),
  0.1,
  4
)
```

A5 支持 taxonomy cell 时不 shrink：

```text
S[taxonomy, unshrunk] =
  clamp(actualPositive[taxonomy] / rawPrediction[taxonomy], 0.1, 4)
```

这些层不是 `A3 × platform factor × taxonomy factor` 的连续乘积。A4、A5、A6
都回到 `B × F`，再各自选择一个 composite scale；父级信息通过 shrinkage center
传入。无论是否连续相乘，最终改变的仍只是 learnedGlobal 渠道分量的金额 level。

## 4. 代码路径

| 路径 | 作用 |
|---|---|
| `src/domain/m2Current/humanAnchored.js:15-140` | learnedGlobal 逐渠道历史、main/edge allocation、作品年龄与线性 horizon scale |
| `src/domain/m2Current/channelExperts.js:46-111` | learnedGlobal 渠道分解与 raw factor |
| `src/domain/m2Current/channelExperts.js:610-690` | A0–A6 方程 |
| `src/domain/m2Current/channelExperts.js:694-788` | fallback、shrinkage 与 clamp |
| `src/domain/m2Current/channelExperts.js:791-823` | 三类机制 scalar factor |
| `scripts/m2-current/materialize_human_anchored_cases.py:406-570` | origin-only 渠道历史与 leave-one-work-out peer trend |
| `scripts/m2-current/materialize_human_anchored_cases.py:647-923` | work-channel label、future-first-seen exclusion 与三项守恒 |
| `scripts/m2-current/channel_experts_mode.mjs:54-173,418-499` | 冻结 evaluation rows 与 digest receipts |
| `scripts/m2-current/run_m2_human_anchored_development.mjs:46-51,66-71,176-185` | 与 production 隔离的 runner dispatch |

production `loader.js`、`route.js` 和 API 没有导入 channel expert。

## 5. learnedGlobal 已有的渠道信息

learnedGlobal 在 v0.1 之前已经按 origin 已观察渠道读取并使用：

- 渠道近 12 个月正向现金；
- 渠道最新月正向现金；
- 渠道近 3 个月年化正向现金；
- 渠道累计正向现金；
- 按 trailing annual 排序后的 main/edge 身份；
- main 渠道的 stable/declining level blend；
- edge 渠道的累计历史 share；
- 作品 observed sales age 对 lifecycle contribution 的修正；
- 对所有渠道共用的 `horizonMonths/36` 线性形状。

learnedGlobal 参数在 outer training 内按 work total 正向 actual 学习，因此最终
work loss 已经反向约束这些逐渠道分量的加总。它没有直接使用平台 categorical
identity 或作品 taxonomy；peer trend 虽由 materializer 计算并在 base summary
中聚合，但不进入 `positivePointEstimate` 的 base 方程。

A0/A1 在 primary 与 strict 的最大绝对差均为 0，只证明：

```text
learnedGlobal 正向点预测可以按 origin-observed channel 精确分解和重组
```

它不证明渠道 allocation 最优，也不证明 learnedGlobal 已表达独立 occurrence、
机制专属 horizon 或未来 channel-generating process。

因此 v0.1 的关系是：**在已经 channel-aware 的 learnedGlobal 分量上再次做
recalibration**。它没有用一个不同模型替换该分量。

## 6. 逐层误差归因

### 6.1 Work 粒度总量

金额单位与冻结账单一致。`ΔAE>0` 表示新层恶化。

| 窗口 | 层 | case | ΔAE | WAPE 增量 | bias 增量 | over mass 增量 | under mass 增量 | 恶化/改善 case |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| primary | A1→A2 | 12,039 | 3,929,389.84 | +0.8707pp | +8.1144pp | +20,274,737.62 | -16,345,347.78 | 4,939 / 6,861 |
| primary | A2→A3 | 12,039 | 4,477,831.58 | +0.9922pp | -3.8991pp | -6,559,206.30 | +11,037,037.88 | 5,645 / 6,346 |
| primary | A3→A4 | 12,039 | 71,055.96 | +0.0157pp | +0.2038pp | +495,481.18 | -424,425.22 | 6,291 / 4,833 |
| primary | A4→A5 | 12,039 | 54,966,684.86 | +12.1798pp | -6.8952pp | +11,924,380.70 | +43,042,304.16 | 5,409 / 5,707 |
| primary | A5→A6 | 12,039 | -19,424,734.38 | -4.3042pp | +2.1433pp | -4,876,005.97 | -14,548,728.41 | 5,780 / 6,202 |
| strict | A1→A2 | 74,320 | 3,280,684.74 | +0.6552pp | +2.2351pp | +7,235,856.03 | -3,955,171.28 | 32,611 / 38,202 |
| strict | A2→A3 | 74,320 | 64,254,366.70 | +12.8330pp | +26.2151pp | +97,756,176.95 | -33,501,810.25 | 37,273 / 33,941 |
| strict | A3→A4 | 74,320 | 22,783,523.77 | +4.5504pp | +6.0391pp | +26,510,506.24 | -3,726,982.46 | 39,098 / 30,290 |
| strict | A4→A5 | 74,320 | 35,664,183.75 | +7.1229pp | +5.3325pp | +31,181,851.41 | +4,482,332.34 | 36,125 / 33,134 |
| strict | A5→A6 | 74,320 | -2,443,559.81 | -0.4880pp | -0.2567pp | -1,864,402.69 | -579,157.12 | 32,280 / 38,121 |

primary 的 A6 shrinkage 抵消了 A5 的一部分失败，但没有消除失败；strict 的
A6 只抵消约 2.44 百万，最终 scale center 几乎不变。

### 6.2 累计现金和 calibration

| 窗口 | actual | A1 | A2 | A3 | A4 | A5 | A6 |
|---|---:|---:|---:|---:|---:|---:|---:|
| primary | 451.295m | 395.438m | 432.058m | 414.462m | 415.382m | 384.264m | 393.937m |
| strict | 500.697m | 481.433m | 492.624m | 623.882m | 654.120m | 680.819m | 679.534m |

校准回归使用 `actual = intercept + slope × prediction`：

| 窗口 | A1 slope/intercept | A3 | A5 | A6 |
|---|---|---|---|---|
| primary | 1.0210 / 3,949.26 | 1.0396 / 1,694.95 | 1.3535 / -5,714.09 | 1.2418 / -3,146.56 |
| strict | 1.0729 / -213.14 | 0.7805 / 184.75 | 0.7552 / -181.41 | 0.7534 / -151.83 |

strict 在 A2 仍接近总量守恒；A3 的 mechanism scale 一次把预测从 492.624m
推到 623.882m，bias 从 -1.6123% 翻为 +24.6027%。这是 strict 最大的首次结构性
失真。

### 6.3 Horizon 与 time block

strict 各 horizon 的 work WAPE 增量：

| Horizon | A1→A2 | A2→A3 | A3→A4 | A4→A5 | A5→A6 |
|---:|---:|---:|---:|---:|---:|
| 3 | -0.4254pp | +6.7075pp | +3.8401pp | +4.2303pp | -0.4476pp |
| 6 | -0.1907pp | +7.2250pp | +4.4622pp | +4.9753pp | -0.5363pp |
| 12 | -0.0458pp | +10.0505pp | +5.3267pp | +6.8362pp | -0.6223pp |
| 18 | +0.7210pp | +14.5571pp | +5.0894pp | +8.2332pp | -0.5114pp |
| 24 | +2.3488pp | +20.1538pp | +3.4345pp | +8.7852pp | -0.2992pp |

`A2→A3` 在 11 个 strict origin/time block 全部恶化，WAPE 增量从
2025-09 的 +2.0990pp 到 2023-09 的 +17.6210pp；`A4→A5` 也在 11 个 block
全部恶化。primary 的 A4→A5 在 13 个 origin 全部恶化，范围为
+10.4475pp 至 +13.8578pp。

在 strict 的 57,506 个多 horizon work-origin-channel group 中：

- 55,832 个 group 的 A6/A1 factor 跨 horizon 完全不变；
- 10,808 个 group 的实际 residual 方向跨 horizon 改变；
- 这 10,808 个 group 全部仍复用同一个 factor，覆盖 42,256 条 channel row；
- 这些 rows 的 channel-grain `A1→A6` 绝对误差净增加 36,690,684.05，
  positive deterioration mass 为 40,376,343.89。

这说明 horizon-shape mismatch 与失败有显著关联，但现有 rows 没有一个独立
horizon generator counterfactual，因此不能把 36.69m 表述为可识别的因果份额。

### 6.4 Mechanism 与平台

channel 粒度显示，不同窗口的主导层不同：

| 窗口/机制 | 最大恶化层 | ΔAE | 该 slice WAPE 增量 |
|---|---|---:|---:|
| primary membership | A4→A5 | 51,904,593.94 | +15.2574pp |
| primary advertising | A1→A2 | 14,505,215.88 | +28.7107pp |
| primary transactional | A2→A3 | 3,632,121.64 | +40.9089pp |
| strict membership | A4→A5 | 33,184,846.99 | +8.9479pp |
| strict advertising | A4→A5 | 5,402,736.73 | +9.7311pp |
| strict transactional | A2→A3 | 54,818,842.91 | +128.9322pp |

| 窗口/平台 | 最大恶化层 | ΔAE | 该 slice WAPE 增量 |
|---|---|---:|---:|
| primary 喜马拉雅 | A4→A5 | 51,904,593.94 | +15.7842pp |
| primary 番茄畅听 | A1→A2 | 14,505,215.88 | +28.7107pp |
| primary 猫耳 | A2→A3 | 3,102,335.92 | +38.5341pp |
| primary 漫播 | A2→A3 | 529,785.72 | +64.0080pp |
| strict 喜马拉雅 | A4→A5 | 30,731,343.57 | +9.5086pp |
| strict 微信读书 | A3→A4 | 9,598,370.77 | +36.8095pp |
| strict 番茄畅听 | A4→A5 | 5,402,736.73 | +9.7518pp |
| strict 猫耳 | A2→A3 | 52,115,962.00 | +144.8688pp |
| strict 漫播 | A2→A3 | 2,692,840.06 | +41.2607pp |

猫耳 strict 的爆炸在 taxonomy 之前已经发生；它不能用于证明 taxonomy cell
本身是主因。

### 6.5 Taxonomy、fallback 与 specialist

| 窗口 | 路由 | row | A4→A5 ΔAE |
|---|---|---:|---:|
| primary | taxonomy supported | 14,223 | +56,997,379.80 |
| primary | parent/sparse fallback | 44,763 | 0 |
| strict | taxonomy supported | 99,028 | +38,732,514.08 |
| strict | parent/sparse fallback | 151,531 | 0 |

A4→A5 的 fallback 路径按代码返回父级同一 scale，因此 prediction 不变。恶化只在
taxonomy specialist 实际使用时产生。A5→A6 shrinkage 在 taxonomy-supported
rows 上分别改善 19,419,941.22 和 2,567,944.89，但没有把 A6 拉回 A4。

最终 `A1→A6` 的 channel-grain 关联为：

| 窗口 | taxonomy supported ΔAE | sparse/parent fallback ΔAE |
|---|---:|---:|
| primary | +51,603,300.87 | -40,532.09 |
| strict | +125,374,022.94 | +7,266,443.31 |

因此失败不主要来自 sparse fallback。primary 的 taxonomy 爆炸主要来自大规模
喜马拉雅 taxonomy rows；strict 也主要来自喜马拉雅、番茄畅听和微信读书。

小平台的冻结训练支持度如下：

- primary outer fold 中猫耳有 269–326 training rows、32–41 works；漫播只有
  16–43 rows、3–6 works，始终 platform-sparse；
- strict 中猫耳有 309–2,656 rows、46–59 works；漫播有 34–555 rows、
  6–21 works，只在较晚 origin 达到 platform 支持阈值；
- primary 漫播 43 evaluation rows 全部回退 mechanism；猫耳 190 条采用
  taxonomy、189 条回退 platform×mechanism；
- strict 漫播 367 条采用 taxonomy、195 条回退 mechanism；猫耳 1,931 条采用
  taxonomy、231 条回退 platform×mechanism。

冻结 receipt 没有保存每个 taxonomy training cell 的 row/work count，因此精确
taxonomy effective sample size **不可识别**，本审计没有重新 fit 来补造。公开 JSON
报告已有的 platform training range 和 evaluation routing counts。

### 6.6 Top revenue、prediction decile 与 factor decile

| 窗口 | 最终全部 ΔAE | top 1% ΔAE | top 5% ΔAE | top 10% ΔAE |
|---|---:|---:|---:|---:|
| primary | 约 44.02m | 39.307m | 44.280m | 44.466m |
| strict | 约 123.54m | 61.520m | 115.050m | 119.988m |

top 5%/10% 可超过最终 net delta，因为非头部 rows 有抵消性改善。按 A1 baseline
预测规模分十分位：

- primary 最高十分位贡献约 44.765m 的最终净恶化，低九十分位合计略有改善；
- strict 最高十分位贡献约 122.407m，占最终净恶化约 99.1%。

按 applied-factor 十分位：

- strict `A2→A3` 最高十分位单独增加 59.601m，占该层 64.254m 的约 92.8%；
- primary `A4→A5` 的恶化不只来自最大 factor；第三十分位增加 43.563m，
  最高十分位增加 9.470m。这与大额作品被向下重标和少量高 factor 上推同时发生
  一致。

公开 JSON 保留每层、每个 baseline decile 和 factor decile 的金额、WAPE、bias、
over/under mass 与 row count。

## 7. Factor、clamp 与 scale 诊断

### 7.1 分布

| 窗口/Factor | identifiable | median | p95 | max | mean | baseline-weighted mean | SD | upper clamp |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| primary raw expert | 26,622 | 1.000 | 1.750 | 2.000 | 1.138 | 1.093 | 0.365 | 1,415 |
| primary mechanism scale | 26,622 | 0.988 | 0.997 | 1.838 | 0.944 | 0.964 | 0.133 | 0 |
| primary platform×mechanism scale | 26,622 | 0.984 | 0.999 | 2.034 | 0.944 | 0.967 | 0.139 | 0 |
| primary taxonomy scale A5 | 26,622 | 0.977 | 2.016 | 4.000 | 1.010 | 0.883 | 0.558 | 516 |
| primary selected scale A6 | 26,622 | 0.966 | 1.866 | 4.000 | 1.014 | 0.908 | 0.512 | 516 |
| strict raw expert | 203,979 | 0.953 | 1.750 | 2.000 | 1.051 | 1.023 | 0.322 | 2,709 |
| strict mechanism scale | 203,979 | 1.119 | 1.240 | 3.412 | 1.128 | 1.268 | 0.145 | 0 |
| strict platform×mechanism scale | 203,979 | 1.126 | 1.678 | 3.995 | 1.177 | 1.326 | 0.270 | 0 |
| strict taxonomy scale A5 | 203,979 | 1.138 | 1.985 | 4.000 | 1.242 | 1.378 | 0.408 | 1,396 |
| strict selected scale A6 | 203,979 | 1.138 | 1.883 | 4.000 | 1.233 | 1.376 | 0.368 | 618 |

另有 primary 32,364 条、strict 46,580 条 channel rows 因分母为 0 而无法从冻结
prediction 反推出 factor，均标为 unidentifiable。

clamp 命中不是主因：mechanism/platform scale 没有命中 0.1/4 边界；primary A5
上界命中 1.94%，strict A5 为 0.68%，strict A6 降至 0.30%。即使不在 clamp
边界，exposure-weighted center 已经产生大额偏移。

### 7.2 Factor 与目标的关系

primary A6 factor 与 baseline prediction、actual、baseline residual 的 Pearson
相关分别为 `-0.0126 / -0.0108 / 0.0065`；strict 分别为
`0.0182 / 0.0156 / -0.0017`。它与实际和 residual 的线性对齐几乎为 0。

strict mechanism scale 与 horizon 的相关为 0.1974，A6 scale 为 0.0741；但在同一
work-origin-channel 的多个 horizon 上 factor 实际保持不变，无法追踪实际 residual
方向变化。

### 7.3 Shrinkage 是否修复 biased center

- primary taxonomy factor SD 从 0.5579 降至 0.5117，但 exposure-weighted mean
  只从 0.8826 移到 0.9078；A6 仍把头部现金向下压；
- strict SD 从 0.4085 降至 0.3676，但 weighted mean 从 1.3782 仅变为 1.3762；
  预测总量从 680.819m 仅降到 679.534m，而 actual 为 500.697m。

因此 shrinkage 降低了 variance，却保留了 biased center。

## 8. 是否建模了机制专属时间生成

| 能力 | membership | advertising | transactional |
|---|---|---|---|
| 独立 occurrence process | 否 | 否 | 否 |
| 独立 conditional amount | 否 | 否 | 否 |
| 机制专属 horizon curve | 否 | 否 | 否 |
| short/long memory 分离 | 否 | 否 | 否 |
| spike basis | 否 | 否 | 否 |
| long-tail basis | 否 | 否 | 否 |
| time-varying work residual | 否 | 否 | 否 |
| 实际实现 | recent/trailing scalar | peer-trend scalar | recency-decay scalar |

transactional 的指数衰减看似时间函数，但它只生成一个跨 horizon 复用的 level
factor，不生成购买发生、短期 spike 和长期 tail。advertising 的 peer trend
同样只是乘数，不是 occurrence × conditional amount。membership 没有 channel
future share curve。

所以 v0.1 实现的是：

```text
mechanism-specific parameters inside scalar factors
```

而不是：

```text
mechanism-specific future channel-revenue generators
```

## 9. Taxonomy 是 prior 还是直接金额修正

结论明确：

- A5：直接金额修正；
- A6：对直接金额修正 scale 做 hierarchical shrinkage；
- category 决定使用哪个金额 ratio 节点；
- fallback 只换父级 scalar，不换模型家族；
- taxonomy 没有进入 occurrence、conditional amount、horizon 或 generator
  parameter distribution。

因此当前 taxonomy/shrinkage 代码不能原样用于 generative v0.2。若 v0.2 进入
预注册，taxonomy 只能成为 generator 参数的 hierarchical prior，不能再次成为
最终金额的 category multiplier。

## 10. 可复用与应退役资产

| 资产 | 分类 | 处理 |
|---|---|---|
| work-channel materialization | `REUSE_UNCHANGED` | 保留 |
| positive/reversal/net 三项守恒 | `REUSE_UNCHANGED` | 保留为强门禁 |
| future-first-seen exclusion | `REUSE_UNCHANGED` | 保持零预测和无身份泄漏 |
| canonical platform mapping | `REUSE_UNCHANGED` | 保留路由身份 |
| mechanism taxonomy | `REUSE_UNCHANGED` | 只作生成器语义路由 |
| content taxonomy | `REUSE_AFTER_CORRECTION` | 只作 prior，并保留 available-at 限制 |
| learnedGlobal channel decomposition | `REUSE_UNCHANGED` | 作为 G0、守恒 comparator 和 unsupported fallback |
| A0–A6 evaluation harness | `REUSE_AFTER_CORRECTION` | 保留 split/scoring，改成 G0–G6 语义 |
| nested work folds | `REUSE_UNCHANGED` | 保留 |
| 当前 scalar shrinkage | `RETIRE_FROM_NEXT_CANDIDATE` | 不得作为 v0.2 generator hierarchy |
| factor/calibration 实现 | `RETIRE_FROM_NEXT_CANDIDATE` | 不再对 learnedGlobal component 做后置倍率 |
| 三个 raw mechanism factor | `DIAGNOSTIC_ONLY` | 只保留解释 v0.1 |
| 五平台 scalar partial pooling | `RETIRE_FROM_NEXT_CANDIDATE` | 不得冒充平台生成模型 |
| common reversal | `REUSE_UNCHANGED` | 本审计无相反证据 |
| public/private reporting | `REUSE_AFTER_CORRECTION` | 增加 generator component 诊断，保持 aggregate-only |

## 11. Generative v0.2 预注册要求

`PREREGISTER_GENERATIVE_V02` 只表示有充分证据写一个可证伪的设计合同。预注册必须
满足：

```text
channel generator replaces named learnedGlobal channel component
not learnedGlobal channel component × multiplier
```

- membership：独立 channel future curve/share process；
- advertising：occurrence × conditional amount，采用较短 memory；
- transactional：purchase occurrence × short spike × long tail；
- taxonomy：generator parameter 的 hierarchical prior，不直接乘金额；
- 小平台：parent mechanism generator + bounded platform deviation；
- other channel 与 unsupported cell：原样回退 frozen learnedGlobal channel
  component；
- v0.2 不预测 future-first-seen channel；
- common reversal 保留，除非新的预注册证据明确反对；
- 不得从本次 audit outcome 反推参数值。

最小 ablation：

```text
G0 frozen learnedGlobal channel component
G1 independent membership generator
G2 independent advertising generator
G3 independent transactional generator
G4 parent-plus-platform deviation
G5 taxonomy-prior hierarchy
G6 named-channel replacement plus unchanged fallback
```

这些要求只定义可检验的结构，不构成 v0.2 开发授权。

## 12. Go / no-go

| 事项 | 决定 |
|---|---|
| v0.1 冻结失败结论 | 保持 |
| learnedGlobal | 保持 |
| exact v0.3 fallback | 保持 |
| 当前 scalar channel expert | 不进入下一候选 |
| Generative v0.2 | 允许后续单独预注册；本任务不实现 |
| 新训练/调参/selection | `NO-GO` |
| production route/API | `NO-GO` |
| later-origin/final holdout | `NO-GO` |
| Canary/full160/release | `NO-GO` |

最终不变量：

```text
currentDecision=CANARY_FAIL
automationDecision=AUTOMATION_BLOCKED
modelTrainingAuthorized=false
candidateSelectionAuthorized=false
frozenV01DecisionUnchanged=true
learnedGlobalRetained=true
exactV03FallbackRetained=true
productionRouteModified=false
newCandidateTrained=false
finalHoldoutOpened=false
releaseAuthorized=false
```

全部 aggregate 数值、slice counts、factor decile、origin、fallback 和 receipt
字段见同目录
`M2-current-channel-experts-architecture-failure-audit-v0.1.json`。
