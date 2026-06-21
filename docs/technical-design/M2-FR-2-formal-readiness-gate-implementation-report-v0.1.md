# M2-FR-2 formal readiness gate implementation report v0.1

## 1. 实现范围

本轮基于 M2-FR-1 formal persistence 模型，实现了 formal evaluation 前的只读 readiness gate 最小闭环：

- 纯 domain 模块：`src/domain/oldProductEvaluation/formalReadinessGate.js`
- synthetic fixture：`test/fixtures/m2FormalReadinessGate.fixture.js`
- 只读 CLI：`scripts/check-m2-formal-readiness-fixture.mjs`
- API 契约文档：`docs/api/M2-formal-readiness-gate-api-contract-v0.1.md`
- 自动化测试：`test/m2-formal-readiness-gate.test.js`

本轮没有实现 runtime API，没有连接数据库，没有写数据库，没有执行 migration，没有激活 `mapping_version`，没有调用 `switch_mapping_version`，没有执行 formal evaluation。

## 2. readiness gate 输入

`evaluateFormalReadiness(input)` 只接受显式传入的 snapshot/fixture 对象，不读取数据库、文件或环境变量。

输入字段包括：

- `standardWorkId`
- `candidateVersion`
- `mappingVersion`
- `basicInfoVersion`
- `copyrightStart`
- `copyrightEnd`
- `blockingReviewStatus`
- `advisoryReviewFlags`
- `latestCompleteMonth`
- `cutoffMonth`
- `hasIncomeFacts`
- `hasInputSnapshot`
- `requiredFields`
- `reviewItems`
- `formalPersistenceEnabled`
- `evaluationTaskApiEnabled`
- `exportApiEnabled`
- `notForFormalDecision`

## 3. readiness gate 输出

`evaluateFormalReadiness(input)` 输出：

- `standardWorkId`
- `readinessStatus`: `ready` / `blocked` / `warning_only`
- `formalEvaluationAllowed`
- `blockingReasons`
- `advisoryReasons`
- `warnings`
- `requiredActions`
- `versionRefs`
- `gateCheckedAt`
- `notForFormalDecision`
- `candidateVersion`

`summarizeFormalReadiness(items)` 输出：

- `total`
- `ready`
- `blocked`
- `warningOnly`
- `blockingReasonDistribution`
- `advisoryReasonDistribution`
- `requiredActionDistribution`
- `candidateVersion`
- `formalEvaluationAllowed`
- `notForFormalDecision`

## 4. reason codes

Blocking reason codes：

- `mapping_version_not_active`
- `mapping_version_missing`
- `basic_info_version_missing`
- `copyright_end_missing`
- `copyright_date_conflict`
- `blocking_review_pending`
- `blocking_review_rejected`
- `income_facts_missing`
- `input_snapshot_missing`
- `cutoff_month_invalid`
- `candidate_version_mismatch`

Advisory reason codes：

- `advisory_review_present`
- `channel_concentration_advisory`
- `copyright_fallback_used`
- `long_tail_or_inactive`
- `downlist_requires_manual_confirmation`
- `renewal_review_requires_confirmation`

Warning codes：

- `not_for_formal_decision`
- `formal_persistence_not_enabled`
- `evaluation_task_api_not_enabled`
- `export_api_not_enabled`

## 5. synthetic fixture 覆盖

`test/fixtures/m2FormalReadinessGate.fixture.js` 覆盖 15 个合成案例：

1. fully ready synthetic work
2. mapping version missing
3. mapping version inactive
4. basic info missing
5. copyright end missing
6. copyright conflict
7. blocking review pending
8. blocking review rejected
9. advisory-only review
10. missing income facts
11. missing input snapshot
12. cutoff month invalid
13. candidate version mismatch
14. multiple blocking reasons
15. mixed blocking + advisory reasons

全部 fixture 使用 `SYN-FR-WORK-*` 合成 ID，不包含真实作品、作者、渠道或金额明细。

## 6. CLI

新增命令：

```bash
npm run check:m2:formal-readiness:fixture
```

该命令：

- 只使用 synthetic fixture；
- 不读取数据库；
- 不读取 `.env`；
- 不读取 `data/**`；
- 不连接网络；
- 输出 JSON；
- 包含 summary 和 example item results；
- 显式输出安全边界：
  - `formalEvaluationExecuted=false`
  - `databaseConnected=false`
  - `databaseWritten=false`
  - `migrationExecuted=false`
  - `mappingVersionActivated=false`
  - `switchMappingVersionCalled=false`
  - `runtimeApiImplemented=false`
  - `writeApiAdded=false`
  - `exportApiAdded=false`
  - `evaluationTaskApiAdded=false`

## 7. API contract

新增设计契约：

```text
docs/api/M2-formal-readiness-gate-api-contract-v0.1.md
```

定义未来只读接口：

- `GET /api/m2/formal-readiness/overview`
- `GET /api/m2/formal-readiness/items`
- `GET /api/m2/formal-readiness/items/{standardWorkId}`

当前未实现 runtime API。契约明确未来 API 必须只读，不触发 formal evaluation，不写数据库，不激活 `mapping_version`。

## 8. 未实现范围

本轮未实现：

- runtime API；
- formal evaluation；
- evaluation task API；
- export API；
- write API；
- admin 页面；
- 数据库 repository；
- DB migration；
- mapping activation；
- `switch_mapping_version` 调用。

## 9. 安全边界

本轮未读取真实账单、数字版权台账、运营确认原文或 `data/**`。

readiness gate domain 不包含：

- database client；
- file read/write；
- network request；
- SQL execution；
- migration execution；
- runtime API path；
- export/task/write/formal/local-dry-run 能力。

## 10. 下一步建议

建议下一步进入：

```text
M2-FR-3 blocking manual review admin/API design and guarded implementation
```

前置建议：

1. 先确认 blocking review item 的状态流和可写权限边界；
2. 再设计受控 API；
3. 写能力必须保持审计字段、角色边界和 readiness gate 阻断语义。
