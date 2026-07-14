# M2 calibration scoring / eligibility correction 决策记录 v1

- 决策日期：2026-07-14
- 状态：`FROZEN_BEFORE_CORRECTED_BASELINE_REPLAY`
- 候选训练：未开始，仍停在 `C1` 前
- 候选决策状态：`not_for_formal_decision`
- 正式发布与 M3：均未授权

## 1. 修正原因与适用顺序

首轮 B0b-B3 development replay 证明无泄漏执行框架可以工作，但同时暴露两项结构性问题：

1. 旧 `forecastabilityStatus` 同时承担了“能否进入统计回测”“模型能否生成原始预测”和“业务能否展示预测”三种不同语义，导致模型质量、业务 abstention 和覆盖率被混合解释；
2. blocked/null serving 结果曾在 coverage-aware 指标中按 0 计入 WAPE，使 overall、forecastable 与高价值 bias 不能直接代表同一模型人口上的误差。

因此，本轮不训练 `C1`，先冻结 machine-readable amendment：

- base：`src/domain/oldProductEvaluation/calibrationSpec.v1.json`，`calibration-spec-v1` revision 5；
- amendment：`src/domain/oldProductEvaluation/calibrationSpec.v1.1.amendment.json`，`calibration-spec-v1.1-amendment`；
- base canonical digest：`625631279889e46ce174ffb507b3926793fdc7a435fc2c7c8aafbf990c8a7fb9`；
- base introducing commit：`bbc4563a79dfb8387b93bdd47b898f0a91bb952b`。

两者必须成对加载并通过 digest/commit binding。amendment 只覆盖其声明的 scoring、eligibility、fingerprint、metric、gate、报告和 seal 语义；其余模型、参数、origin、horizon、route、seed、bootstrap 及安全边界继续继承 base。绑定失败必须停止 replay 和候选训练。

发生冲突时，当前适用顺序为：

1. 用户对 scoring / eligibility correction sprint 的明确决定；
2. `calibrationSpec.v1.1.amendment.json` 与其绑定的 `calibrationSpec.v1.json`；
3. 本记录；
4. M2 PRD；
5. 首轮 baseline replay 和旧 v1.1，仅作历史证据。

## 2. 修正边界

本轮允许修正：

- statistical scoreability；
- model prediction availability；
- business serving eligibility；
- abstention 与 reason；
- raw/served prediction 语义；
- metric population 与名称；
- top10 served revenue coverage 的 pre-C1 gate；
- B0a 到 B0b 的 attribution bridge；
- baseline statistical-equivalence tie-break；
- 为证明上述修正所需的 fingerprints、测试与脱敏报告。

本轮禁止改变：

- B0b-B3 或 C1/C2-R/C2/C3 的模型公式、候选参数空间与训练顺序；
- development origins、final holdout origins、horizon、random seed；
- work×origin paired bootstrap 的 cluster、2000 次重复和 PCG64；
- 既有数值 gate 的阈值，特别是 top10 `90%`；
- final holdout、embargo shadow 或 deferred 60-month labels 的封存状态；
- `not_for_formal_decision`、release 和 M3 边界。

本 amendment 必须在 corrected B0b-B3 replay 和 `C1` 前提交。提交后不得根据 corrected replay 再移动 eligibility 或放宽 gate。

## 3. 四类状态必须独立

### 3.1 `statisticallyScoreable`

这是回测统计人口，不是服务资格。一个 work-origin-horizon case 只有同时满足以下硬条件才可进入模型回测：

- 标准作品身份存在且在权威 case universe 中唯一；
- 作品第一条可观察收入源记录不晚于 origin；
- 从第一条可观察收入源记录到 origin 至少有 12 个完整日历月；
- target window 完整落在权威最新完整月份内；
- target window 每个日历月均可按收入事实契约重建，缺少账单行只有在契约允许时才表示已观察的 0；
- label 在相应 scored role 的可用边界内；
- 收入金额、身份映射和聚合对账有效。

`statisticallyScoreable` 不要求历史正收入，不要求 route 已解析，也不要求业务展示资格。它不得读取 actual 的数值或正负来决定是否入组，也不得读取 current rating、current shelf/rights、current risk、current business action、候选结果、embargo、final holdout 或 deferred 60-month 结果。

### 3.2 `modelPredictionAvailable`

这是逐模型、逐 case 的能力状态。只有在 truth join 前已经锁定有限数值 `rawModelPrediction` 时才为 true。每个公平 baseline/candidate 对所有 `statisticallyScoreable` case 都必须提供原始数值；缺失是完整性失败，不能删 case、取交集或补 0。

