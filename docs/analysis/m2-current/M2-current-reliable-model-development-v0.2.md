# M2 current 可靠预测模型开发 v0.2

## 结论

本轮停止扩建 evidence framework，只在 canonical `src/domain/m2Current/**`
内改进数学模型。新候选
`M2-current-hierarchical-robust-calibration-v0.2` 使用冻结的 824 部作品、
7,851 个 formal-cash development case 和 5 个 origin，在不移动人口、不读取
outer origin 同期或未来标签、不读取当前 shelf/rights/term 等事后状态的条件下，
将 WAPE 从 B4 的 0.55648454 降至 0.51114966，总体 signed bias 从
+0.08910997 降至 -0.00586227。

相对 B4 的 WAPE 改善为 8.1467%，paired work×origin bootstrap 95% CI 为
[-15.7461%, -2.9082%]，因此在当前冻结 development population 上，改善不是由
少数随机抽样组合造成的。3/6/12/18/24 月 horizon 的 bias 均在预设范围内。

这仍是 development-only `PARTIAL_PASS`，不是正式发布模型。dormant 切片没有
可识别的 as-of 复活信号，继续回退 B4；120 部作品的确定性业务样本已经生成，
但人工业务复核仍为 `PENDING`。

## 数学结构

令 B4 对 case `i` 的预测为 `b_i`，候选预测为：

```text
y_hat_i = b_i × s(segment_i, group_i, origin_i)
```

其中 `s` 只能从 `[0.50, 1.00]`、步长 0.01 的冻结网格选择。对每个 outer
origin，仅使用满足以下两个条件的 earlier case：

```text
training_origin < outer_origin
label_available_as_of <= outer_origin
```

每个 dense/intermittent segment 先选择一个 bias-safe 的 segment scale；随后只在
group 至少有 80 个成熟 earlier case，且 group scale 相对 segment fallback 的
training WAPE 至少改善 1% 时采用 group scale，否则回退 segment scale。

可用 group 只来自已证明为 as-of 的历史特征：

- dense：`spike_candidate`
- intermittent：`value_band`
- dormant：不使用 group，固定回退 B4

模型最小化 earlier-label WAPE，并约束 training absolute signed bias 不超过 0.15。
该设计用较少自由度处理 B4 的系统性高估，同时用最小样本和相对改善条件抑制小组
过拟合。

## Development 结果

| 指标 | B4 | v0.1 | v0.2 |
|---|---:|---:|---:|
| WAPE | 0.55648454 | 0.53184893 | 0.51114966 |
| signed bias | +0.08910997 | +0.03680632 | -0.00586227 |
| 相对 B4 WAPE | — | -4.4270% | -8.1467% |
| paired 95% CI vs B4 | — | [-9.4630%, -1.2818%] | [-15.7461%, -2.9082%] |

v0.2 相对 v0.1 的点估计 WAPE 改善为 3.8919%，但 paired 95% CI 为
[-11.8298%, +1.0519%]，上界穿过零。因此当前证据支持“v0.2 明显优于 B4”，
但还不足以声称“v0.2 在统计上确定优于 v0.1”。选择 v0.2 的依据还包括更小的
整体偏差、明确的 group 最小样本规则，以及对所有 5 个 horizon 的稳定改善。

| horizon | v0.2 WAPE | v0.2 bias | 相对 B4 WAPE |
|---:|---:|---:|---:|
| 3 | 0.43044223 | -0.03868666 | -9.1258% |
| 6 | 0.44828459 | -0.08391813 | -8.3139% |
| 12 | 0.44267992 | -0.01879729 | -9.7825% |
| 18 | 0.55316862 | +0.07872067 | -8.7187% |
| 24 | 0.75675430 | +0.02997061 | -4.5183% |

## Dormant 问题

冻结人口中有 833 个 dormant case，只有 80 个 case 出现正现金。正现金高度集中：
最大 1/3/5 个 case 分别占 dormant 正现金的 20.64%、61.92%、79.74%。当前允许的
as-of 特征不能在预测时稳定识别这些少数大额复活事件。

因此本轮没有用全体历史均值、当前 shelf/rights 状态或事后业务结果去“补出”
dormant 预测。这些方法会产生虚假的离线改善或时间泄漏。dormant 继续使用 B4，
直到基础数据增加可审计、可在 cutoff 获得的复活信号。

## 业务样本

runner 已确定性冻结 120 部唯一作品：

- 每个 segment 40 部；
- 每个 segment 包含 20 部代表性样本；
- 每个 segment 包含 10 部最大低估和 10 部最大高估诊断样本；
- 代表性样本的选择不读取 actual；
- stress 样本只把 actual 用于事后诊断，不作为模型输入；
- private 明细只写入 Git ignored output，公开仓库仅保留聚合分布。

下一台具备 authority input 的电脑可以重新执行
`npm run develop:m2:current:candidate` 得到相同 private review workbook。人工复核需要
填写合理性、模型问题、数据问题或现金 route 问题；不得用同一批复核结果再次调参。

## 下一步开发顺序

1. 完成已冻结 120 部样本的人工业务复核，不再增加新候选家族。
2. 从业务源补充 cutoff 时已经签署、确认且可审计的 commitment snapshot；未承诺
   现金不能由模型猜测。
3. 只有出现新的 as-of dormant 信号，才设计预先冻结的 dormant 实验；否则保持 B4。
4. 业务复核完成后再比较 v0.1/v0.2，并由用户另行决定是否授权 final holdout。

## 可复现入口

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

公共聚合证据：

- `docs/analysis/m2-current/M2-current-reliable-candidate-v0.2.json`
- `docs/analysis/m2-current/M2-current-business-sample-diagnostic-v0.2.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.3.json`
