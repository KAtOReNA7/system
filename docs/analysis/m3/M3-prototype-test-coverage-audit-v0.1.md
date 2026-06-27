# M3 prototype 测试覆盖审计 v0.1

生成日期：2026-06-28

审计基准：

- 当前 HEAD：`670d6b50b93fc951b291d58f249a6b7da563c34c`
- 测试范围：M3 fixture engine、M3 API、M3 admin E2E，以及仓库通用 lint/build/test/smoke/e2e 命令

## 总结论

当前 M3 fixture/prototype 已具备 acceptance baseline 测试覆盖：engine shape、只读 API、formal mode blocked、write-like route unavailable、无敏感输出、admin 只读页面渲染、同作者对标不计名额、系统/运营对标来源、全评级 synthetic 覆盖、M4 entry-only handoff。

正式 M3 前仍需补充的是 formal-only 测试，不属于当前 fixture/prototype 范围：正式 persistence、正式 task/write API、正式 release/export/audit gate、真实材料权限策略、M2 formal readiness rerun。

## M3 测试清单

### Unit / engine

- `test/m3-new-product-fixture-engine.test.js`

覆盖：

- M3-0 到 M3-7 prototype 对象形状。
- `rawMaterialStored=false`。
- counting final comparator 不超过 3。
- 同作者对标 `countsAgainstFinalComparatorCap=false`。
- `comparatorOrigin` 覆盖 `system_selected`、`operator_suggested`、`same_author_adjustment`。
- 作者排位可用/不可用边界。
- 五年 forecast 年度拆分。
- S+/S/A/B/C/D/E 与 blocked 全评级覆盖。
- 不输出固定开发建议。
- 不输出资源投入等级。
- 一选题一作品关联。
- 首年/三年/五年回测入口。
- M4 candidate 保持 entry-only、`m4Executed=false`。
- readiness blocked 样本不输出 formal-style numeric forecast。
- 不包含 raw/private/formal execution forbidden token。

### API route / contract

- `test/m3-new-product-api.test.js`

覆盖：

- `/api/m3/new-products/topics/overview`
- `/api/m3/new-products/topics`
- `/api/m3/new-products/topics/:topicId`
- `/api/m3/new-products/readiness-gaps`
- `/api/m3/new-products/comparator-candidates`
- `/api/m3/new-products/algorithm-versions`
- `/api/m3/new-products/backtests`
- `/api/m3/new-products/backtests/:batchId`
- `/api/m3/new-products/m4-calibration-candidates`
- `mode=formal` 返回 `formal_data_blocked`
- POST topic / POST materials 返回 unavailable
- invalid filters / unknown ids 返回 public errors
- API 响应不泄露 private output、Excel/CSV、连接串等 forbidden token

### Admin / page

- `test/e2e/admin.e2e.test.js`

覆盖：

- `#m3-overview`
- `#m3-topics`
- `#m3-detail:SYN-TOPIC-0001`
- `#m3-gaps`
- `#m3-backtests`
- admin 页面显示 `fixture-only`、`formal M3 blocked`、synthetic topic、readiness gaps、backtest checkpoints
- M3 页面通过 M3 API 渲染

## PRD 覆盖情况

| PRD 要求 | 当前测试覆盖 |
|---|---|
| synthetic fixture 标记 | API tests |
| formal 请求 blocked | API tests / E2E error handling |
| write-like route unavailable | API tests |
| 不存原始材料 | engine/API tests |
| 最终对标不超过 3 | engine/API tests |
| 同作者不计对标名额 | engine/API tests |
| 系统/运营对标并列 | engine/API tests |
| 作者排位样本门槛 | engine tests |
| 五年/首年/1-5 年预测 | engine/API tests |
| readiness gap 阻断 formal-style numeric forecast | engine/API tests |
| S+/S/A/B/C/D/E 全评级覆盖 | engine tests |
| 不输出开发建议和资源等级 | engine/API tests |
| 一选题一作品 | engine/API tests |
| 回测首年/三年/五年入口 | engine/API/E2E tests |
| M4 仅入口、不执行 | engine/API tests |
| admin 只读页面 | E2E tests |

## 未覆盖或需补强

当前 fixture/prototype 范围内未发现硬测试缺口。

formal M3 前仍需补充：

1. 正式 persistence schema 与 DB 约束测试。
2. 正式 task/write API 授权、幂等、审计测试。
3. 正式 release/export/audit gate 测试。
4. 真实材料保存、权限、脱敏和不提交原文测试。
5. M2 formal readiness rerun 与 M3 formal input gate 测试。

## 本轮验证快照

本轮刷新报告后已重新运行验证命令：

| 命令 | 结果 |
|---|---|
| `npm run check:no-real-data` | 通过 |
| `npm run lint` | 通过，检查 122 个 JavaScript 文件 |
| `npm run build` | 通过，检查 122 个 JavaScript 文件 |
| `npm test` | 通过，406 pass / 0 fail |
| `npm run smoke` | 通过，`mode=fixture`、`realDataImported=false`、`formalDatabaseConnected=false` |
| `npm run test:e2e` | 通过，14 pass / 0 fail |
