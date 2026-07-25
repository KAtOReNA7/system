# M2 真实账单复跑与历史状态校准审计 v0.1

日期：2026-07-25

状态：`POSTHOC_DEVELOPMENT_DIAGNOSTIC_REJECTED_KEEP_V0_3_FALLBACK`

目标：`future_sales_share_cash`

## 结论

本轮使用本机已验证的 `m2-algorithm-authoritative-input` capability，重新物化并
评分真实账单 development 人口。复跑结果与既有证据一致，不是缓存或公开摘要
替代：

- 冻结人口：824 部作品、7,851 个 case；
- 逐月人口：25 个 origin、56,856 个已物化 case，其中 47,611 个进入模型评分；
- 作品级 v0.3 fallback：WAPE `0.50557140`，signed bias `-0.01198958`；
- portfolio v0.5 development：WAPE `0.11681934`，signed bias
  `-0.04876300`；
- target classification uncertainty 为 0，买断隔离与现金守恒门禁通过。

本轮新增的历史状态校准 challenger 将逐月 WAPE 从 `0.66335800` 降至
`0.59576421`，相对改善 `10.1896%`，signed bias 从 `-0.30206120` 改善至
`-0.21126360`。这说明原先“所有作品在每个 origin 共用一个基线”的结构确有
改进空间，但新结果仍显著高于 `0.30` 门槛，且 intermittent、dormant 和历史
特征可得性门禁均失败。因此：

```text
promotionDecision=REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK
matureDataPredictionCapability=false
automationDecision=AUTOMATION_BLOCKED
```

## 数据与口径复核

### 目标口径

所有评分标签均为未来分成收入现金。买断及其他已识别非分成现金不进入训练、
回测或预测。冻结与逐月人口均满足：

```text
salesShareCashActual
+ isolatedBuyoutCashActual
+ isolatedOtherCashActual
= totalLedgerCashActual
```

冻结/逐月人口最大守恒差分别为 `5.82e-11` 和 `2.33e-10`。分类不确定 case
数和金额均为 0。

### 真实账单的可用性限制

账单金额、bill month、作品和标签成熟时间能够支持 posthoc development
回测，但当前 authority 不能证明每个历史 origin 当时的 posting time 或
`availableAt`。因此本轮只证明“按账单月份切片时的历史拟合与外层评分”，不能
证明线上在相同 cutoff 能取得完全相同的输入。

该限制是模型证据的一部分，不得通过把当前账单历史改名为
`availabilitySnapshot` 消除。当前合规历史 snapshot 覆盖仍为 0。

## 原模型问题归因

1. **作品异质性被压平。** 旧逐月 champion 每个 origin 只选择一个全局
   baseline，无法同时描述 dense、intermittent 和 dormant。
2. **近期水平变化表达不足。** 原六个基线主要是 seasonal naive 和间歇需求
   方法；dense 作品需要更快的水平更新。
3. **间歇与休眠再激活缺少 cutoff 信号。** 只有金额历史时，模型无法识别未来
   上架、渠道恢复或运营动作。dormant 的实际正例只能被大面积漏报或通过高误报
   换取召回。
4. **金额高度集中。** 冻结人口 Top 1% case 占约 51.73% 绝对现金和 30.38%
   绝对误差；作品级误差易被少量大额 case 主导。
5. **组合可预测不等于作品可分配。** portfolio 的 11.68% WAPE 不能机械拆回
   作品，否则会把组合精度冒充作品精度。

## 本轮算法调整

### 候选基线

保留 zero、seasonal naive、Croston、SBA、TSB、ADIDA 六个回归基线，并增加：

1. 三个月近期均值：

   ```text
   forecast(h) = h * mean(max(y[t-2:t], 0))
   ```

2. 两年同月季节中位数：

   ```text
   forecast(h) = sum_k median_lower(y[t+k-12], y[t+k-24])
   ```

3. `alpha=0.5` 的指数加权水平：

   ```text
   level[t] = 0.5*y[t] + 0.5*level[t-1]
   forecast(h) = h * level[t]
   ```

### 严格选择规则

对每个 outer origin，只使用：

- origin 更早；
- `labelAvailableAsOf <= outer origin`；
- 最近 6 个已成熟 origin；
- 每个选择单元至少 80 个训练 case。

选择层级按以下顺序回退：

```text
segment × horizon × trailing-12-month occurrence bucket
→ segment × horizon
→ segment
→ global
→ zero fail-safe
```

内层按 WAPE 选择，绝对 bias 和 baseline ID 只用于确定性 tie-break。外层真实值
不参与选择。该实现扩展 canonical `src/domain/m2Current/**`，未复制历史 runner。

## 真实账单结果

| 模型 / 分群 | WAPE | signed bias | 结论 |
|---|---:|---:|---|
| 旧逐月 champion | 0.66335800 | -0.30206120 | FAIL |
| 历史状态校准 challenger | 0.59576421 | -0.21126360 | FAIL |
| challenger dense | 0.39900895 | -0.04555218 | FAIL |
| challenger intermittent | 0.82897090 | -0.40113407 | FAIL |
| challenger dormant | 1.00725629 | -0.99262504 | FAIL |
| v0.3 冻结作品 case | 0.50557140 | -0.01198958 | fallback |
| v0.5 portfolio development | 0.11681934 | -0.04876300 | development-only PASS |

新 challenger 的 WAPE、总体绝对 bias、各 segment WAPE、各 segment 绝对 bias、
历史输入 available-at 和独立 holdout 门禁均未全部通过。它不能替换 v0.3，
也不能进入自动化或 release。

## 后续修改方向

1. 不再对当前 2022 development 窗口调参；本轮参数和失败结果已固化。
2. 先物化可版本化的历史 `availabilitySnapshot`，至少包含 economic time、
   posting time、available-at、来源版本、lineage 和完整性摘要。
3. 新信号到位后，将 occurrence 与 positive amount 分离：
   - intermittent/dormant 先预测未来是否出现分成现金；
   - 仅在 occurrence 为正时预测条件金额；
   - dense 保留近期水平与季节候选。
4. 下一次模型选择必须使用未参与本轮设计的 later origin，或经单独授权的
   final holdout。当前 final holdout 继续 sealed。
5. portfolio、作品级预测、作品排序和 abstention 继续作为独立 capability；
   禁止把 v0.5 portfolio 结果分配回作品。
6. 在绝对 WAPE、segment、risk–coverage、业务损失和独立验证同时通过前，
   `AUTOMATION_BLOCKED` 保持不变。

机器可读聚合证据：
`docs/analysis/m2-current/M2-current-real-bill-recalibration-v0.1.json`。
