# M3-0 重启需求重构 summary v0.1

生成日期：2026-06-28

## 阶段结论

M3 已回退到未开发基线。本轮只完成 M3-0 的需求重构、输入字段确认、选题表模板、物料解析边界和用户澄清问题清单，不进入 M3 formal execution，不恢复旧 M3 实现，不写业务代码，不写 migration，不连接数据库，不读取或提交 private 材料。

## 已生成文档

| 文件 | 用途 |
|---|---|
| `docs/prd/30-new-product-evaluation/M3-restart-prd-v0.1.md` | M3 重启 PRD |
| `docs/prd/30-new-product-evaluation/M3-restart-prd-v0.1.json` | M3 重启 PRD 结构化摘要 |
| `docs/technical-design/M3-input-field-dictionary-v0.1.md` | M3 输入字段字典 |
| `docs/technical-design/M3-input-field-dictionary-v0.1.json` | 输入字段结构化字典 |
| `docs/technical-design/M3-topic-input-template-v0.1.md` | 选题表字段模板说明 |
| `docs/technical-design/M3-topic-input-template-v0.1.json` | 选题表字段模板结构化摘要 |
| `docs/technical-design/M3-material-parsing-scope-v0.1.md` | Word/PDF/PPT/物料表解析边界 |
| `docs/technical-design/M3-material-parsing-scope-v0.1.json` | 物料解析边界结构化摘要 |
| `docs/analysis/m3/M3-user-clarification-questions-v0.1.md` | 用户澄清问题清单 |
| `docs/analysis/m3/M3-user-clarification-questions-v0.1.json` | 用户澄清问题结构化摘要 |
| `docs/analysis/m3/M3-0-restart-summary-v0.1.md` | 本 summary |
| `docs/analysis/m3/M3-0-restart-summary-v0.1.json` | 本 summary 结构化摘要 |

## M3-0 主要结论

- M3 重新定位为“新作品选题评估”能力，先完成输入 readiness 和评估口径，再进入实现。
- M3 暂不输出“是否建议开发”的直接结论，暂不输出资源投入等级。
- M3 后续可设计输出：readiness、对标候选、作者排行、外部热度信号、五年预测区间、五年基准、首年预测、1-5 年拆分、新品候选评级、风险与解释、回测锚点。
- 选题表输入必须优先结构化，Word/PDF/PPT/物料表只能产生候选字段，必须人工确认后才可进入 evaluation candidate。
- M2 仍是 local candidate closeout，不是 formal complete；M3 不得把 M2 本地候选结果当作 formal 输入。
- 用户需要先回答 16 个澄清问题，优先回答 Q1、Q4、Q5、Q8、Q9、Q10、Q11、Q14、Q15、Q16。

## M2 仍需补齐的前置约束

| 项目 | 当前结论 |
|---|---|
| 版权到期缺口 | 仍阻断 formal readiness |
| 作者缺口 | 仍影响作者排行和同作者修正 |
| 版权开始缺口 | 仍影响生命周期和版权期解释 |
| 分类/标签/作品状态/音频版权状态 | 仍需基础表或人工闭环 |
| M2 formal evaluation | 未完成 |
| M2 formal export/release/audit | 未完成 |

## 下一步建议

下一步建议进入 M3-1：先让用户回答 M3 澄清问题，并提供第一份结构化选题表模板样例；随后只做 fixture/prototype 级输入校验、readiness 和字段解析设计，不进入正式执行。

## 用户答复后的下一步修订

用户已完成 Q1-Q16 答复。下一步不再要求结构化选题表作为第一输入，而是进入 M3-1 material-first fixture/prototype：以 Word/PDF/PPT/物料表/物料文本 fixture 为入口，做字段候选、readiness、渠道级点值预测和新品候选评级。

## 安全确认

- 未写业务代码。
- 未写 API。
- 未写页面。
- 未新增或修改 migration。
- 未连接数据库。
- 未执行 Docker。
- 未读取或导入 private 原始材料。
- 未提交 private Excel、CSV、JSON、Word、PDF、PPT 或原始数据。
- 未进入 M3 formal execution。