`unknown_revenue_model` 不得临时套用任一 sales time-series 模型。仅当 origin 前所有可得渠道历史金额均为 0 时，四个 baseline 可按冻结的结构性零规则保留 `rawModelPrediction=0`；只要存在正数或非有限历史，就必须在模型计分前完整性失败。该 case 仍保留在 all-scoreable，但产品侧必须 abstain，且不得声称完成 route component 对账。

### 3.3 `businessServingEligible`

这是模型无关、只使用 cutoff 当时可得硬信息的产品展示资格。当前冻结条件是：身份有效、cutoff 收入历史有效且已对账、至少 12 个观察日历月、revenue-model route 已按 origin 解析。

它不要求历史正收入，也不得使用 current rating、current shelf/rights、current risk bucket、current business action、模型 ID、候选预测/误差或任何 holdout 结果。没有历史状态 snapshot 时，当前 source、shelf/rights 和版权期限类型只能标记为 `postHocSegmentOnly`。

### 3.4 `abstained`

`servedPrediction=null` 时必须为 `abstained=true`，并按 machine-readable precedence 给出唯一主 `abstentionReason`；有 served 数值时 reason 必须为空。不得依据候选误差选择 abstention reason。

旧 `forecastabilityStatus` 仅保留给历史 attribution 和非回归报告，不得再控制上述三类状态或任何模型指标人口。

## 4. raw 与 served prediction

内部必须分别保存：

- `rawModelPrediction`：所有 `statisticallyScoreable` case 的模型原始作品级点值，route component 对账后、truth join 前锁定；
- `servedPrediction`：仅当 `businessServingEligible=true` 且 `modelPredictionAvailable=true` 时等于 raw，否则为 null。

执行证据按 role 与 score origin 分开保存：warmup、每个 forward fold 和 development-safe long audit 都必须先完成 prediction-side annotation 与完整 prediction fingerprint，再允许读取该 population 的 scoring truth；truth join 后必须从 joined rows 重算 prediction projection 并与 lock 完全一致。forward fold 只能使用在该 score origin 已经可得的更早标签拟合，当前或未来 fold truth 不得先于当前 fold lock。

业务 abstain 不删除 raw。blocked/abstained 的 served null 禁止按 0 混入模型 WAPE。若需要把未服务收入视为业务损失，只能另报 `endToEndBusinessLoss`，不得命名为 WAPE，也不得用于 comparator 或候选选择。

产品、页面、API、Excel 和正式导出仍只允许：

- 一个 `pointForecast`，来源为 `servedPrediction`；
- 年度拆分；
- confidence；
- limitation。

`rawModelPrediction` 和 80% PI endpoints 均不得对外输出。

## 5. 三组指标

### A. all-scoreable model metrics

人口为全部 `statisticallyScoreable` case，统一使用 `rawModelPrediction`，输出：

- WAPE：`sum(abs(pred-actual))/sum(abs(actual))`；
- MAE；
- SMAPE，pred=actual=0 的 case 项固定为 0；
- signed aggregate bias：`(sum(pred)-sum(actual))/sum(actual)`；
- horizon stability。

任何应有 raw 数值的 case 缺失即完整性失败，不允许 complete-case filtering。

### B. served-cohort metrics

人口为 `statisticallyScoreable=true && businessServingEligible=true`，使用 `servedPrediction`，输出 WAPE、MAE、SMAPE、signed bias 和高价值表现。该人口如出现 served null，也是完整性失败，而不是静默排除。

### C. abstention metrics

至少输出：

- served work share，work grain 固定为 distinct `standard_work_id × origin`，避免 horizon 重复计数；
- served actual revenue share；
- top1/top5/top10 served revenue share；
- abstained work count；
- abstained actual revenue share；
- 按 abstention reason 的 case/work/revenue 分布；
- high-value abstained work count。

收入 share 的分子和分母使用 `max(actual,0)`，避免 signed net cancellation；分母为 0 时为 undefined，不能记为通过。

## 6. eligibility 与 pre-C1 90% gate

eligibility 条件在 corrected replay 前冻结并提交。不得为接近旧 77.88% / 20.38%，也不得为满足新 gate 而按目标比例移动作品、route 或阈值。

top10 served revenue coverage 固定至少 90%，公式为：

```text
sum(max(actual,0) for served top10 all-scoreable cases)
/
sum(max(actual,0) for all top10 all-scoreable cases)
```

该 gate 是模型无关的 `C1` 前置条件，不是靠候选精度补救的候选 gate。如果冻结 eligibility 后仍低于 90%，必须停在 `C1` 前，并按 abstention reason 报告每项硬阻断收入和作品数量；不得降低 90%。

## 7. B0a 到 B0b attribution bridge

