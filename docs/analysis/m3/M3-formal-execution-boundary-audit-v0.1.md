# M3 formal execution 边界审计 v0.1

生成日期：2026-06-28

审计基准：

- 当前 HEAD：`4b32ef8275af9795581c087081f1db45d3c88cee`
- 范围：M3 PRD、API contract、data model、page plan、test plan、fixture engine、fixtures、repository、routes、admin、tests

## 总结论

未发现 M3 formal execution 越界。当前实现没有连接数据库，没有写 migration，没有正式任务创建、正式结果、正式 release/export，也没有将 M2 local candidate 当成 formal M3 input。

当前所有成功 M3 API 响应都应携带 dataset 边界标记：

- `mode=fixture`
- `syntheticOnly=true`
- `notForFormalDecision=true`
- `formalDataAuthorized=false`
- `formalEvaluationAllowed=false`
- `m3FormalExecutionAllowed=false`
- `dependsOnM2FormalReadiness=true`

formal 请求通过 `mode=formal` 或 formal header 被 `formal_data_blocked` 阻断。

## 边界核对

| 边界项 | 审计结果 | 证据 |
|---|---|---|
| 是否存在 M3 代码路径写正式 DB | 否 | `src/repositories/newProductEvaluationFixtureRepository.js` 仅读取内存 fixture |
| 是否存在 M3 migration | 否 | M3 diff 未包含 `db/migrations/`；data model 明确“本轮未新增 migration” |
| 是否存在正式 resultVersion / release / export | 否 | M3 API contract 写明当前不提供结果发布或导出 |
| API 文档是否暗示 formal result 可用 | 否 | contract 明确 formal mode 必须 blocked，write routes 不可用 |
| 页面文案是否暗示 formal result 可用 | 否 | admin 显示 `formal M3 blocked` 和 `notForFormalDecision` |
| fixture 数据是否被当作正式数据 | 否 | fixture dataset 和 tests 均校验 synthetic-only 标记 |
| M2 local candidate 是否被当作 formal M3 input | 否 | dataset 标记 `dependsOnM2FormalReadiness=true` |
| 是否存在 private data path 依赖 | 否 | M3 fixture 不引用 private output；测试只把相关 token 当 forbidden token |
| 是否存在真实材料文件路径 | 否 | 材料只保留 `materialTypes` 和 chunk metadata，不存储原始材料 |
| 是否存在生产连接串或 secret | 否 | M3 代码未出现生产连接串或 secret；通用错误处理只包含脱敏逻辑 |

## 敏感词命中解释

静态搜索会命中以下说明性内容，不视为泄漏：

- `data/private-output`：仅出现在测试 forbidden token 或历史边界文档中。
- `.xlsx` / `.csv`：仅出现在测试 forbidden token 或禁止提交说明中。
- `Word` / `PPT` / `PDF`：PRD 描述材料类型，当前实现只保存 metadata/chunking plan，不提交原文件。
- `formal execution` / `release` / `export`：用于说明禁止或 blocked 状态。
- `password` / `secret`：通用错误脱敏代码或安全扫描词，不包含真实密钥。

## formal boundary 结论

当前 M3 不进入 formal execution。正式 M3 仍需：

1. 用户单独授权。
2. M2 formal readiness rerun 通过。
3. 数据库/migration/正式 API/导出/发布/audit chain 的单独设计和验收。
4. 原始材料保存策略和权限模型确认。

在上述条件完成前，当前 M3 只能作为 fixture/prototype。
