# M2 当前状态索引 v0.32

截至 2026-07-28，M2 评价合同 v2.2 的开发评价状态继续为：

`M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION`

渠道时间生成模型 v0.2——独立渠道月度发生—条件金额核心
（Channel Generative v0.2 — Independent Monthly Occurrence × Conditional
Amount Core，`M2-CHAN-GEN02`，`M2-EXP-CHANNEL-GENERATIVE-02/G1`）已启动一次
受控私有拟合，但在候选预测前因预注册的机制父节点资格不满足而停止，最终状态为：

`M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED`

这不是模型效果失败，不产生活动候选，也不改变现有模型角色。

## 三个连续检查点

- 评价检查点 K4（冲销残差透明隔离）：四视图、精确整数守恒、冻结标签重评分和
  v2.2 开发评价激活均完成；143 条原始冲销没有删除。
- 执行检查点 K5（独立核心前置拆分）：独立核心不读取 learnedGlobal feature、
  offset、multiplier 或 strict auxiliary 状态；synthetic、泄漏和公共门禁完成。
- 执行检查点 K6（私有执行资格阻断封存）：一次拟合启动后，在 primary 第 1 个
  外层折的内层选择阶段因交易型机制父节点独立作品数不足而失败关闭；没有候选预测、
  评分或 oracle 结果。

各检查点的 exact HEAD、远端同步、Draft PR #29 与 Linux/Windows CI 状态必须在
运行时查询，不写死在长期状态索引中。

## 冲销残差与评价授权

- 原入账财务视图保留全部 143 条冲销，删除数为 0。
- 已追溯抵消为 `1,228,645.514699999995355150` 权威货币单位。
- 未分配残差为 `-267.769000000000330000` 权威货币单位，继续留在财务
  reconciliation，只从开发可建模目标透明隔离。
- 开发可建模重述现金为 `82,592,852.650900000023162789` 权威货币单位。
- 精确整数守恒差为 0；origin 后冲销进入特征的行数为 0；冻结预测修改和生成均为 0。

v2.2 只激活开发评价，不是完整财务 final restatement，不是 production 或
automation gate，也不授予模型晋升。

## 独立核心执行

| 项目 | 数量 / 状态 |
| --- | ---: |
| 主集打包行 / 逐月行 | 58,986 / 2,123,496 |
| 严格辅助集打包行 / 逐月行 | 102,743 / 1,677,147 |
| 已物化逐月标签 | 3,800,643 |
| 冻结参数配置 / 内层作品折 | 9 / 5 |
| 内层候选状态尝试 | 45 |
| 合格配置 | 0 |
| 外层候选预测 / 候选评价行 | 0 / 0 |

第 1 次尝试在拟合前因同一作品标识的历史表示形式与当前权威形式不一致而失败关闭，
没有读取候选结果。规范身份适配修复后，主集 13 条、严格辅助集 16 条打包行通过
唯一别名绑定，冲突和未解析 scope 均为 0，冻结 case 标识保持不变。

第 2 次尝试通过重述绑定前检并启动拟合。主集第 1 个外层折的 5 个内层训练折中，
交易型机制父节点只有 25–32 个独立作品，低于预注册门槛 50；其训练行数和正月份
均达标，会员型与广告型也全部达标。该资格与参数值无关，因此没有合格的完整配置。
门槛、网格、seed 和人口均未修改，也没有再次重跑。

## 未产生的结果

没有可报告的 primary/strict WAPE、signed bias、MAE、median AE、horizon、
origin/time block、top revenue、发生、条件金额、排序或 bootstrap 结果。候选输出
没有冻结，因此真实发生替换、真实金额替换、双重真实值校验、新渠道进入上限和机制
时间 basis 信息增益五项 oracle 诊断均未执行。

不得把这些未执行项写成 0，也不得据此声称 occurrence 或金额误差占主导、机制时间
basis 无效、现金特征算法已失败、测得理论上限或预测不可能。

## 当前模型角色

- 作品现行运行回退模型：作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 作品研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- v2.2 机器合同：`config/m2-evaluation-contract.v2.2.json`
- 四视图精确对账：
  `docs/analysis/m2-current/M2-reversal-four-view-reconciliation-v1.json`
- 独立核心结果：
  `docs/analysis/m2-current/M2-current-channel-generative-g1-development-v0.1.json`
- 可预测性诊断状态：
  `docs/analysis/m2-current/M2-current-channel-generative-g1-forecastability-v0.1.json`

v2.1、v2.2 上一版阻断报告、第一次渠道生成前置阻断报告及全部历史冻结结果继续
保留，不重命名、不回写。

## 保持关闭

后续渠道实验臂、production、automation、exact v0.3 改动、later-origin、
final holdout、provider、数据库、Canary/full160、release 和 M3 formal 均保持
关闭。若未来另行授权继续，应先补充交易型机制的独立作品支持或 origin 可见的
机制驱动数据，而不是降低本次冻结门槛。