development-only attribution 固定七个阶段：

1. B0a recorded historical metrics；
2. legacy model + new case-key intersection；
3. legacy model + as-of quantiles/priors；
4. legacy model + as-of rating/lifecycle/features；
5. legacy model + new eligibility；
6. legacy model + new abstention scoring；
7. complete B0b。

Stage 2 到 Stage 7 必须共享完全相同的 development intersection keys，每一步只切换列明的一层语义，并保存 definition/case/prediction fingerprints。每个可 replay 阶段至少报告 case count、all-scoreable WAPE/bias、served revenue coverage、top10 served coverage 和高价值 WAPE/bias。

Stage 1 只是旧记录，没有相同 case keys；Stage 1 到 Stage 2 的差只能叫 `historical_to_intersection_bridge_gap`，不能作严格因果归因。Stage 6 之前的旧 null-to-zero 量必须命名为 `legacyCoverageAwareLoss`。若某一旧语义无法重建，应明确列出缺失 artifact/定义并标记 `not_reconstructable`，不得伪造阶段指标。

旧 full-period 逐 case prediction artifact 并不存在，因此 Stage 2 不得重新用 2023-06 之后的封存事实制造一个“历史预测”。本轮只允许使用截至 development purge（2023-06）的 global quantiles/priors 作为明确标注的 reconstruction proxy；Stage 3 再切换为各 origin 的 as-of quantiles/priors。Stage 5 必须显式保存旧 `servedPrediction null -> 0` 的 `legacyCoverageAwareLoss`，并标记它不是模型 WAPE；Stage 6 才开始使用所有 scoreable case 的 `rawModelPrediction` 计算模型 WAPE。即使两者在本次数据上数值相同，scoring semantics 与 fingerprint 也必须不同。

private case evidence 的 manifest 必须持久化绑定 case 行数、case SHA-256、序列化版本、base/amendment/code/input fingerprints、各 role prediction-lock fingerprint 和公开报告 SHA-256，并在写入后重新读取校验。公开聚合只要 case count 或 unique work count 任一小于 10，整个 cell 只能输出 `suppressed=true` 与两个 `<10`，不得保留 metric、维度 value 或可交叉拼接的切片。

## 8. corrected B0b-B3 replay 与 comparator tie-break

B0b-B3 必须继续保持：

- 相同 development origins、case keys、scoreable keys 和 business-serving keys；
- 相同 seed；
- work×origin paired two-way bootstrap；
- future-perturbation invariance；
- final holdout、embargo shadow 和 deferred 60-month labels 封存。

comparator 先在 all-scoreable raw WAPE 上找到 provisional 最低者。每个 baseline 都只与该 provisional 最低者比较，避免非传递 pairwise chaining。若满足任一条件，即视为统计等价：

- 相对 WAPE 差 `abs(a-b)/min(a,b) < 1%`；
- paired block-bootstrap 95% CI 包含 0，端点为 0 也算包含。

统计等价集合按结构复杂度 `B1 < B2 < B3 < B0b` 选最简单者。B0a 永不参与；B0b 和 B3 无论最终选择结果如何都必须继续报告。comparator 锁定后不得按 gate 重选。

## 9. 内部 80% PI 与公开报告

内部 80% PI 只基于 all-scoreable raw prediction 的 strict-forward residual，用于 coverage、WIS 和过度自信审计。serving eligibility 或 abstention 不得筛掉 required interval case。PI endpoints 不得进入产品/API/Excel/正式导出，也不得进入可提交公开报告。

公开报告必须为中文、脱敏、聚合层，且：

- 不包含作品、作者、渠道标识、原始收入行、逐作品收入/预测、private 路径、数据库凭据或 PI endpoints；
- case count 或 unique work count 任一小于 10 时抑制该 cell 的全部指标；
- 明确分别报告 all-scoreable、served、abstention；
- 输出 scoring correction、B0a-B0b attribution 和更新后的 B0b-B3 replay；
- 显示所有失败 gate、pre-C1 stop 和 `not_for_formal_decision` 状态。

## 10. seal 与停止条件

本 sprint 中：

- `C1/C2-R/C2/C3` 均未开始；
- final holdout 未打开、truth 未读取、baseline runner 必须 fail closed；
- embargo shadow 未打开且不得参与拟合、选择或阈值；
- deferred 60-month labels 未打开且不得参与拟合、选择或阈值；
- 不批准 formal decision、release、prepared export 发布或 M3。

完成 amendment、修正内核、测试、attribution 和 corrected B0b-B3 replay 后，必须再次停在 `C1` 前。只有 top10 pre-C1 gate 等全部前置条件通过且用户再次明确授权，才可开始 `C1`。
