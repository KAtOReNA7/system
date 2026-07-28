# M2 出版行业统计支持合同 v1

英文名：M2 Publishing-Scale Statistical Support Contract v1

稳定合同 ID：`M2-PUBLISHING-SCALE-SUPPORT-01`

## 合同目的

本合同取代“用一个固定作品数同时控制 mechanism、platform 和 taxonomy”的向前
做法。历史渠道时间生成模型 v0.2 的 `50/100` 门槛、历史阻断、配置、报告和验证器
继续保留；本合同只对新的出版行业适配模型修订生效。

本合同不保证小样本模型通过。它允许小样本节点进入低自由度、强收缩的开发检验，
同时把“允许拟合”“统计稳定”“模型晋升”和“可发布”保持为四个不同判断。

## 四级支持状态

### DIRECT_FIT

只有同时满足 as-of 权威、训练侧稳定区间、有效样本量、时间 origin、收敛、系数与
预测稳定、偏差和 leave-one-work-out 门禁时，才允许独立子节点参数。当前冻结版本
没有任何节点获得该状态。

### SHRUNK_FIT

允许拟合子节点，但 occurrence 与 conditional amount 必须分别连续收缩到最近父层。
名义作品数不能直接决定收缩权重。

### POOLED_PARENT

不估计独立子参数，直接使用最近合格父层。节点人口和回退原因仍必须报告，不能从
目录或评价人口中消失。

### REPORT_ONLY

只有人口报告，不参与训练或路由。缺少历史 `effectiveAt/availableAt` 的当前三级
分类和授权关系属于此状态。

## 支持证据

每个节点至少计算：

- distinct works 与 positive distinct works；
- occurrence 类平衡的作品有效样本量；
- 按作品正现金计算的 Kish ESS，即作品现金 HHI 的倒数；
- monthly rows 与 positive months，但两者不得冒充独立作品；
- 独立 inner validation origins；
- occurrence 与 conditional amount 的有效参数数；
- grouped-CV 收敛率；
- 系数相对波动与同一验证作品预测 CV；
- leave-one-work-out WAPE 影响；
- 相对父层的不确定性；
- 分类或授权的 as-of 权威覆盖。

support score 是连续证据，不是一个可跨节点复用的整数。完整公式和数值门见
`config/m2-publishing-scale-statistical-support.v1.json`。

## 连续收缩

occurrence 与 conditional amount 分开计算：

```text
occurrenceWeight =
  occurrenceClassEffectiveWorkCount
  / (occurrenceClassEffectiveWorkCount + occurrenceParameterCount)

amountWeight =
  cashEffectiveWorkCount
  / (cashEffectiveWorkCount + amountParameterCount)
```

occurrence 在 logit 尺度、conditional amount 在 `log1p` 尺度，把 child 与 parent
插值。月度行数不进入分子。支持越少、现金越集中或参数越多，权重越接近父层。

当前层级为：

```text
platform → mechanism → global pooled parent
         → origin-visible empirical parent
```

只有未来获得历史 as-of 分类权威后，才允许：

```text
level3 → level2 → level1 → platform → mechanism → global parent
```

当前三级分类不能因为样本少而删除，但只能 `REPORT_ONLY`；不得用 current-only
标签回填过去。

## tier 判定

`DIRECT_FIT` 需要：

- 已观察训练侧稳定区间；
- distinct works 至少等于有效参数数；
- positive distinct works 至少为有效参数数的一半；
- cash ESS 至少等于有效参数数；
- 至少 3 个独立 origin；
- 收敛率至少 95%；
- 系数相对波动不超过 0.25；
- 预测 CV 不超过 0.15；
- 绝对中位偏差不超过 25%；
- leave-one-work-out WAPE 最大变动不超过 3%。

`SHRUNK_FIT` 是开发资格，不是晋升资格。它要求 distinct works 至少为
`max(8, effectiveParameterCount)`、positive works 至少为
`max(6, ceil(parameterCount / 2))`、至少 2 个 origin、收敛率至少 95%，并限制
系数波动、预测 CV 与单部删除敏感性。未达到者使用 `POOLED_PARENT`。

这些数值是数值安全和稳定性规则，并与参数数绑定；它们不是对出版社年度 SKU 的
业务规模假设。

## 当前冻结节点

- global pooled parent：`SHRUNK_FIT`，compact basis，L2 `1/1`；
- 会员机制：`SHRUNK_FIT`，current basis，L2 `1/1`；
- 广告机制：`SHRUNK_FIT`，compact basis，L2 `1/1`；
- 交易型机制：`SHRUNK_FIT`，compact basis，L2 `1/3`；
- 喜马拉雅、微信读书、番茄畅听：`SHRUNK_FIT` 到所属机制；
- 猫耳、克拉漫播：`POOLED_PARENT` 到交易型机制；
- 三级分类与授权关系：`REPORT_ONLY`。

微信读书在训练侧观察到 32 部起的稳定区间，但现金 ESS 和晋升证据仍不足以授予
`DIRECT_FIT`。`32` 不能传播到其他平台或机制。

## 保留的评价与安全门

相对 WAPE 1% materiality、top-revenue 1% harm tolerance、bias 1 个百分点、
6/11 时间块、4/6 horizon 和 2,000 次 standard-work cluster bootstrap 均保留。
20% generator usage 从拟合资格门降为描述指标，不再因使用比例低而把真实业务节点
从开发人口删除。

## 阶段边界

本合同冻结时，K7B 完成，但 K7C 实现尚未完成。只有 K7C 普通提交、普通推送并在
exact HEAD 的 Linux 与 Windows CI 均成功后，才允许一次 K7D private development
execution。当前仍禁止读取新候选 outer outcome、sealed holdout、later-origin、
production、provider、数据库、release 和 M3 formal。
