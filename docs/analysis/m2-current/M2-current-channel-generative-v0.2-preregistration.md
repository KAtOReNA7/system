# M2 Channel Generative v0.2 最小可证伪预注册

日期：2026-07-27

范围：PR #28，preregistration only

状态：

```text
GENERATIVE_V02_PREREGISTRATION_COMPLETE_IMPLEMENTATION_NOT_AUTHORIZED
```

## 1. Executive conclusion

本预注册冻结一个下一轮无需查看外层结果即可实现的最小实验合同。它分别检验：

1. `G1`：不使用 learnedGlobal 作为特征或 offset 的独立
   `occurrence × conditional amount` 渠道时间生成器；
2. `G2`：只把 frozen learnedGlobal 正向渠道分量作为 `log1p` 结构化 offset，
   另行学习机制专属动态 residual 的两部分生成器；
3. `G3`：只能在每个 outer training 内选择 raw core 和凸组合权重的保守 blend。

本轮没有实现、训练、拟合、预测或读取任何 v0.2 outcome。参数网格没有执行。
`channelExperts.js`、production loader/route/API、exact v0.3、frozen A0–A6 和
release 配置均未修改。

最终边界固定为：

```text
implementationAuthorizationRequired=true
safeToStartImplementation=false
```

预注册不把渠道生成理论预设为正确。如果按本合同实现的 G1/G2 仍不能同时通过
primary、strict、horizon、时间块、头部收入、bias 和 paired uncertainty 门，
必须接受：

```text
当前数据不支持可实现的渠道机制增量预测价值
```

不能继续无界调参，也不能用 blend、平台、taxonomy 或 fallback 掩盖 raw core
失败。

## 2. 连续谱系与 source receipt

任务开始状态：

| 字段 | 值 |
|---|---|
| repository | `KAtOReNA7/system` |
| PR | `#28` |
| branch | `codex/m2-lifecycle-aware-challenger-v0-1` |
| verified anchor | `e5bcef11dbc352d5f2a58d88bf303a8fdd30b6d3` |
| start HEAD | `e5bcef11dbc352d5f2a58d88bf303a8fdd30b6d3` |
| anchor CI | `30267683933 / success` |
| PR state | Draft / open / unmerged / mergeable |

start HEAD 与 verified anchor 相等，无中间提交需要继承。任务开始前已有的未跟踪
`output/`、`tmp/` 不属于本任务。

主要 receipt：

| Source | SHA-256 |
|---|---|
| architecture audit JSON | `b7a64a618e3d62bf9725feabacba59f3451ea6a04b7b9f8462a8fbaed0a62eb4` |
| v0.1 development JSON | `23f70e8faa48e3bf0894bf6c17f0a546781a126e1cbcd47ec9c5d21d287545f1` |
| human-anchored config | `e07054b016e032241dbb894637bef2836fbea0924a84eeed7f5e079ed1f64a74` |
| channel-experts config | `ec8777a649b1b9faa7b43e6d5e6a6d006913ce9cadef43b7fc14b88642ed3a9b` |
| frozen evaluation | `aee288069e2cee728d26797df24c48f186e9083c49235f9e4c77ccc0e74922fd` |
| frozen primary supplement | `fd7e4ea011125480e1870befa6e5622493052db9c4c2305f1344bae00c4ac1c5` |
| frozen auxiliary supplement | `0838fa02847fe6f417f432e07c3d1f79f3943152049320021180f8cd78ba9ed5` |

private receipt 只用于核对既有 schema、hash 和计数；本预注册没有读取或生成新的
v0.2 候选结果。

## 3. v0.1 mismatch 与理论状态

本预注册继承：

```text
CHANNEL_EXPERT_V01_IMPLEMENTATION_MISMATCH_CONFIRMED
```

其含义是：

- v0.1 A2–A6 从 learnedGlobal 已生成的渠道分量出发，施加 mechanism factor
  和一个金额 calibration scale；
