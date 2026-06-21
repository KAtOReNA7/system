# 有声书产品收入评估与年度目标系统 PRD v0.2

**状态：M1 工程冻结准备版**  
**确认日期：2026-06-20**  
**面向读者：运营、Codex、开发与测试**

## 本版本目的

v0.2 将 v0.1 的业务汇总稿改造成更适合 Codex 长期维护的文档结构：

- 每条正式规则只有一个权威定义位置；
- 使用稳定需求编号；
- 总体文档只摘要并引用专项规则；
- 冲突记录转为决策记录，不再永久充当最高优先级补丁；
- M1 需求与验收用例建立追踪关系；
- 真实数据分析后才能决定的内容继续保持待定。

## 推荐阅读顺序

1. `docs/prd/README.md`
2. `docs/prd/00-governance/scope.md`
3. `docs/prd/00-governance/glossary.md`
4. `docs/prd/10-data-foundation/overview.md`
5. `docs/prd/10-data-foundation/bill-import.md`
6. `docs/prd/10-data-foundation/data-quality.md`
7. `docs/prd/10-data-foundation/work-master-data.md`
8. `docs/prd/70-acceptance/M1.md`
9. `docs/prd/00-governance/traceability.md`
10. `NEXT-CODEX-INSTRUCTION.md`

## 版本边界

- 本包冻结 M1 开发前的业务语义、数据边界和验收框架。
- 具体数据库表、索引、框架和接口实现由后续技术设计决定。
- 评级门槛、生命周期阈值、预测算法、性能最终数值等继续保持待真实数据验证。
- v0.1 原文和 Codex 审阅报告保存在 `docs/archive/v0.1/`，仅用于历史追溯，不作为当前权威规则。
