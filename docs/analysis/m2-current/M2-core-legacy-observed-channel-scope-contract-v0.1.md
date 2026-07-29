# M2 核心老品—已有渠道范围合同 v0.1

> 实验：M2 核心老品—已有渠道范围纠偏、冻结重评分与尾部干扰验证 v0.1（M2 Core Legacy Work–Observed Channel Scope Correction, Frozen Rescore and Tail Interference Test v0.1，`M2-EXP-CORE-LEGACY-POPULATION-01`）
>
> 合同状态：已冻结、等待分阶段真实账单验证（`SCOPE_CONTRACT_FROZEN_PENDING_STAGED_EVALUATION`）

## 1. 当前 M2 唯一目标

当前 M2 只预测：

> 对预测起点时已经产生第一笔正分成账单且至少积累 3 个完整账单月的老作品，在同一预测起点时已经产生第一笔正分成账单且至少积累 3 个完整账单月的 canonical 渠道上，预测未来 3、6、12、36 个月的开发可建模分成收入。

正式粒度为：

`standardWorkId × origin 时已有成熟 canonical 渠道 × origin × horizon`

作品总额只允许把同一人口内的作品×已有成熟渠道预测相加，不能混入其他渠道、其他作品或公司收入补差。

## 2. 不属于当前 M2 的收入

以下收入明确位于当前 M2 范围之外：

- 预测起点后才产生第一笔正账单的新作品收入；
- 老作品在预测起点后才首次产生正账单的新渠道收入；
- Core80/Core90 以外的尾部作品收入；
- 买断及其他非分成现金；
- 公司全部未来收入、经营目标或目录总额；
- 为补齐公司收入而建立的长尾池、未来新品池或新增渠道池。

范围外不是“预测为 0”。模型对范围外人口不预测，其金额只在覆盖率和范围诊断中报告。

## 3. 老作品与已有渠道资格

- 作品身份唯一使用 `standardWorkId`。ISBN、版次、音频产品 ID 与平台条目不是独立预测对象。
- 老作品：从作品首笔正分成账单月至 origin，至少存在 3 个完整账单月份。
- 已有成熟渠道：从作品×canonical 渠道首笔正分成账单月至 origin，至少存在 3 个完整账单月份。
- 两项资格必须同时满足；中间月份可以为零。
- 不足 3 个月的作品或渠道不进入候选误差，不按预测为零处理，并单独报告其未来实际金额占比。

## 4. 动态 Core80/Core90

Core80/Core90 是训练人口、服务人口和评价人口筛选器，不是公司组合模型的组成部分。

每个 origin 独立重算：

- 最近完整账单月为 1 月或 2 月：使用截至 origin 的最近 6 个完整账单月；
- 最近完整账单月为 3 月至 12 月：使用当年 1 月至 origin；
- 只汇总 origin 时已有成熟渠道上的开发可建模分成收入；
- 按作品参考收入降序选择累计覆盖 80%/90% 的最小集合；
- 截止收入并列时全部纳入，并记录超额覆盖；
- 起点 Top20/Top50 仅作诊断；
- 禁止用未来 actual、当前固定名单或最终 TopN 回看历史。

作品可以随 origin 进入或离开 Core，这属于合同要求，不是数据不稳定。

## 5. 正确 actual 与覆盖率

候选 actual 是：

`动态 Core 作品 ∩ origin 时成熟老作品 ∩ origin 时成熟已有渠道`

在未来 horizon 内的开发可建模分成收入（Sales-Share Revenue Development-Modelable Reversal Restatement v1，`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。

继续保留全部 143 条原始冲销记录；不得删除原始冲销或重建冲销模块。

Core 未来覆盖率的分母只能是：

> 所有 origin 时成熟的老作品×已有成熟渠道在同一未来窗口内的分成收入。

不得使用公司全部未来收入作分母。

## 6. 训练与评价防泄漏

- 每个训练 pseudo-origin 必须只读取当时可见现金，并独立重算 Core80/Core90。
- 作品尚未进入 Core 时的预测案例不能进入 Core-only 训练目标。
- 作品成为 Core 后，可以使用其在 origin 前已经可见的历史账单作为特征。
- 不得只在评价阶段筛选 Core、同时继续让 Core90 外尾部主导 Core-only 训练。
- 三级分类与作品来源只用于诊断，不改变 Core 资格，也不作为直接金额倍率。

## 7. 模型与组合研究边界

分层收入组合模型 v0.1（Layered Revenue Composition Model v0.1，`M2-PORT-LRC01`）保留历史模型 ID、结果和失败状态，但当前角色增加：

`OUT_OF_CURRENT_M2_SCOPE_PORTFOLIO_RESEARCH`

组合现金参考（Company ETS Revenue Reference，`M2-PORT-ETS01`）同样不参加作品模型排名。不得用未来新增作品、新增渠道或公司总额指标判断当前 M2 作品模型优劣。

## 8. 本任务封闭边界

本合同授权冻结预测重评分和一次固定训练人口消融，但不授权：

- 新特征、新模型结构或无界调参；
- production loader、route、API 或现行运行回退角色变更；
- later-origin、final holdout、provider、数据库、Canary/full160、release；
- 自动晋升候选、自动化批准或 M3 formal；
- 合并拉取请求。

历史文件、历史模型 ID、digest、冻结预测、成绩和状态码保持不可变。
