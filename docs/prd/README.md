# PRD 阅读与维护规则

| 项目 | 内容 |
|---|---|
| 当前版本 | v0.2 |
| 当前阶段 | M2 本地正式执行与 238 条复核已收口；M2 v2 完整性修复已完成并等待外部审查；M3 formal 暂缓 |
| 最后确认 | 2026-07-18 |
| 权威规则 | 各领域专项文档中带稳定 `REQ-*` 编号的条目 |
| 决策历史 | `docs/decisions/ADR-*.md` |
| 待数据验证 | `60-validation/pending-data-decisions.md` |
| 验收 | `70-acceptance/` |

当前阶段说明：M2 的 3053 部权威范围、238 条业务复核与隔离本地 formal execution 已完成严格对账；旧 v1.1 conditional 已被拒绝，C1、legacy C2-R、C2-R.1、C2、C3 均为 development `FAIL`。M2 v2 V2-A 已完成，V2-B.1–B.8 为历史 checkpoint，B.8 原始决定仍为 `CANARY_CONDITIONAL`；完整性修复后合同的离线 restatement 为 `CANARY_FAIL`。所有历史授权标记均为 `historical / superseded / not authorization`；当前只以 `docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md` 为导航。PR #7 保持 Draft/open/unmerged；`full160Authorized=false`、`nextDevelopmentReadiness=NOT_AUTHORIZED`。M3 formal 仍暂缓。

## 单一事实来源原则

1. 详细规则只在一个领域文档中定义。
2. 其他文档只引用需求编号，不复制完整规则正文。
3. 规则变更时，先更新权威领域文档，再新增或更新 ADR。
4. 已被替代的旧结论留在归档或 ADR 中，不继续参与实现优先级判断。
5. 未经真实数据验证的阈值不得写死在代码中。

## 需求状态

- **FROZEN**：业务含义已确认，可进入技术设计与验收设计。
- **PENDING-DATA**：原则已确认，具体阈值或算法需真实数据验证。
- **DRAFT**：仍在工程整理，不能直接作为验收依据。
- **SUPERSEDED**：已被后续决策替代，仅供追溯。

## 路径说明

- `00-governance`：范围、术语、文档状态、决策与追踪。
- `10-data-foundation`：M1 数据基础的权威需求。
- `20-evaluation`：新品和老品评估的共同规则与后续专项入口。
- `30-calibration`：算法校准、反馈与 Codex 修复。
- `40-platform`：任务、通知、环境、安全和恢复。
- `50-annual-target`：年度目标。
- `60-validation`：真实数据分析后决定的事项。
- `70-acceptance`：里程碑验收。
