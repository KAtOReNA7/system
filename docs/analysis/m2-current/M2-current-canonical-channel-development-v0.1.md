# M2 canonical 渠道分层模型 development 结果 v0.1

日期：2026-07-26
性质：development evidence；不是 final holdout、Canary 或发布结论

## 结论

渠道治理本身通过：133 个原始
ID/名称组合全部映射，归并为
74 个 canonical 渠道；
账单行数、金额和 100% 映射覆盖均守恒。

新候选仍维持 **REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK**。25-origin 诊断 WAPE 为
0.465066，当前人工权威 served
7,083 case 上 WAPE 为
0.490701。独立验证、历史渠道状态、真实上线月和
单购净单价仍未具备，因此不能把本轮结果表述为成熟模型。

## 数据质量门禁

- 意图粒度：作品 × 月 × canonical 渠道 × 渠道角色 × 收入模式。
- 原始映射：133；canonical 渠道：
  74。
- 分成账单：190,663
  行；映射覆盖 100.00%。
- 完整月份截止：2026-04；
  不完整 2026-05 仍排除。
- 行数守恒：PASS；
  金额守恒：PASS。
- 买断现金、commitment、当前状态事后回填均未进入预测。

## 回测

| 人口 | case | WAPE | bias |
|---|---:|---:|---:|
| 25-origin seasonal-naive 基线 | 44,301 | 0.462742 | 0.068371 |
| 25-origin canonical-channel 候选 | 44,301 | 0.465066 | 0.068437 |
| 7,083-case exact v0.3 fallback | 7,083 | 0.490759 | 0.073781 |
| 7,083-case canonical-channel 候选 | 7,083 | 0.490701 | 0.077053 |

25-origin 相对 WAPE：
0.50%；冻结 served 相对 WAPE：
-0.01%。被 nested selector 实际采用渠道权重的
case 占比分别为 45.45% 和
5.87%。

## 模型边界

会员/广告分成平台使用渠道级季节曲线和阻尼近期趋势；非终端合作方保持 fallback。
单购/点播没有可审计净单价，不能把现金反推为销量，因此本轮明确阻断销量曲线，
没有伪造 30 元定价或 50% 分成比例。三级分类和当前 rating 只用于结果分组，
没有作为 origin 时可得特征。

## 下一步

1. 收集带生效时间的历史渠道状态/合同可售 snapshot。
2. 为单购平台补充可审计的作品净单价或净收入/销量换算口径。
3. 预注册一个未参与 v0.5/v0.7/v0.8/v0.9 设计的 later-origin 验证窗口；
   未获独立验证授权前继续保持 v0.3 fallback。
4. final holdout、provider、数据库、Canary、release 与 M3 formal 继续封存。
