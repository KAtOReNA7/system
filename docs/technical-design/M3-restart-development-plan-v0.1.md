# M3 重新开发计划 v0.1

生成日期：2026-06-28

状态：M3 restart planning only。当前仓库已回退到 M3 未开发基线；本计划只定义重新开展 M3 的顺序、门禁和验收，不进入 M3 formal execution。

## 1. 当前基线

| 项目 | 状态 |
|---|---|
| 当前 HEAD | `cd951ba4bdc6008f3839ae76c00c451394c06479` |
| 本地与远端 | `HEAD = origin/main` |
| M3 PRD/API/实现/页面/测试 | 已从当前版本移除 |
| 保留的 M3 文件 | `docs/analysis/m3/M3-parallel-planning-boundary-v1.*`、`docs/analysis/m3/M3-new-product-evaluation-implementation-plan-summary-v0.1.json` |
| 当前允许动作 | M3 重新规划、字段设计、接口依赖、fixture/prototype 方案、测试计划 |
| 当前禁止动作 | M3 formal execution、正式 task/export/write API、正式发布、绕过 M2 readiness |

## 2. M2 前置缺口

M3 重新开发前必须持续提醒：当前 M2 是 local candidate closeout，不是 formal complete。

| 数据项 | 当前缺口/状态 | 对 M3 的影响 |
|---|---:|---|
| 版权到期 | 仍有 522 个在用户部分填写后未闭环；历史报告中原始缺口为 610 | 不能作为 M3 formal 输入；影响后续老品对标可用性 |
| 作者 | 75 | 影响作者排位、同作者修正和标准作品引用 |
| 版权开始 | 85 | 影响生命周期、版权期和老品参考解释 |
| 一级分类 | 3054 | 阻断类别曲线、同类对标和页面筛选 |
| 二级分类 | 3054 | 阻断细分策略和类别曲线可信度 |
| 必要标签 | 3054 | 阻断运营解释、策略分层和 M4 校准 |
| 作品状态 | 3054 | 阻断货架/下架 formal 判断 |
| 音频版权状态 | 3054 | 阻断版权有效性 formal 判断 |
| 到期但仍有收入样本 | 142 个复核桶 | 需要解释结算滞后、续约未入账、渠道滞后或异常 |
| 版权有效但收入稀疏样本 | 92 个复核桶 | 需要运营/版权确认是否仍可运营、仅观察或无需动作 |

证据：

- `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
- `docs/analysis/m2-real-data/M2-master-data-readiness-gap-v1.md`
- `docs/analysis/m2-real-data/M2-copyright-expiry-gap-readiness-v1.md`
- `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`

## 3. 重新开发原则

1. 先重新确认 M3 PRD，不沿用已回退的 M3 实现。
2. 先做输入表/材料字段设计，再做算法和页面。
3. M3 prototype 必须和 M3 formal execution 分离。
4. fixture/prototype 可以使用 synthetic 数据；真实本地材料只能放在 private/data 目录，不得提交。
5. M3 评估结果必须显式标记 non-formal，直到用户授权 formal。
6. 不在 M3 初期写正式 migration。
7. 不开放正式 task/export/write API。
8. 不把 M2 local candidate 当作 formal M3 输入。

## 4. 阶段拆分

### M3-0 需求重构与问题清单

目标：重新确认 M3 是否以“选题评估”为主，还是先做“物料解析与字段抽取”。

交付：

- M3 restart PRD v0.1。
- M3 输入字段字典。
- M3 选题表模板字段。
- M3 物料表/Word/PDF/PPT 解析范围说明。
- 用户确认问题清单。

验收：

- 明确 M3 做什么、不做什么。
- 明确哪些输入由用户提供，哪些来自 M2/老品库，哪些来自外部平台。
- 明确 M3 formal 仍被 M2 readiness 阻断。

### M3-1 输入 readiness 与材料解析设计

目标：先解决“用户给什么表/物料，系统如何判断能不能评估”。

交付：

- 选题表模板。
- Word/PPT/PDF 物料字段抽取规则。
- readiness 缺口枚举。
- 输入字段中文说明和示例。

验收：

- 缺书名、作者、来源、完整三级分类、简介、字数、完结状态、阅读/收藏/评分、同名有声、影视动漫、站外热度、目标渠道、版权期限范围、运营推荐理由时，必须阻断 numeric forecast。
- 不提交原始材料。

### M3-2 对标数据依赖设计

目标：定义新品评估如何使用老品对标，但不依赖 formal M2 未完成字段。

交付：

- 对标候选字段清单。
- 同作者作品规则。
- 类别曲线依赖项。
- 买断收入剔除/单列规则。
- M2 缺口对 M3 对标的影响说明。

验收：

- 对标不超过 3 部。
- 同作者作品不占对标名额。
- M2 分类/标签缺口必须标记为对标质量风险。

### M3-3 预测与评级方案

目标：先形成可解释预测方案，再实现代码。

交付：

- 五年累计预测区间规则。
- 五年基准值和首年预测规则。
- 第 1-5 年拆分规则。
- 渠道结构说明口径。
- 新品评级规则。
- 支撑因素、限制因素、风险上限。

验收：

- 不输出固定“是否建议开发”结论。
- 不输出资源投入等级。
- 预测必须带输入依赖、权重和风险解释。

### M3-4 fixture/prototype 实现

目标：只用 synthetic/fixture 数据验证 API、页面和测试形状。

交付：

- fixture engine。
- read-only API。
- read-only admin prototype。
- M3 test suite。
- no-formal boundary audit。

验收：

- 所有响应显式标记 fixture/non-formal。
- formal 请求必须阻断。
- write-like route 不可用。
- CI 不依赖真实数据或私有材料。

### M3-5 本地 private 选题试跑

目标：在用户明确授权后，用 private 选题表或物料表做本地试跑，不提交输入输出。

交付：

- private input loader。
- private local result package。
- 脱敏聚合报告。
- readiness gap report。

验收：

- 输入/输出位于 `data/private-output/**` 或其他 gitignored private 目录。
- 不提交 `.docx/.xlsx/.csv` private 明细。
- 不连接生产、共享或 staging-like 数据库。

### M3-6 formal readiness 复核

目标：决定是否能从 prototype 进入 formal M3。

前置：

- M2 readiness rerun 通过，或用户明确批准 formal exception。
- 版权到期、作者、版权开始、分类、标签、作品状态、音频版权状态缺口闭环或形成正式豁免。
- M3 PRD/API/Data/Page/Test 方案经用户确认。

验收：

- 明确是否允许写 migration。
- 明确是否允许正式 task/export/write API。
- 明确是否允许正式评估结果落库。

### M3-7 formal execution

目标：仅在用户单独授权后进入。

当前状态：禁止。

## 5. 推荐下一步任务

下一轮建议执行：

`M3-0 需求重构与输入字段确认`

范围：

- 只新增 M3 restart PRD、输入字段字典、用户问题清单和 summary。
- 不写业务代码。
- 不写 migration。
- 不连接数据库。
- 不读取或提交 private 原始材料。
- 不进入 formal M3。

## 6. 验证要求

只改文档时至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
```

如后续修改代码，还必须运行：

```bash
npm run smoke
```

任何失败不得伪造通过。
