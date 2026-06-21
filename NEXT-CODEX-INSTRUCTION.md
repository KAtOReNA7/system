# 下一步交给 Codex 的指令

请使用 **GPT-5.5 高推理**，先完成 M1 技术设计，不修改业务规则，不开始功能编码。

## 必读文档

1. `README.md`
2. `docs/prd/README.md`
3. `docs/prd/00-governance/scope.md`
4. `docs/prd/00-governance/glossary.md`
5. `docs/prd/00-governance/traceability.md`
6. `docs/prd/10-data-foundation/overview.md`
7. `docs/prd/10-data-foundation/bill-import.md`
8. `docs/prd/10-data-foundation/data-quality.md`
9. `docs/prd/10-data-foundation/work-master-data.md`
10. `docs/prd/10-data-foundation/channel-master-data.md`
11. `docs/prd/10-data-foundation/classification-and-tags.md`
12. `docs/prd/40-platform/platform-baseline.md`
13. `docs/prd/70-acceptance/M1.md`
14. `docs/decisions/ADR-0001` 至 `ADR-0005`

## 本轮任务

1. 设计 M1 逻辑数据模型，列出对象、字段、唯一约束和关系，但不要生成数据库迁移代码。
2. 设计账单文件、临时解析、数据问题、正式批次和正式收入的状态与转换。
3. 给出满足业务原子性的导入方案，比较至少两种可行技术路线并推荐一种。
4. 设计撤销、重新导入、恢复点和幂等机制。
5. 设计标准作品 ID、业务形态、上线时间、分册隐藏映射和渠道别名的约束。
6. 将每项设计映射至 `REQ-*` 和 `AT-M1-*`。
7. 列出只有查看真实账单后才能完成的字段和约束，不得自行猜测。
8. 输出《M1 技术设计草案 v0.1》和《真实账单分析清单》。

## 禁止事项

- 不修改当前 PRD 业务规则。
- 不新增运营可见业务 ID。
- 不恢复两个已经删除的非统计金额字段。
- 不把“评估异常”建成正式评估结果状态。
- 不把评估任务的排队或运行状态写进评估尝试。
- 不写未经真实数据验证的阈值。
- 不开始应用代码、数据库迁移或页面开发。