- 没有独立 occurrence、conditional amount 或 mechanism-specific future curve；
- taxonomy 是 `actual/prediction` 金额修正及其 shrinkage，不是生成器参数 prior；
- 同一 factor 大量跨 horizon 复用；
- learnedGlobal 已使用 origin-visible 渠道近期/累计历史、渠道排序、
  main/edge allocation、作品生命周期和统一线性 horizon shape；
- v0.1 的失败说明该 multiplier 架构失配，不等于生成理论已经失败或成功。

冻结失败决定继续有效：

```text
CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3
```

## 4. Scientific question 与 hypotheses

科学问题：

> 只使用 origin 时可见的 work-channel 历史分成现金和冻结静态机制映射时，
> membership、advertising、transactional 能否通过独立时间生成过程，在
> out-of-time 评价中稳定提供 frozen learnedGlobal 之外的增量预测价值？

两个问题必须分别回答：

- G1：独立生成器是否有价值？
- G2：frozen learnedGlobal 作为结构化 offset 后，机制动态 residual 是否有价值？

待检验假设：

- `H0`：当前数据下，机制标签及时间结构没有稳定增量；
- `H1-M`：membership 具有更平滑活跃状态和较慢未来衰减；
- `H1-A`：advertising 具有更短记忆、较高波动和更强近期趋势/峰值效应；
- `H1-T`：transactional 具有稀疏 occurrence、短 spike 和长 tail。

H1-M/H1-A/H1-T 都是待证伪假设，不是事实。

## 5. Estimand、scope 与 case manifest

预测单元：

```text
work × canonical_channel × origin × horizon
```

每个生成器按以下训练粒度产生非负未来月正现金：

```text
work × canonical_channel × origin × future_month
```

唯一 key 固定为
`standardWorkId|channelUid|origin|futureMonthIndex`。一个未来月即使同时进入多个
累计 horizon，也只能物化和训练一次，权重固定为 1；评价时再累计到各 frozen
horizon。

月度期望为：

```text
P(month positive cash > 0 | origin-only features)
×
E(month positive cash | positive, origin-only features)
```

指定 horizon 的预测是月度非负点预测的累加，因此累计 horizon 必须单调不减。

冻结 case manifest：

| Family | case | work | origin/block | horizon | work-channel evaluation row |
|---|---:|---:|---:|---|---:|
| primary | 12,039 | 1,125 | 13 个相邻月 origin / 1 个时间块 | 36 | 58,986 |
| strict | 74,320 | 2,650 | 11 个季度 origin / 11 个时间块 | 3/6/12/18/24 | 250,559 |

strict horizon case 数：

| Horizon | case |
|---:|---:|
| 3 | 22,805 |
| 6 | 20,155 |
| 12 | 15,028 |
| 18 | 10,269 |
| 24 | 6,063 |

canonical master 有 74 个渠道，分成账单实际使用 39 个。三类 core mechanism
parent 为 membership、advertising、transactional。五个关注平台只作诊断，
不进入 core。

work-total 比较口径固定：

```text
候选覆盖的 observed-at-origin channel 正向预测
+ 未覆盖 channel 的 frozen G0 channel component
+ frozen common reversal
= work-total candidate forecast
```

所有 primary/strict 主门都在与 A0 完全同口径的 work-total 上计算。
work-channel 只作机制诊断与安全门。

## 6. Data authority 与 future-first-seen

唯一 cash authority 是用户人工拆分的 sales-share workbook membership：

- feature/label window：2021-01 至 2025-12；
- 正向现金与 reversal 均只来自分成账单；
- buyout、other cash、commitment 均禁止；
- pre-2021、post-2025、未成熟标签补 0 均禁止；
- common reversal 继续冻结，不在 v0.2 重拟合。

v0.2 第一阶段只预测 origin 前已有正现金历史的 canonical channel。
future-first-seen：

