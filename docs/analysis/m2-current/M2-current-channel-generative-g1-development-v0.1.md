# 渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心

## 结论

渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心
（Channel Generative v0.2 — Independent Monthly Occurrence × Conditional
Amount Core，`M2-CHAN-GEN02`，`M2-EXP-CHANNEL-GENERATIVE-02/G1`）最终状态为：

`M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED`

这是预注册的机制父节点训练资格未满足，不是模型效果失败。主集第 1 个外层折的 5 个
内层训练折中，交易型机制父节点只有 25–32 个独立作品，低于冻结门槛 50。其训练
行数为 8,640–11,916，正月份为 1,087–1,710，均超过另外两个门槛；会员型和广告型
父节点在全部内层折均合格。

因为 9 组冻结参数配置的资格判定与参数值无关，全部配置均无法形成完整候选。没有
外层候选预测，没有 primary 或 strict 评分，也没有冻结候选输出可供 oracle 诊断。
不得把缺失分数写成 0，也不得据此降低门槛、改网格或改用其他模型。

## 实际执行

| 项目 | 数量 / 状态 |
| --- | ---: |
| 主集打包行 | 58,986 |
| 主集逐月行 | 2,123,496 |
| 严格辅助集打包行 | 102,743 |
| 严格辅助集逐月行 | 1,677,147 |
| 已物化逐月标签总数 | 3,800,643 |
| 内层参数配置 | 9 |
| 内层作品折 | 5 |
| 内层候选状态尝试 | 45 |
| 合格配置 | 0 |
| 外层候选预测行 | 0 |
| 候选评价行 | 0 |

首次尝试在拟合前因同一作品标识的历史表示形式与当前权威形式不同而失败关闭，没有
读取候选结果。修复采用“精确匹配优先、规范数值身份次之、冲突时失败关闭”，保留
冻结 case 原标识。第二次尝试的主集 13 条、严格辅助集 16 条打包行使用该规范别名；
两侧均只有 1 个作品—渠道 scope，冲突与未解析 scope 都是 0。

第二次尝试在重述绑定前检通过后启动拟合，随后于第 1 个 primary 外层折的内层选择
阶段触发资格阻断。没有继续进入 strict rolling，没有重试。

## 冲销重述与时间边界

- 实际值定义为 `M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`。
- 未分配冲销残差 `-267.769000000000330000` 权威货币单位继续留在财务对账，
  只从开发可建模目标透明隔离。
- 精确整数守恒差为 0；没有把残差分配到任何标签。
- origin 后冲销进入训练特征的行数为 0。
- 主集 2,123,496 条和严格辅助集 1,677,147 条标签均完成内存重绑定；其中分别有
  751 条和 322 条标签因较晚记录的冲销而延后可得时间。

## 未产生的结果

下列项目都因候选输出不存在而未计算：primary/strict WAPE、signed bias、MAE、
median AE、horizon、origin/time block、top revenue、发生指标、条件金额指标、
排序、2,000 次作品聚类 bootstrap，以及全部 forecastability/oracle 拆解。

冻结的人工锚定可学习全局模型（Human-Anchored Learned Global，
`M2-WORK-LG01`）没有参与本次训练或内层选择，只保留为原定外层配对比较基线；
由于候选没有产生，配对比较未执行。

## 决策与边界

当前模型角色不变：作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration
v0.3，`M2-WORK-OA03`）仍是现行运行回退；人工锚定可学习全局模型
（`M2-WORK-LG01`）仍是研究比较基线；组合现金 ETS/Holt-Winters
（`M2-PORT-ETS01`）仍是组合参考。`activeCandidate=null`，
`approvedForAutomation=null`。

本轮没有执行后续实验臂，没有改动 exact v0.3、production、provider、数据库、
later-origin、final holdout、Canary/full160、release 或 M3 formal。后续若要继续，
应先增加交易型机制的独立作品支持，或获取在架、消费、曝光、eCPM、订单、退款、
合同有效期和运营动作等 origin 可见的机制数据；本任务不授权重跑。
