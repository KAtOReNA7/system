# M2 人工账单分区接入与复验审计 v0.1

日期：2026-07-25
状态：development evidence；不构成 final holdout、自动化或发布授权

## 结论

用户逐行复核的三份 private 工作簿已经成为 M2 现金类型的唯一权威：

| 私有账单角色 | 当前用途 | 禁止用途 |
|---|---|---|
| 总账 | 行数、金额、逐月守恒审计 | 特征、标签、回测、预测 |
| 分成账单 | 分成预测特征、训练标签、回测实际值 | 买断评级替代 |
| 买断账单 | 评级与历史背景，`notCashForecast=true` | 特征、标签、回测指标、预测输出 |

现金类型只取工作簿成员关系。金额形态、备注、渠道、正负号及旧分类器均不得覆盖
人工结果。所有负数按用户确认解释为冲销，但冲销属于分成还是买断，仍由所在拆分
账单决定。

## 数据守恒结果

| 检查 | 结果 |
|---|---:|
| 总账行数 | 192,370 |
| 分成行数 | 190,663 |
| 买断行数 | 1,707 |
| 总账 = 分成 + 买断 | 通过 |
| 七个源字段逐行多重集相等 | 通过 |
| 分成与买断源行交叉 | 0 |
| 逐月行数守恒 | 通过 |
| 逐月金额守恒 | 通过 |
| 分成类型纯度 | 通过 |
| 买断类型纯度 | 通过 |
| 机器现金分类使用 | 否 |

总账中分成行的展示字段 `类型` 为空、买断行为“买断”；这只是展示差异。守恒比较
使用其余七个源字段，两份拆分账单成员关系才是分类权威。

最新完整月仍为 2026-04。2026-05 的 3 条分成事实继续作为不完整月排除，不进入
模型窗口。3,053 部基础作品中有 3,052 部出现在新账单；另 1 部只在旧零金额行中
出现。系统将其保留为无现金观察作品，不制造零金额账单补齐。

## 对旧 M2 人口的纠正

旧 824 部、7,851 个 case 是机器现金路由下的冻结审计基线。人工分区后：

| 项目 | 数量 |
|---|---:|
| 路由发生变化 | 1,142 cases |
| 当前 pure-sales-share | 4,594 cases |
| 当前 buyout-plus-sales | 2,489 cases |
| 当前 pure-buyout 弃权 | 768 cases |
| 当前 served | 758 works / 7,083 cases |

冻结的作品、origin 和 horizon key 仍可用于差异审计，但 pure-buyout 不得为了
保持旧人口而继续进入预测指标。公共 loader 现在同时报告旧审计人口和当前 served
人口，null 不会转成 0。

## 复验后的模型状态

| 指标 | 人工分区复验 |
|---|---:|
| 作品级 WAPE | 0.49075894 |
| 作品级 bias | 0.07378107 |
| B4 WAPE | 0.54929375 |
| dense WAPE | 0.45873171 |
| intermittent WAPE | 0.96321675 |
| dormant WAPE / bias | 1.01854144 / -0.97173129 |
| portfolio WAPE / bias | 0.42609452 / 0.42609452 |
| portfolio FVA | -1.34255921 |
| 分类不确定现金占比 | 0 |

旧机器分区下的 portfolio development PASS 已失效。人工分区复验的组合层误差和
偏差都失败，作品层 WAPE 也仍高于 0.30。当前状态为
`CANDIDATE_DEVELOPMENT_FAIL_BLOCKED`，不能申请自动化、final holdout 或发布。

人工渠道规则 comparator 同步重跑 379 个安全 case，WAPE/bias 为
0.69415424 / -0.32056442。买断真值门禁已经通过；剩余阻断是 canonical 渠道、
平台类型、历史 available-at、特殊品类成熟样本和独立验证。

## 实现边界

- `config/m2-current-human-ledger-partition.v0.1.json` 固化三种文件角色；
- `npm run develop:m2:current:ledger-partition` 只在受控 private capability
  中校验三账单，输出 ignored private evidence；
- current cache 为每条事实附加人工 `cashCategory`；同一渠道的分成与买断拆为
  两个现金组件；
- 预测矩阵只取分成账单；评级上下文可取总账；
- pure-buyout 返回 `buyout_outside_m2_forecast_scope`；
- 三份工作簿、缓存、逐行结果和作品/渠道标识均不进入 Git；
- 缺少 private 账单只阻断真实账单复验，不阻断 clone、安装、测试、公共诊断、
  smoke 或本地启动。

## 下一步

账单分区已经完成，不再要求人工重新判断买断。下一治理输入是版本化的
`raw channel ID/name → canonical channel → platform type` 主表。完成后才能按
会员/单购平台、三级分类、级别和上线月龄建立分层模型；任何新候选仍需使用未参与
本轮选择的 later origin，final holdout 继续 sealed。
