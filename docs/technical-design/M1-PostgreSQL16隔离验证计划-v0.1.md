# M1 PostgreSQL 16 隔离验证计划 v0.1

## 0. 执行状态更新（2026-06-21）

状态：**EXECUTED AND PASSED**。

- 非正式 PostgreSQL 16 原型验证：76/76 通过。
- 正式 Flyway SQL-only 候选验证：复用原型 76 项回归，76/76 通过。
- 候选扩展验证总计：157/157 通过，覆盖 Flyway migrate/info/validate、checksum 篡改失败、A/B 空库一致性、真实角色连接权限、UTC 时区和 192,899 行合成性能基线。
- PostgreSQL 版本：16.14。
- Flyway 版本：10.21.0 OSS。
- 时区说明：上一轮非正式原型实例记录为 `Asia/Shanghai`；正式候选迁移会话和测试库默认值已改用并验证 `UTC`。

## 1. 验证目标

隔离验证的目标是在非正式环境证明：

1. PostgreSQL 16 能真实创建 M1 物理结构；
2. 关键约束、部分唯一索引、`NULLS NOT DISTINCT`、deferred constraint trigger、函数和视图行为正确；
3. 批次、映射版本和基础信息版本的原子切换不会暴露半完成数据；
4. `NUMERIC(32,18)` 不损失当前账单观测到的完整金额精度；
5. 新增标准作品未进入基础信息版本时，不会从缺口视图中丢失；
6. `schema_initialized`、`master_data_initializing` 允许 0 个 active 版本；`ready_for_bill_activation`、`operational` 拒绝 0 个或 2 个 active 版本；
7. 非正式迁移原型可以作为正式迁移文件生成前的技术证据。

## 2. 环境边界

### 2.1 隔离要求

- 使用独立 PostgreSQL 16 实例或临时容器；
- 不连接正式数据库；
- 不使用正式数据库凭据；
- 不导入真实账单明细、真实台账明细或运营确认明细；
- 性能基线使用合成数据或经批准的脱敏私有 fixture；
- 验证产物不得包含真实作品名、作者、渠道名、金额明细或版权日期明细。

### 2.2 推荐配置

记录以下环境信息：

- PostgreSQL 精确版本；
- 操作系统和容器镜像；
- CPU、内存、磁盘类型；
- 数据库参数差异；
- `TimeZone`；
- `statement_timeout`；
- `lock_timeout`；
- 连接角色；
- 迁移工具版本。

不得提前写死性能通过秒数。先记录指标，再基于真实基线决定阈值。

## 3. Schema 验证

### 3.1 创建验证

必须验证：

- 47 张 M1 业务表真实创建；
- `system_state` 控制表真实创建，合计 48 张物理表；
- 全部主键创建；
- 全部 FK 创建，无不可解循环；
- 全部唯一约束创建；
- 部分唯一索引创建；
- `UNIQUE NULLS NOT DISTINCT` 创建；
- `CHECK` 约束创建；
- `NUMERIC(32,18)` 类型创建；
- 自然月 `date` 月初检查创建；
- 触发器函数创建；
- deferred constraint triggers 创建；
- 当前读取视图创建；
- 权限授予可执行。

### 3.2 FK 拓扑

验证步骤：

1. 空库运行 Layer 0-5 表结构；
2. 后置添加跨层 FK；
3. 创建自引用 FK；
4. 创建 Layer 6 函数、触发器和视图；
5. 重新从零执行，确认无手工插入临时对象或禁用约束行为。

通过标准：

- 不需要禁用 FK；
- 不需要手工临时删除约束；
- 不需要绕过 `system_state`；
- 所有失败均能定位到具体迁移原型文件。

### 3.3 PostgreSQL 特性验证

| 特性 | 验证点 |
|---|---|
| 部分唯一索引 | active 映射版本、active 基础信息版本、active release 最多一个 |
| `NULLS NOT DISTINCT` | 临时来源行、分类根节点唯一性不被 NULL 绕过 |
| deferred constraint trigger | active 完整性和跨表原始作品 ID 冲突在提交时检查 |
| advisory lock | 切换函数使用事务级锁并自动释放 |
| `FOR UPDATE SKIP LOCKED` | 后台任务队列可并发领取 |
| `SECURITY DEFINER` | search_path 固定，普通应用账号不能越权 |

## 4. 原子切换验证

### 4.1 初次激活

场景：

- `system_state='master_data_initializing'`；
- 0 个 active mapping/basic/classification/tag；
- 通过受控初始化函数创建 bootstrap active 版本；
- 切换到 `ready_for_bill_activation`；
- 首个账单批次构建候选映射和投影；
- 同事务激活批次并切换映射版本。

验证：

