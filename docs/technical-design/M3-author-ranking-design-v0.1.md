# M3 author ranking design v0.1

生成日期：2026-06-28

状态：M3-2 fixture/prototype design。本文只定义 synthetic fixture 作者排位，不读取真实作者明细。

## 1. 目标

作者排位用于为新品候选评级和后续预测解释提供作者历史表现参考。当前只作为解释输入，不直接改写 channel point forecast。

## 2. 启用规则

同作者至少有 3 部可测算 synthetic fixture 作品时，作者排位启用。

不足 3 部时：

- `enabled = false`
- `disabledReason = insufficient_measurable_author_works`
- 不输出作者层级
- 不输出中位月均或最高作品月均

## 3. 输出结构

`authorRanking` 包含：

- `enabled`
- `disabledReason`
- `comparableAuthorWorkCount`
- `measurableWorkCount`
- `medianMonthlyEquivalent`
- `topWorkMonthlyEquivalent`
- `authorTier`
- `rankingExplanation`
- `limitations`
- `nonFormal`
- `fixtureOnly`
- `notForFormalDecision`

## 4. 买断处理

作者排位可以把 pure buyout 作品作为历史价值参考，但不得把买断金额混入实销曲线对标。buyout plus sales 作品在对标模块中区分实销部分和买断部分。

## 5. 安全边界

作者排位只使用 synthetic fixture data，不读取真实作者明细、不读取 private 物料、不连接数据库、不写 migration、不进入 formal execution。