```text
prediction=0
identityUsedAsFeature=false
routingDifferenceContribution=excluded
```

冻结 manifest 中 future-first-seen label-only row 为 99,261。授权执行时必须分别
从冻结标签计算并报告：

- actual positive cash；
- 占 total actual positive cash 的比例；
- 对可实现上限的影响。

这些统计不得被描述成 G1/G2 相对 G0 的失败，因为所有候选与 G0 对这部分都预测
为 0。

## 7. Candidate DAG

```text
G0 frozen learnedGlobal
 ├─ G1 raw independent two-part mechanism generator
 ├─ G2 raw structured learnedGlobal-offset two-part generator
 └─ G3 training-only convex blend diagnostic

raw core pass + new authorization
 └─ G4 mechanism parent + bounded platform parameter deviation
     └─ platform incremental pass + new authorization
         └─ G5 taxonomy as generator-parameter prior
             └─ taxonomy incremental pass + new authorization
                 └─ G6 eligible generator + frozen G0 fallback composition
```

不能跳过 raw core gate 进入 G4–G6。

## 8. G0–G3 core

### G0：frozen baseline

```text
frozen learnedGlobal channel component
+ frozen common reversal
```

- 使用 frozen A1 渠道正向点预测；
- 因 source code 的 horizon shape 是线性的，月度 G0 component 固定为
  `A1 positive point / horizonMonths`；
- 不重新拟合 learnedGlobal 或 reversal；
- 继续验证逐渠道分解/重组守恒；
- source commit、config digest 和 case digest 已在 JSON 绑定。

### G1：raw independent generator

每个 mechanism parent 分别拟合：

```text
monthly occurrence probability
×
monthly conditional positive amount
```

G1 不使用 G0 作为 feature、offset 或 multiplier。它按未来月生成独立曲线；
membership、advertising、transactional 的固定 time basis 不同。

### G2：structured offset generator

occurrence 继续单独拟合。conditional amount 固定为：

```text
log1p(actual positive monthly cash)
=
log1p(frozen G0 positive monthly component)
+ mechanism-specific dynamic residual(features,t)
```

residual 用 L2 向 0 收缩，并随未来月变化。禁止：

- 聚合 `actual/prediction` ratio；
- platform/taxonomy cash multiplier；
- 重新训练 G0；
- 用同一个 residual scale 原样跨 horizon。

G1/G2 必须在完全相同 case、fold 和成熟标签上报告 raw 结果。

### G3：training-only blend

```text
G3 = alpha × G0 + (1-alpha) × inner-selected raw core
```

- raw core identity 和 alpha 只能在当前 outer training 内选择；
- alpha 网格为 `[0.5,0.75,0.9,1]`；
- tie 选择更大的 alpha；
- G1、G2 raw 和 G3 必须同时报告；
- G3 不构成理论证据，也不能成为 G4 parent；
- raw fail、blend pass 时状态固定为
  `RAW_CORE_FAIL_BLEND_ONLY_SIGNAL`，并在 core 停止。

## 9. G4–G6 后续层

本轮只预注册，不授权实现。

### G4：platform parameter deviation

```text
theta_platform = theta_mechanism + delta_platform
```

`delta_platform` 用 L2 向 0 收缩，作用于 occurrence/amount generator 参数，
不形成金额倍率。资格只看每个 outer training fold：

- 至少 100 个 distinct work；
- 至少 500 个 training row；
- 每个 frozen horizon 至少 50 个 positive target。

漫播在 v0.2 第一版不得成为 standalone generator。猫耳和漫播在 core 均进入
transactional parent；猫耳只有未来 G4 授权且逐 fold 达标后才可使用 bounded
deviation。

### G5：taxonomy parameter prior

```text
theta_taxonomy = theta_parent + delta_taxonomy
```

authority field 为 `secondLevelCategoryReportingOnly`，unknown token 为
`other_or_unknown`。逐 fold 资格：

