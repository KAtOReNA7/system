# M3 restart PRD v0.1

生成日期：2026-06-28

状态：M3-0 需求重构与输入字段确认。当前不是 M3 formal execution，不是正式发布，不替代人工选题决策。

## 1. 当前目标

M3 重新开发以“新品选题评估”为主，先解决输入定义、readiness、材料解析边界和用户确认问题，再决定是否进入 fixture/prototype 实现。

当前 M3-0 只确认：

- M3 做什么；
- M3 不做什么；
- 用户需要提供哪些输入；
- 哪些输入来自 M2/老品库；
- 哪些输入来自外部平台；
- 哪些字段缺失会阻断 numeric forecast；
- 哪些字段只影响解释、评级、对标或风险。

## 2. 当前不做什么

- 不执行 M3 formal evaluation。
- 不生成正式新品评估结果。
- 不开放正式 task/export/write API。
- 不写业务代码。
- 不写 migration。
- 不连接数据库。
- 不读取或提交 private 原始材料、private Excel/CSV/JSON、Word/PDF/PPT 原文。
- 不输出“是否建议开发”的直接结论。
- 不输出资源投入等级。
- 不绕过 M2 readiness 缺口。

## 3. M2 前置约束

当前 M2 是 local candidate closeout，不是 formal complete。M3 可以参考 M2 本地候选算法经验，但不得把 M2 local candidate 当作 formal M3 输入。

M2 后续补全项仍包括：

| 数据项 | 当前缺口/状态 | 对 M3 的影响 |
|---|---:|---|
| 版权到期 | 仍有 522 个在用户部分填写后未闭环；历史报告中原始缺口为 610 | 阻断 formal readiness 和部分老品对标解释 |
| 作者 | 75 | 影响同作者修正和作者排位 |
| 版权开始 | 85 | 影响生命周期、版权期和回测解释 |
| 一级分类 | 3054 | 阻断类别曲线和同类对标 |
| 二级分类 | 3054 | 阻断细分类别策略 |
| 必要标签 | 3054 | 阻断运营解释和后续 M4 校准 |
| 作品状态 | 3054 | 阻断货架/下架 formal 判断 |
| 音频版权状态 | 3054 | 阻断版权有效性 formal 判断 |
| 到期但仍有收入样本 | 142 个复核桶 | 需要业务解释 |
| 版权有效但收入稀疏样本 | 92 个复核桶 | 需要运营/版权确认 |

## 4. M3 输入范围

M3 输入至少覆盖：

| 字段 | 用途 | 缺失影响 |
|---|---|---|
| 书名 | 选题身份 | 阻断 numeric forecast |
| 作者 | 作者排位、同作者修正 | 阻断 numeric forecast |
| 来源 | 出版物/原创网文/其他分流 | 阻断 numeric forecast |
| 完整三级分类 | 类别曲线、同类对标 | 阻断 numeric forecast |
| 简介 | 内容判断和材料确认 | 阻断 numeric forecast |
| 字数 | 有声体量、收入容量 | 阻断 numeric forecast |
| 完结状态 | 预测曲线与风险 | 阻断 numeric forecast |
| 阅读量 | 热度信号 | 阻断 numeric forecast |
| 收藏量 | 热度信号 | 阻断 numeric forecast |
| 评分 | 质量/口碑信号 | 阻断 numeric forecast |
| 评论量 | 口碑可信度 | 影响解释和风险 |
| 同名有声状态 | 竞争/重复开发判断 | 阻断 numeric forecast |
| 影视/动漫/漫画/游戏改编信号 | 热度和放大因素 | 影响评级、风险和解释 |
| 站外热度 | 外部热度映射 | 阻断 numeric forecast |
| 目标渠道 | 渠道结构说明 | 阻断 numeric forecast |
| 版权期限范围 | 可开发窗口 | 阻断 numeric forecast |
| 运营推荐理由 | 人工输入依据 | 阻断 numeric forecast |
| 运营指定对标 | 运营并列对标 | 影响对标和解释 |
| 材料来源 | 可追溯性 | 影响风险 |
| 材料更新时间 | 时效性 | 影响风险 |
| 输入确认人 | 审计和责任边界 | 影响 readiness |
| readiness 状态 | 是否可评估 | 控制输出 |

## 5. 输入来源

| 来源 | 允许输入 | 说明 |
|---|---|---|
| 用户选题表 | 结构化字段、运营推荐理由、运营指定对标 | 建议 Excel/CSV/JSON，private 保存 |
| Word/PDF/PPT/物料表 | 候选字段抽取 | 只作为候选，不自动确认 |
| M2/老品库 | 标准作品、历史对标、作者样本、收入参考、分类/标签候选 | 当前只能作为本地候选参考，formal 前需 readiness |
| 外部平台 | 阅读、收藏、评分、评论、热度、榜单、改编信息 | 需记录来源、时间和时效性 |
| 人工确认 | 字段修正、对标确认、缺口补录 | 人工确认后才可进入 evaluation candidate |

## 6. M3 输出暂定范围

M3 后续可输出：

- readiness；
- 对标候选；
- 作者排位；
- 外部热度信号；
- 五年累计预测区间；
- 五年基准；
- 首年预测；
- 第 1-5 年拆分；
- 新品评级；
- 风险与解释；
- 回测锚点。

当前 M3-0 只设计这些输出，不实现。

## 7. 明确不输出

- 不输出“是否建议开发”的直接结论。
- 不输出资源投入等级。
- 不生成正式评估结果。
- 不开放正式 task/export/write API。
- 不将 private 材料或表格写入公开仓库。

## 8. 验收标准

M3-0 验收标准：

- 输入字段字典完整；
- 选题表模板字段明确；
- 物料解析范围明确；
- 用户确认问题清单完整；
- summary JSON 可解析；
- 所有文档不包含真实作品名、作者名、渠道名、原始账单行、原始台账行、完整作品明细、真实选题材料、Word/PDF/PPT 原文、private Excel、绝对 data 路径、连接串或密钥。

## 9. 下一步

用户回答 M3 clarification questions 后，再进入 M3-1 输入 readiness 与材料解析设计。M3 formal execution 仍禁止。

## 10. 用户答复后的修订口径

本 v0.1 已被用户 Q1-Q16 答复修订，后续开发以 `M3-restart-prd-v0.2` 和 `M3-user-clarification-answers-v0.1` 为准：

- M3 第一入口改为选题物料优先，结构化选题表降级为 fallback。
- `source` 只允许出版物、原创网文；不保留“其他”。
- 分类可以系统候选，但必须用户确认，不能自动确认。
- readiness 只阻断核心字段；非核心字段缺失输出 warning、limitation 或 risk。
- 预测输出改为渠道级 point estimate，`totalForecast = sum(channelForecasts)`。
- 不输出 forecast range、high/base/low、optimistic/pessimistic。
- 沿用 S+/S/A/B/C/D/E，但标记为新品候选评级。
- 禁止输出“是否建议开发”和资源投入等级。