- 初始化期间允许 0 active；
- 进入 `ready_for_bill_activation` 后四类版本各 1 个 active；
- 首次批次激活后旧 bootstrap mapping 退休，新映射 active；
- 读视图只看到提交后组合。

### 4.2 新批次激活

验证：

- 新 `income_fact` 和候选 `income_projection` 在激活前不可见；
- 激活前完成严格对账；
- 切换事务只执行状态切换和轻量校验；
- `import_batch.status='active'` 与 `mapping_version.status='active'` 同事务提交；
- 不存在批次 active 但当前投影不包含该批次的可提交状态。

### 4.3 批次撤销

验证：

- 撤销前构建排除目标批次的新候选映射版本；
- 目标批次 active、候选版本 validated；
- 同事务将旧映射 retired、新映射 active、目标批次 revoked；
- 当前投影不包含 revoked 批次；
- 生成幂等影响事件；
- 多消费者影响状态互不覆盖。

### 4.4 纯映射版本切换

验证：

- 渠道别名、常规原始作品 ID 映射、历史分册映射变更后，原始收入事实不变；
- 候选映射版本全量重建投影和首次正数实销指标；
- 严格对账通过后才允许切换；
- 切换后影响范围记录可供 M2/M4 后续消费；
- 不定义评估失效或自动重评业务规则。

### 4.5 基础信息版本切换

验证：

- 新标准作品未进入基础信息版本时，缺口视图能返回缺失；
- 基础信息应用批次生成新的版本作用域快照；
- 同事务 retired 旧版本、active 新版本；
- `classification_release_id` 和 `tag_release_id` 引用一致；
- 失败时旧 active 版本保持可见。

### 4.6 并发两个切换事务

验证：

- 两个批次激活事务同时启动；
- 第二个事务等待或超时，不得越过 advisory lock；
- 超时后不产生半状态；
- 成功事务提交后，失败事务重新读取 active 版本校验不通过。

### 4.7 提交前校验失败

验证：

- 候选版本缺少部分 active 批次事实投影；
- 提交时 deferred constraint trigger 拒绝；
- 事务回滚；
- 旧 active 版本仍可见；
- 无新增 active/revoked 错误状态。

### 4.8 advisory lock 等待和超时

记录：

- 等待时间；
- 超时配置；
- 错误码；
- 失败任务状态；
- 是否产生重试任务；
- 是否保留审计事件。

## 5. 数据完整性验证

### 5.1 金额

验证：

- `NUMERIC(32,18)` 存储 18 位小数；
- 最大整数位候选范围不溢出；
- 零金额可保存；
- 负金额可保存；
- 正数实销规则只用 `> 0` 判断首次实销；
- 聚合对账不使用 `float` / `double`。

### 5.2 192,899 行基线

当前不能导入真实业务数据。隔离验证阶段使用合成数据生成 192,899 行等规模基线，字段形态模拟但不包含真实作品名、渠道名或金额明细。

记录：

- 行数；
- 批次数；
- 月份范围；
- 金额精度分布；
- 投影行数；
- 对账 checksum；
- 数据库体积；
- 索引体积。

### 5.3 不可变事实

验证：

- `income_fact` 原始七字段不可 UPDATE；
- `actual_sales_amount` 不可 UPDATE；
- `bill_month` 不可 UPDATE；
- 允许通过批次撤销改变可见性，但不修改事实行；
- 删除事实行被拒绝或仅限未激活 staging 清理。

### 5.4 跨表原始作品 ID 冲突

验证：

- 同一 `mapping_version` 下，`raw_work_id_mapping.raw_work_id` 与 `historical_volume_mapping.historical_raw_work_id` 冲突时提交失败；
- `historical_volume_mapping` 内同一 `historical_raw_work_id` 即使 `business_form` 不同也失败；
- 不同 `mapping_version` 可重复同一原始 ID；
- business_form 与前缀规则不一致时失败；
- `12345` 与 `Y12345` 在映射约束中按两个完整原始作品 ID 处理；
- 二者可映射到同一标准作品 ID `12345`，并分别得到有声版权和有声成品业务形态；
- 授权分类字段变化不会改变 `derive_business_form(raw_work_id)` 的结果；
- 触发器失败不污染候选版本状态。

### 5.5 active 版本数量

验证：

| 生命周期状态 | 0 active | 1 active | 2 active |
|---|---:|---:|---:|
| `schema_initialized` | 允许 | 允许结构存在但不应运行切换 | 最多一个仍由部分唯一索引限制 |
| `master_data_initializing` | 允许 | 允许初始化中间态 | 最多一个仍由部分唯一索引限制 |
| `ready_for_bill_activation` | 拒绝 | 允许 | 拒绝 |
| `operational` | 拒绝 | 允许 | 拒绝 |