- 至少 100 个 distinct work；
- 至少 500 个 training row；
- 至少 100 个 positive training row；
- 每个 frozen horizon 至少 30 个 positive target。

taxonomy 不能使用：

```text
forecast × taxonomy actual/prediction ratio
```

### G6：composition

只有前序 raw layer 通过时，eligible named channel 才使用 gate-passing generator；
其他 channel 原样使用 frozen G0。G6 不重新拟合，也不能倒过来掩盖 G4/G5 raw
失败。

## 10. Feature allowlist 与 denylist

allowlist 的每个字段、公式、source path、available-at 和 missing rule 已完整写入
机器 JSON。数值特征固定为：

- log recent 1/3/12 positive cash；
- log cumulative positive cash；
- positive rate 3/12；
- log recent-3 versus previous-3 trend 和 availability indicator；
- 12 月 log-positive population volatility；
- capped months since last positive；
- log historical peak 和 capped months since latest peak；
- log observed channel/work age；
- trailing-12 work share；
- deterministic channel-rank percentile；
- 3/12 月 available-month fraction；
- frozen mechanism parent；
- fixed future-month basis。

所有 rolling 特征严格截断在 origin。pre-observation 月不能补 0；窗口不足时使用
实际可见月数，并用明确 availability feature 标记。标准化 mean/SD 只能由当前
training partition 估计；zero-variance feature 标准化为 0。

core denylist 包括：

- platform identity、taxonomy identity；
- v0.1 factor、scale、`actual/prediction` ratio；
- future labels、future-first-seen identity；
- buyout/other cash/commitment；
- peer/platform proxy 和不存在的会员池、曝光、订单、净价、状态历史；
- GPT、embedding、标题猜测、相似作品；
- 看到结果后新增的 feature。

## 11. 固定模型家族与 time basis

主家族固定为 Node 24 standard-library-only 的 deterministic L2 two-part GLM，
不增加 runtime dependency。

Occurrence：

- L2 logistic；
- mean binary log loss；
- deterministic IRLS + weighted ridge + step halving；
- intercept 不惩罚；
- one-class training 使用 `(positiveCount+0.5)/(rowCount+1)`；
- 0.5 只作 precision/recall 诊断阈值，不参与金额点预测。

Conditional amount：

- 只在 positive month 上拟合 `log1p(cash)` ridge；
- loss 为 mean squared log error 加 L2 penalty；
- training-only smearing 为 `mean(exp(training log residual))`；
- 无 positive row 的 node 回退 preregistered parent，不制造零金额事实。

固定 time basis：

| Mechanism | Basis | Interactions |
|---|---|---|
| membership | `1,u=t/36,u²` | `u×log_recent_12`, `u×positive_rate_12` |
| advertising | `1,exp(-(t-1)/3),u,u²` | short×recent trend, short×volatility |
| transactional | `1,exp(-(t-1)/3),exp(-(t-1)/18)` | spike×recency, tail×log cumulative |

该 basis 是固定设计，不参与选择。G2 使用同一 basis 生成随月变化的 residual。

## 12. Exact parameter grid 与 numerical contract

raw G1/G2 各自只允许：

```text
occurrenceL2       ∈ [1, 10, 100]
conditionalAmountL2 ∈ [1, 10, 100]
```

每个 raw candidate 共 9 个组合；同一组合对三个 mechanism parent 使用相同
regularization strength。选择目标和 tie-break 依次为：

1. inner-validation work-total revenue-weighted WAPE 最低；
2. absolute signed percentage bias 最低；
3. occurrence L2 更高；
4. amount L2 更高；
5. configuration ID 字典序更小。

网格是 outcome 前冻结的小型 log-spaced structural grid，没有使用 A0–A6 slice
metric 选择任何数值。

numerical contract：

