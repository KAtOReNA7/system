# 出版行业适配的渠道月度发生—条件金额核心：受控私有开发评价

- 英文原名：Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core
- 稳定模型 ID：`M2-CHAN-PSC01`
- 所属实验臂：出版行业规模适配渠道核心实验的核心臂（`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`）
- 机器结论：原始候选完成评价但未达到冻结门或出现实质伤害
  （`M2_PUBLISHING_SCALE_CORE_FAIL`）

## 先说结论

本轮已经真正拟合并完整评价原始候选
（raw candidate，`M2-CHAN-PSC01-RAW`）。原始候选输出先冻结，随后才运行评价与
可预测性/oracle 诊断；运行回退和任何 selected pipeline 都没有覆盖原始结果。
冻结原始候选预测共 3318819 行。本轮采用评价 v2.2
开发可建模冲销重述（`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`），没有启用
development-only positive-cash 后备口径。
这是重复使用开发窗口的受控证据，不是独立 later-origin 或 final holdout 证据，
也不授权生产、自动化、发布或合并。

## 点预测总账

| 对象 | 主评价（primary）WAPE | 严格滚动（strict）WAPE | 主评价 signed bias | 严格滚动 signed bias |
|---|---:|---:|---:|---:|
| 冻结研究基线（Frozen learnedGlobal，`M2-WORK-LG01-FROZEN-G0`） | 0.44310049 | 0.41281268 | -0.12165171 | -0.03786001 |
| 全局父层消融（global-parent ablation） | 0.97271040 | 0.96614495 | -0.95672407 | -0.93288310 |
| 原始候选（raw candidate，`M2-CHAN-PSC01-RAW`） | 0.92408663 | 0.91533339 | -0.88928240 | -0.85410647 |

原始候选相对冻结研究基线的 WAPE 变化为：主评价
-108.5501%，严格滚动
-121.7309%。主评价的绝对误差为
416029696.40677136，实际现金分母为
450206377.48779923，MAE 为 34556.83166432，
绝对误差中位数为 948.10657874；严格滚动对应值为
458012200.67225587、500377466.08460277、
6162.70453004 和 141.60729007。
2,000 次作品聚类配对 bootstrap 的相对 WAPE 95% 区间，主评价为
[-2.48939466, -0.30710745]，严格滚动为
[-2.06232324, -0.55150692]；两者整体都低于 0，
说明相对冻结研究基线的伤害不是少量作品造成的偶然波动。

## 与现行运行回退的同人口比较

现行运行回退是作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`），角色保持不变。
这里只比较 exact same-case、same-target、same-origin、same-horizon 的交集：

| 口径 | 同人口 case 数 | 运行回退 WAPE | 原始候选 WAPE | 原始候选相对变化 |
|---|---:|---:|---:|---:|
| 主评价（primary） | 12039 | 1.00000000 | 0.92408663 | 7.5913% |
| 严格滚动（strict） | 74320 | 1.00000000 | 0.91533339 | 8.4667% |

## 发生、条件金额与结构

主评价发生部分的 Brier score、log loss、PR-AUC、Average Precision 和辅助
ROC-AUC 分别为 0.25234024、5.05660224、
0.73754706、0.73754724、
0.70939698。条件正金额 WAPE、MAE 和绝对误差中位数分别为
0.94971401、663.49364375、
23.37447240。

候选的主要限制是条件正金额严重低估，而不是 occurrence 是否发生。候选冻结后的
retrospective oracle 诊断中，真实条件金额替换最多可移除的绝对误差远高于真实发生
替换；future-first 新渠道进入构成次要但非零的结构上限。该诊断不参与训练、选择或
晋级门。

完整机器记录还包含：发生概率校准、各 horizon、各严格滚动时间块、三种变现机制、
五个重点平台、支持层级、top 1%/5%/10% 正收入与绝对现金及冲销误差归因、
排序与 top capture、层级相对父层增量，以及 2,000 次
`standardWorkId` 作品聚类 bootstrap。

稀疏平台实际层级：微信读书（`POOLED_PARENT` / `SHRUNK_FIT`）；猫耳（`POOLED_PARENT`）；克拉漫播（`POOLED_PARENT`）。月度行没有被当作独立作品；作品数、作品—渠道
scope 数与月度行数在每个 outer receipt 中分开记录。三级分类和授权关系均保持
只报告（`REPORT_ONLY`），不估参、不路由、不做 current-only 回填。

## 决策边界

冻结门结论为失败，当前 cash-only 路线不值得继续在同一开发窗口调参。下一步若有
独立授权，最有价值的证据是 forecast-origin 可得的历史商业状态、可用量与消费、
曝光与 eCPM、订单与退款、合同及运营动作，而不是继续只从现金历史中重塑金额。
现行运行回退、production、exact v0.3、provider、数据库、
final holdout、Canary/full160、release、M3 formal 和 PR 合并均未获得授权。
