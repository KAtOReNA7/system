# M2 当前状态索引 v0.26

截至 2026-07-27，本轮只完成模型谱系、命名、成绩人口、只读查询和中英双语报告
治理；模型执行、训练、调参、候选选择与私有评价次数均为 0，模型预测和历史成绩
均未改变。

## 当前权威

- 唯一机器权威：`config/m2-model-registry.v1.json`。
- 中文阅读目录：
  `docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`。
- 全仓身份审计：
  `docs/analysis/m2-current/M2-model-identity-audit-v1.md`。
- 用户报告规范：
  `docs/analysis/m2-current/M2-user-facing-bilingual-reporting-standard-v1.md`。
- 只读查询：`npm run m2:model -- <command>`。

历史文件、历史 ID、schema、digest 和冻结结果继续保持不可变；登记表只增加当前
stable ID、别名、角色、成绩人口和可比组解释，不回写历史 artifact。

## 当前模型角色

- 现行运行回退模型（operational fallback）是作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线（research baseline）是人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考（portfolio reference）是组合现金 ETS/Holt-Winters 模型
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动候选（active candidate）为无（`null`）。
- 自动化批准模型（approved for automation）为无（`null`）。
- 渠道时间生成 v0.2（Channel Generative v0.2，
  `M2-EXP-CHANNEL-GENERATIVE-02`）仍因前置合同语义不完整而阻断
  （`GENERATIVE_V02_CORE_EXECUTION_BLOCKED`）；核心候选臂 G1–G3
  （`M2-EXP-CHANNEL-GENERATIVE-02/G1-G3`）仍未执行，不得写成失败。

exact v0.3 的“开发窗口比较优胜模型”和“现行运行回退模型”是不同层级的描述；
learnedGlobal 只在渠道生成实验内部承担冻结基线回退，在全局登记角色中是研究比较
基线。两者不构成模型晋升冲突。

## 成绩解释

- 只有目标、现金权威、案例人口或明确相同案例交集、horizon、粒度、
  as-of/label maturity、实际值定义和评价族全部一致时才能排名。
- 作品点预测、组合预测、排序/分配和风险/区间是不同能力，不进入统一排行榜。
- raw candidate、selected pipeline 和 operational fallback 分开登记；安全回退
  不能覆盖 raw candidate 的成绩或 raw FVA。
- blocked 表示未满足前置条件；failed 表示已经执行但未通过；not executed 表示
  没有候选输出。三者不得互换。

## 查询示例

```bash
npm run m2:model -- status
npm run m2:model -- list
npm run m2:model -- show M2-WORK-OA03
npm run m2:model -- aliases exact-v0.3
npm run m2:model -- experiment M2-EXP-CHANNEL-GENERATIVE-02
npm run m2:model -- explain G1
npm run m2:model -- compare M2-WORK-OA03 M2-WORK-LG01
```

查询只读取公开登记表，不执行模型或访问 private capability。

下一步只建议先做评价体系审计（evaluation-system audit），重新检查目标、人口、
粒度、horizon、窗口和门禁的可解释性；不自动恢复渠道时间生成 v0.2 / G0
（冻结基线复算，`M2-EXP-CHANNEL-GENERATIVE-02/G0`），不训练新候选，也不打开
holdout。

## 本轮边界

模型登记治理检查点 K0（登记表、命名与长期规则，
`M2-MODEL-REGISTRY-V1/K0`）和模型登记治理检查点 K1（目录、查询与状态索引，
`M2-MODEL-REGISTRY-V1/K1`）只属于治理工作。production、exact v0.3 预测路径、
渠道时间生成 v0.2 的核心候选臂 G1–G3
（`M2-EXP-CHANNEL-GENERATIVE-02/G1-G3`）、后续层 G4–G6
（`M2-EXP-CHANNEL-GENERATIVE-02/G4-G6`）、provider、数据库、final holdout、
Canary/full160、release 和 M3 formal 均未改变或打开。

状态索引 v0.25 继续作为渠道生成 core 阻断时点的历史状态页，不被本页改写。