| 项目 | 固定值 |
|---|---:|
| max iterations | 200 |
| coefficient tolerance | `1e-8` |
| linear pivot tolerance | `1e-12` |
| minimum step | `2^-20` |
| per candidate/outer-fold timeout | 1,800 秒 |

不注册替代模型家族。非 one-class 的数值失败或 timeout 必须使该 outer fold
fail closed，保留 failure receipt，不能换算法或改网格重试。

platform/taxonomy future layer 的 deviation L2 网格都冻结为 `[10,100]`，但本轮
不执行。

## 13. Split 与 nesting

Primary outer：

- frozen 12,039 case；
- 5 个 deterministic work fold；
- 使用现有 FNV-1a `deterministicWorkFold(workId,5)`；
- 同一 work 不能跨 train/validation；
- G0 不重拟合。

Strict outer：

- 11 个 outer origin；
- 只使用 `origin < outerOrigin` 且 `labelAvailableAsOf <= outerOrigin` 的训练行；
- validation 只含当前 outer origin；
- 禁止 same-or-later truth；
- G0 不重拟合。

Inner：

- 5 个 work-group fold；
- salt 固定为 `\u001fchannel-generative-v0.2-inner`；
- 聚合全部 5 个 inner validation rotation；
- strict inner 只读取当前 outer origin 前可用行；
- 同一 work 的全部 origin/horizon 行归同一 inner fold。

只能在 inner 选择：

- occurrence/amount L2；
- G3 raw identity 与 alpha；
- future platform/taxonomy L2 和 eligibility；
- standardization、smearing。

outer primary/strict outcome 不参与任何上述选择。

## 14. Metrics 与 paired uncertainty

主指标：

```text
primary work-total revenue-weighted WAPE
strict work-total revenue-weighted WAPE
```

相对改善：

```text
(WAPE_baseline - WAPE_candidate) / WAPE_baseline
```

每个 raw 和 blend 必须报告：

- work-total/work-channel WAPE、AE、signed error、bias；
- 每个 horizon、primary origin、strict origin block；
- 三个 mechanism、五个平台诊断；
- top 1%/5%/10% actual-revenue work；
- head/middle/tail AE contribution；
- occurrence precision/recall、Brier、log loss；
- positive conditional-amount error；
- generator usage、fallback、future-first-seen unreachable cash；
- prediction/actual mass；
- train/validation/evaluation work、row、positive counts。

paired bootstrap：

- cluster unit 为 work；
- 同一 work 的全部 channel/origin/horizon row 一起重采样；
- primary/strict 分开；
- 2,000 次；
- seed `2026072702`；
- 固定 empirical quantile rule；
- 失败后不得更换 unit、seed 或次数。

## 15. Core gates

G1 或 G2 至少一个 raw candidate 必须逐项全部通过：

| Gate | 规则 |
|---|---|
| primary relative WAPE | `>=1%` |
| strict relative WAPE | `>=1%` |
| strict origin blocks | 至少 6/11 改善 |
| horizons | 36、3、6、12、18、24 中至少 4/6 改善 |
| any horizon harm | 不得低于 `-1%` |
| top 10% | 改善至少 1% |
| top 1% / 5% | 各自不得低于 `-1%` |
| primary/strict absolute bias | 各自相对 G0 恶化不超过 1 个百分点 |
| primary/strict bootstrap lower 95 | 各自 `>=-1%` |
| observed-channel row usage | primary/strict 各至少 20% |
| actual-positive-cash usage | primary/strict 各至少 20% |
| covered-channel rows | primary/strict WAPE 均不得恶化 |
| evidence form | 必须是 raw，不得依赖 G3 或 post-hoc fallback |

机制安全人口：

```text
distinct work >=100
evaluation row >=500
positive target row >=100
```

至少两个足够人口的 mechanism 在 primary/strict 都不得恶化超过 1%。任何实际
正现金占比达到 5% 的 mechanism 都不得恶化超过 1%。小样本机制只报告 interval
和 fallback。

没有 raw core 通过时：

