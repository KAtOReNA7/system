# M2 出版行业训练侧学习曲线与参数校准 v1

## 结论先行

K7B 的 training-side 研究没有支持一个可跨机制、平台和分类复用的固定作品数门槛。
只有微信读书平台在本次训练侧协议下，从 32 部作品开始同时满足预先声明的收敛、
系数波动、预测波动和偏差观察条件；这只是该平台当前训练侧的稳定区间，不是独立
晋升授权，更不是新的通用 `32` 门槛。

global pooled parent、会员、广告和交易型机制，在最大研究支持量仍有显著负偏差；
喜马拉雅、番茄畅听、猫耳和克拉漫播也没有形成独立稳定区间。因此当前冻结版本没有
任何 `DIRECT_FIT` 节点：

- global pooled parent 和三个机制使用 `SHRUNK_FIT`；
- 喜马拉雅、微信读书、番茄畅听使用 `SHRUNK_FIT` 到所属机制；
- 猫耳因为 leave-one-work-out 最大 WAPE 变动约 27.58%，使用
  `POOLED_PARENT`；
- 克拉漫播最大可研究支持仅 16 部，低于 21 个有效参数，使用
  `POOLED_PARENT`；
- 三级分类因缺少历史 `effectiveAt/availableAt`，使用 `REPORT_ONLY`。

这不是为了让历史渠道时间生成实验的独立核心通过。相反，训练侧结果说明，即使
数值算法收敛，现金集中和时间外负偏差仍然很强，必须使用连续 component shrinkage，
不能把“收敛”误写成“统计可靠”。

## 方法

研究只读取 v2.2 冲销重述后的 strict packed training rows，验证 origin 固定为
`2024-06`、`2024-12` 和 `2025-06`。每个 origin 都满足：

- 验证作品按稳定 5-fold 中的一个完整作品 fold 留出；
- 同一作品的所有月份和渠道行一起进入或离开训练样本；
- 训练标签的 `labelAvailableAsOf` 必须早于验证 origin；
- 同一历史标签事件只保留当时最新可用的训练表示，避免重复月份制造伪样本量；
- 每部作品的训练总权重相同，月度行不冒充独立作品；
- 每个支持量在每个 origin 做 5 次确定性 grouped subsampling。

支持量覆盖 `8/12/16/24/32/48/64/96/128` 部作品；L2 网格覆盖
`1/3/10/30/100/300`，包含历史网格的全部值。时间 basis 同时比较 current 和
compact。研究评价收敛、作品总现金 WAPE 与偏差、occurrence log loss、
conditional log-MAE、系数相对波动、作品预测 CV 和 leave-one-work-out。

没有读取新候选 outer outcome 或 sealed holdout，也没有连接数据库、provider 或
production。

## 参数冻结

训练侧选择结果如下；它们还要叠加 support tier 的父层收缩，不等于 standalone
参数：

| 节点 | time basis | occurrence L2 | conditional amount L2 | 有效参数数 |
| --- | --- | ---: | ---: | ---: |
| global pooled parent | compact | 1 | 1 | 20 |
| 会员机制 | current | 1 | 1 | 23 |
| 广告机制 | compact | 1 | 1 | 21 |
| 交易型机制 | compact | 1 | 3 | 21 |

广告和交易型采用 compact basis，说明当前训练侧证据不需要历史完整交互自由度；
会员保留 current basis。交易型 conditional amount 使用更强的 L2 `3`。所有值均在
outer outcome 前冻结。

## 机制学习曲线

最大研究支持处：

| 节点 | 作品数 | 现金有效作品数中位数 | WAPE 中位数 | 偏差中位数 | 系数波动 | 预测 CV | LOO WAPE 最大变动 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| global pooled parent | 128 | 5.40 | 83.72% | -73.36% | 0.135 | 0.316 | 1.84% |
| 会员机制 | 128 | 4.68 | 83.95% | -77.52% | 0.120 | 0.227 | 2.14% |
| 广告机制 | 128 | 5.79 | 84.56% | -54.68% | 0.102 | 0.343 | 1.21% |
| 交易型机制 | 48 | 3.28 | 78.66% | -58.90% | 0.019 | 0.044 | 0.77% |

四个节点的数值收敛率均为 100%，但没有一个同时满足偏差和预测稳定条件。作品数增加
时现金有效作品数增长很慢，是因为头部现金高度集中；这正是不能用 nominal work
count 代替有效样本量的实证。

## 重点平台

微信读书在 32 部起进入本次训练侧观察稳定区间，128 部时偏差约 -12.74%、系数
波动 0.047、预测 CV 0.097，且 48 部训练样本的 leave-one-work-out 最大 WAPE
变动约 1.11%。它仍只获得 `SHRUNK_FIT`，因为现金有效作品数和外层晋升证据没有
支持 standalone 结论。

喜马拉雅和番茄畅听的 nominal work 支持很大，但最大研究支持处偏差仍分别约
-79.02% 和 -55.49%；它们获得强收缩的 `SHRUNK_FIT`。猫耳的单部删除敏感性很高，
克拉漫播的最大研究支持低于参数数，两者均使用所属交易型机制父层。

平台研究只使用 forecast origin 已观察到的历史现金渠道 identity；它不是作品—
平台授权关系，也不会把 current 授权状态回填到过去。

## 为什么不再给出一个通用整数

相同 nominal work count 在不同机制和平台对应完全不同的现金有效作品数、集中度和
时间外偏差。把 `50` 改成 `25` 或把微信读书的 `32` 推广到所有节点，都会重复原来
的问题。

新合同使用有效参数数、作品类平衡支持、现金 Kish ESS、origin 覆盖、收敛、系数与
预测稳定、leave-one-work-out 和 authority coverage 共同决定 tier；具体收缩权重
按 component 的有效样本量连续计算。完整公式见《M2 出版行业统计支持合同 v1》。

完整逐支持量、逐 origin 和逐 replicate 结果保存在 Git ignored 的 private
capability artifact；同名机器 JSON 只公开聚合。