四类对象分别验证：

- `mapping_version`；
- `basic_info_version`；
- `classification_release`；
- `tag_release`。

### 5.6 新作品基础信息缺口

验证：

- 新增 `standard_work`；
- 不新增 `basic_info_version_work`；
- `v_basic_info_gap` 返回该作品；
- `v_basic_info_m2_completeness` 标记作者、分类、版权期限、标签缺失；
- 收入事实和映射投影仍可建立；
- M2 正式评估门禁拒绝该作品进入正式评估。

## 6. 性能基线

### 6.1 记录指标

必须记录，不提前写死通过秒数：

- 批次事实写入耗时；
- staging 到 fact 转换耗时；
- 全量投影重建耗时；
- 首次正数实销指标重建耗时；
- 月度按需聚合耗时；
- 按作品查询耗时；
- 按渠道查询耗时；
- 按业务形态查询耗时；
- 版本切换短事务耗时；
- advisory lock 等待耗时；
- 主要表行数；
- 主要索引大小；
- 数据库总体大小；
- VACUUM/ANALYZE 后统计变化；
- EXPLAIN 计划。

### 6.2 查询路径

验证查询：

- 当前 active 投影按月份聚合；
- 当前 active 投影按标准作品聚合；
- 当前 active 投影按渠道聚合；
- 当前 active 投影按业务形态聚合；
- 问题清单按状态和阻断级别查询；
- 后台任务队列领取；
- 基础信息缺口查询；
- 影响事件消费者查询。

### 6.3 分区边界

当前 192,899 行规模不要求分区。

验证计划只记录：

- 无分区情况下的写入、投影和聚合表现；
- 当未来行数达到千万级时应重新评估按 `bill_month` 分区；
- 不在 M1 初版迁移中预建过度分区。

## 7. 权限验证

### 7.1 角色行为

验证：

- `migration_owner` 可执行迁移；
- `application_rw` 不能直接修改 `income_fact`；
- `application_rw` 不能直接切换版本状态；
- `application_rw` 可调用授权的受控函数；
- `application_ro` 只能访问正式视图；
- `background_worker` 可写候选构建相关表，但不能绕过受控切换函数；
- `backup_operator` 不具备业务写入权限。

### 7.2 `SECURITY DEFINER`

验证：

- 函数固定 `search_path`；
- 函数 owner 不是超级用户；
- 调用角色不满足时拒绝；
- 函数内部不接受任意表名参数；
- 错误路径回滚事务；
- 审计记录写入成功或随事务回滚保持一致。

## 8. 验证产物

隔离验证完成后应输出：

- PostgreSQL 版本和环境摘要；
- 迁移原型执行日志；
- schema 对象清单；
- 约束和索引清单；
- 触发器和函数清单；
- active 版本不变量测试结果；
- 原子切换测试结果；
- 数据完整性测试结果；
- 性能指标表；
- 权限测试结果；
- 未通过项和修复迁移建议。

产物中不得包含真实账单明细、真实作品名、作者、渠道名、版权日期或运营确认明细。

## 9. 通过标准

隔离验证通过必须满足：

- 结构可从空库完整创建；
- 关键 PostgreSQL 特性真实可执行；
- 0/1/2 active 版本规则符合生命周期；
- 批次激活、撤销、映射切换、基础信息切换均不暴露半状态；
- 跨表原始作品 ID 冲突被阻断；
- 新作品无基础信息记录时仍出现在缺口视图；
- `NUMERIC(32,18)` 精度不损失；
- 权限最小化验证通过；
- 无正式数据、无正式数据库连接、无正式迁移文件生成。

## 10. 结论

本计划允许后续在隔离 PostgreSQL 16 环境中验证非正式迁移原型。通过该计划之前，不允许生成正式迁移文件，也不允许进行正式数据迁移。

## 11. 2026-06-21 执行结果补充

- 实例：PostgreSQL 16.14，Windows 本地专用端口 55432，最终仅监听 `localhost`；
- 结构：48 张表真实创建，84 个外键、117 个索引、32 个用户触发器、5 个正式视图；
- 测试：76 项通过、0 项失败；
- 生命周期：bootstrap 初始化、首批激活、新批次、撤销、纯映射、基础信息/分类/标签切换、失败回滚全部通过；
- 并发：advisory lock 串行化和 lock timeout 无半状态通过；
- 权限：五类角色的允许/拒绝路径与固定 search_path 通过；
- 数据：192,899 行纯合成账单完成 staging、事实、全量投影、指标、聚合和 EXPLAIN；
- 边界：未读取真实账单、台账或运营确认结果，未创建 `db/migrations/`。

执行证据见《M1-非正式迁移原型验证报告-v0.1.md》和实验目录机器结果。