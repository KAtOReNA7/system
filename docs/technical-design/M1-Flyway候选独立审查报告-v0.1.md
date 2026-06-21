# M1 Flyway 候选独立审查报告 v0.1

## 审查方式

使用独立只读 Codex 审查上下文，仅读取候选 SQL、配置、测试脚本、验证 JSON 和 `M1-物理数据模型-v0.4.md`。独立审查未修改任何文件。

## HIGH

无。未发现阻止晋升到正式 `db/migrations/` 的未解决高风险问题。

## MEDIUM

1. `SECURITY DEFINER` 保护仍可被 `migration_owner` 会话手工设置 `m1.switch_context=authorized` 后绕过；应用角色不可绕过。正式环境需把 `migration_owner` 视为强特权账号严格隔离。
2. preflight 检查当前用户、UTC 和角色存在；非 superuser 要求已由本地真实权限验证覆盖，但正式环境仍需要在角色创建/授权阶段保证 `migration_owner` 非超级用户。
3. 独立审查最初发现配置模板含本地绝对路径。已在本轮修正：`flyway-candidate-template.conf` 不再保存本地路径、URL、主机端口或密码；验证脚本运行时显式传入 `flyway.locations`。

## LOW

1. `v_basic_info_m2_completeness.pending_required_tag_configuration=true` 是 PENDING-DATA 标记，不是具体标签/阈值；晋升前需确保下游不会误读为业务规则。
2. 覆盖核对未发现缺口：候选创建 47 张 M1 业务表 + `system_state`、84 个 FK、21 个函数、32 个触发器、5 个视图，权限迁移存在。
3. 未发现正式 `db/migrations/` 目录或正式 Flyway history 混入；候选只使用独立 `flyway_history.flyway_schema_history`。
4. 原型与候选归一化比对未发现高风险语义差异；差异集中在角色外置、Flyway schema、默认权限加固和文件拆分。

## 结论

独立审查未发现未解决 HIGH 风险。仍建议在晋升正式目录前保留强门禁：不得修改已验证候选内容；若修改任一 SQL 文件，必须重跑完整 Flyway 与回归验证。