```text
GENERATIVE_V02_CORE_FAIL
```

立即停止 G4–G6。如果 G1 通过，它是后续 parent；仅当 G1 失败且 G2 通过时，
G2 才是后续 parent。不能用 outer metric 在 G1/G2 中追逐更有利者。

## 16. Sequential incremental gates

顺序固定：

```text
core → platform → taxonomy → composition
```

每一步还需要新的明确实现授权。

G4 vs passing raw core：

- primary/strict 各至少 1% incremental WAPE；
- 复用全部 horizon/time/top/bias/bootstrap safety；
- supported platform rows 不得恶化；
- 失败则保留 raw core，停止 G5/G6。

G5 vs passing G4 raw：

- primary/strict 各至少 1% incremental WAPE；
- 复用全部 safety；
- supported taxonomy rows 不得恶化；
- 失败则保留 G4，公开 G5 raw failure，停止 G6。

G6：

- 仍须通过全部 core gate vs G0；
- 相对 best raw layer 的 primary/strict 均不得恶化超过 1%；
- 不构成 release 权限。

## 17. Stopping rules 与否决项

以下情况都不能构成通过：

- 跨 horizon 常量 scale；
- `actual/prediction` ratio correction；
- taxonomy 直接金额倍率；
- learnedGlobal 渠道分量重新求和；
- work-channel 改善但 work-total 伤害；
- 短 horizon 改善但长 horizon 显著伤害；
- 普通作品改善但 top revenue 伤害；
- selected/blend/fallback 替代 raw；
- evaluation outcome 选择参数、平台、taxonomy 或 alpha；
- mechanism 名称与实际数学形式不一致；
- business plausibility 代替 out-of-time 证据。

数据无法识别机制时，`UNIDENTIFIABLE_WITH_CURRENT_DATA` 是允许且必须接受的结论。

## 18. Data limitations

当前没有历史权威：

- 平台会员池；
- 曝光、点击、播放、消费时长；
- fill rate、eCPM；
- 订单、客单价、退款；
- 平台上下架/可售状态；
- 合同生效/失效；
- 历史分成规则变更；
- 未来营销或运营动作。

这些缺口只能报告，不能以现金派生 proxy、当前状态回填或 GPT 猜测补造。即使
业务理论合理，缺少驱动数据也可能使它不可识别。

## 19. Implementation plan

下一轮只有取得明确授权后，才按以下顺序实施：

1. 绑定所有 frozen digest，drift 时 fail closed；
2. 在 private materializer 增加 origin-truncated channel monthly history 和
   mature future-month positive labels；
3. 验证 monthly→horizon 与 work-channel 三项守恒；
4. 实现 G0 semantic-equivalence verifier，不重拟合 G0；
5. 实现共享 deterministic two-part GLM；
6. 分别实现并测试 G1、G2；
7. 实现 training-only G3，始终保留两个 raw；
8. 完成 synthetic、no-real-data 和 leakage tests；
9. 获得 private development 授权后只执行一次冻结协议；
10. 应用 core gate；没有新的分层授权时停在 G3。

本计划不授权现在执行其中任何实现或训练步骤。

## 20. Unresolved questions 与自检

会改变模型结论的 unresolved question：

```text
none
```

机器 JSON 已冻结：

- exact candidate IDs；
- feature allowlist/denylist；
- split/nesting；
- finite grid、tie-break、seed、iteration、tolerance、timeout；
- primary/strict/horizon/time/top-revenue/bias/bootstrap gates；
- core→platform→taxonomy stopping；
- future-first-seen 和 fallback；
- required outputs 与 forbidden actions。

最终状态：

```text
finalStatus=GENERATIVE_V02_PREREGISTRATION_COMPLETE_IMPLEMENTATION_NOT_AUTHORIZED
implementationAuthorizationRequired=true
safeToStartImplementation=false
productionSurfaceChangeCount=0
```
