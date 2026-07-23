# M1 需求追踪矩阵

| 需求编号 | 权威文档 | 验收用例 |
|---|---|---|
| REQ-DATA-IMPORT-001 | bill-import.md | AT-M1-001 |
| REQ-DATA-IMPORT-002 | bill-import.md | AT-M1-002 |
| REQ-DATA-IMPORT-003 | bill-import.md | AT-M1-003 |
| REQ-DATA-IMPORT-004 | bill-import.md | AT-M1-004 |
| REQ-DATA-IMPORT-005 | bill-import.md | AT-M1-005 |
| REQ-DATA-IMPORT-006 | bill-import.md | AT-M1-006 |
| REQ-DATA-IMPORT-007 | bill-import.md | AT-M1-007 |
| REQ-DQ-001 | data-quality.md | AT-M1-010 |
| REQ-DQ-002 | data-quality.md | AT-M1-011 |
| REQ-DQ-003 | data-quality.md | AT-M1-012 |
| REQ-WORK-001 | work-master-data.md | AT-M1-020 |
| REQ-WORK-002 | work-master-data.md | AT-M1-021 |
| REQ-WORK-003 | work-master-data.md | AT-M1-022 |
| REQ-WORK-004 | work-master-data.md | AT-M1-023 |
| REQ-WORK-005 | work-master-data.md | AT-M1-024 |
| REQ-WORK-006 | work-master-data.md | AT-M1-025 |
| REQ-WORK-007 | work-master-data.md | AT-M1-026 |
| REQ-WORK-008 | work-master-data.md | AT-M1-027 |
| REQ-WORK-009 | work-master-data.md | AT-M1-028 |
| REQ-WORK-010 | work-master-data.md | AT-M1-029 |
| REQ-WORK-011 | work-master-data.md | AT-M1-031 |
| REQ-CHANNEL-001 | channel-master-data.md | AT-M1-030 |
| REQ-CLASS-001 | classification-and-tags.md | AT-M1-040 |
| REQ-CLASS-002 | classification-and-tags.md | AT-M1-041 |
| REQ-PLATFORM-001 | platform-baseline.md | AT-M1-050 |
| REQ-PLATFORM-002 | platform-baseline.md | AT-M1-051 |
| REQ-PLATFORM-003 | platform-baseline.md | AT-M1-052 |

## M2 v2 完整性修复追踪矩阵

本矩阵只追踪已经收口的完整性修复，不授权 provider、Canary、full160、模型训练或下一开发阶段。public 结论以 remediation summary 与 restatement 为准；100% 复审和 PR roundtrip 细节以 Git ignored private audit v0.2 为准。

| 需求编号 | 权威合同/决策 | 实现与验证入口 |
|---|---|---|
| REQ-M2V2-INT-001 verifier 零写入、幂等、跨阶段隔离 | `M2-v2-verifier-readonly-contract-v0.1.md/json` | B5/B6/B7/B8 verifier；`test/m2-v2-integrity-remediation-contract.test.js`；synthetic verifier CI |
| REQ-M2V2-INT-002 immutable receipt envelope 与 cache-hit runtime view 分离 | `M2-v2-request-state-atomic-binding-v0.1.md/json` | receipt-envelope v0.2 与 digest migration synthetic tests |
| REQ-M2V2-INT-003 state/cache/receipt/counter 原子绑定 | `M2-v2-request-state-atomic-binding-v0.1.md/json` | transaction binding、failure rollback 与 request-ledger tests |
| REQ-M2V2-INT-004 private derived state 只从权威材料离线恢复 | `M2-v2-private-state-recovery-contract-v0.1.md/json` | ignored recovery staging、双轮 hash proof 与 idempotency tests |
| REQ-M2V2-INT-005 B8 五类 fail-closed 合同缺口 | integrity remediation pre-registration；B8 current contracts | zero denominator、source classification、category diversity、eventTime lineage、conflict-family tests |
| REQ-M2V2-INT-006 默认回归测试完整性 | decision register DEC-014 | `npm test` 纳入 5 个历史关键测试、B4–B8 与 integrity synthetic tests |
| REQ-M2V2-INT-007 tracked/staged/nonignored-untracked secret guard | AGENTS 当前边界 | `scripts/check-no-real-data.mjs`；`test/check-no-real-data.test.js` |
| REQ-M2V2-INT-008 Linux 与 Windows 无 private/provider CI | `.github/workflows/ci.yml` | `ubuntu-latest`、`windows-latest`；Node 24、Python、check/lint/build/test/smoke/e2e/synthetic |
| REQ-M2V2-INT-009 current/superseded 与历史 restatement | current-state index；DEC-013/014 | versioned index、restatement、summary 与 PR description canonical source |
| REQ-M2V2-INT-010 安全停止边界 | README、AGENTS、NEXT | provider delta=0；Canary 未执行；full160/V2-C/V2-D/model/holdout/C4/M3/release/merge 均未授权；等待外部审查 |
