# M2 formal readiness 前置拆解 v0.1

## 1. 当前结论

M2 当前可以按“非正式算法候选阶段”收口。候选版本为 `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`。

运营线已对 candidate-a 做出“有条件接受”结论：允许作为 M2 非正式算法候选版本收口，不建议继续技术线 C5/C6 参数微调；但不允许进入 formal evaluation。

本轮只做两件事：

1. 将运营线 candidate-a 业务验收文档入库；
2. 将进入正式评估前的最小 readiness 条件拆成可执行 workstream。

本轮没有修改算法、API、admin、数据库迁移或任何正式数据状态。

## 2. 为什么 M2 非正式算法候选阶段可以收口

M2-B fixture/productization 和 M2-C 非正式校准链路已经形成闭环：

- fixture-only 老品评估 API、admin 页面、E2E 和 CI 工程闭环已完成；
- C0 至 C3 已基于聚合数据形成 candidate-a 参数候选；
- candidate-a 已明确 `notForFormalDecision=true`、`formalEvaluationAllowed=false`；
- candidate-a 的输出能覆盖 work-level 评估、生命周期、评级、三情景预测、风险、建议和聚合 dry-run 验证；
- 运营侧已接受 candidate-a 作为非正式算法候选，但附带正式化前置条件。

因此，当前问题不再是继续微调技术参数，而是把 formal evaluation 前必须完成的数据、流程、持久化、任务、导出和审计边界拆清楚。

## 3. 为什么当前不能进入 formal evaluation

当前仍存在 formal readiness 阻断：

- 正式 `mapping_version` 未激活；
- 缺失版权到期日 2,207 部作品必须补齐或逐项形成可审计豁免；
- `manual_review_required=513` 必须形成处理清单和处理结果；
- `advisoryReviewCount=2331` 需要进入页面提示或报告说明；
- 正式评估结果尚无持久化方案；
- evaluation task API、export API、权限、审计和版本发布流程尚未完成；
- candidate-a 仍为非正式算法候选，不是正式业务结论。

## 4. formal readiness workstream

### 4.1 mapping_version readiness

| 项目 | 说明 |
|---|---|
| 当前状态 | 正式 `mapping_version` 未激活；candidate-a 只能使用当前聚合候选链路解释结果 |
| 阻断项 | 未激活 mapping 不能作为 formal evaluation 的权威投影依据 |
| 最小实现任务 | 定义 formal evaluation 使用的 active mapping_version；校验 raw work ID、standard work ID、business form、历史分册映射互斥；生成激活前对账清单 |
| 是否需要业务确认 | 是。需要确认 mapping 结果可用于正式评估 |
| 是否需要技术实现 | 是 |
| 是否需要 migration | 可能需要。若现有表已覆盖则只需数据流程；若缺少评估快照关联字段则需要 migration |
| 是否需要 API | 是。至少需要受控查询和状态展示；激活操作必须受控 |
| 是否需要 admin 页面 | 是。需要展示 active mapping_version、来源、影响范围和对账状态 |
| 优先级 | P0 |

是否需要 `switch_mapping_version`：formal evaluation 前必须存在可审计的版本切换或确认机制，但不得在未完成 readiness 前调用。

### 4.2 copyright end / basic info readiness

| 项目 | 说明 |
|---|---|
| 当前状态 | 缺失版权到期日 2,207 部作品；candidate-a 允许非正式 fallback |
| 阻断项 | 正式评估不能依赖不可审计 fallback 替代权威版权到期日 |
| 最小实现任务 | 将作品分为补齐、可审计豁免、阻断三类；补齐版权到期日；记录豁免原因、责任人、时间和适用范围 |
| 是否需要业务确认 | 是。需要确认哪些作品可豁免 |
| 是否需要技术实现 | 是 |
| 是否需要 migration | 可能需要。若豁免状态、理由和审计字段无存储位置，则需要 migration |
| 是否需要 API | 是。需要查询补齐/豁免/阻断状态 |
| 是否需要 admin 页面 | 是。需要展示缺口、处理状态、阻断原因 |
| 优先级 | P0 |

管理端应展示缺失、fallback、豁免和阻断状态；导入流程应避免把 fallback 误写成正式版权日期。

### 4.3 blocking manual review readiness

| 项目 | 说明 |
|---|---|
| 当前状态 | `manual_review_required=513` 已被业务接受为 formal readiness 前阻断复核规模 |
| 阻断项 | 513 项未处理前，不应形成正式评估结论 |
| 最小实现任务 | 生成阻断复核处理清单；定义处理状态：待处理、已确认通过、需修正数据、需业务豁免、拒绝进入正式评估；保存处理结果和审计信息 |
| 是否需要业务确认 | 是 |
| 是否需要技术实现 | 是 |
| 是否需要 migration | 可能需要。若 review 状态需持久化则需要 migration |
| 是否需要 API | 是。需要读取、筛选、更新状态的受控接口 |
| 是否需要 admin 页面 | 是。需要处理队列与状态展示 |
| 优先级 | P0 |

阻断复核必须阻断 formal evaluation。非正式候选验收不因 513 项存在而失败。

### 4.4 advisory review display

| 项目 | 说明 |
|---|---|
| 当前状态 | `advisoryReviewCount=2331` 需要进入页面提示或报告说明 |
| 阻断项 | 不阻断非正式候选；formal evaluation 前必须可解释、可展示 |
| 最小实现任务 | 将 advisory 作为只读提示字段进入 API/admin/report；避免与 blocking review 混淆 |
| 是否需要业务确认 | 是。确认提示文案、展示位置和是否需要筛选 |
| 是否需要技术实现 | 是 |
| 是否需要 migration | 可能需要。若 advisory flag 来源于正式评估结果并需追溯，则需要持久化 |
| 是否需要 API | 是 |
| 是否需要 admin 页面 | 是 |
| 优先级 | P1 |

advisory review 不应阻断 candidate-a 非正式收口，也不应被解释为自动降权或自动人工任务。

### 4.5 formal persistence

| 项目 | 说明 |
|---|---|
| 当前状态 | 当前结果仅为非正式 dry-run 和 fixture/calibrated 输出，没有正式持久化 |
| 阻断项 | formal evaluation 必须可审计、可追溯、可失效、可重新生成 |
| 最小实现任务 | 设计并实现正式评估结果持久化；记录算法版本、候选版本、input snapshot、rating、forecast、risks、suggestions、review state、invalidation state、generatedAt、audit metadata |
| 是否需要业务确认 | 是。确认哪些字段对运营可见、哪些字段仅审计可见 |
| 是否需要技术实现 | 是 |
| 是否需要 migration | 是 |
| 是否需要 API | 是 |
| 是否需要 admin 页面 | 是 |
| 优先级 | P0 |

正式持久化不能覆盖不可变收入事实，必须记录输入版本与结果版本。

### 4.6 evaluation task API

| 项目 | 说明 |
|---|---|
| 当前状态 | 当前禁止 evaluation task API；fixture 阶段只保留只读和阻断响应 |
| 阻断项 | formal evaluation 需要任务创建、查询、取消、重试和失败审计 |
| 最小实现任务 | 定义任务生命周期；实现 create/query/cancel/retry；限制触发条件；拒绝未 readiness 的正式评估 |
| 是否需要业务确认 | 是。确认谁能触发、取消和重试 |
| 是否需要技术实现 | 是 |
| 是否需要 migration | 可能需要。任务状态、重试链和审计通常需要持久化 |
| 是否需要 API | 是 |
| 是否需要 admin 页面 | 是 |
| 优先级 | P0 |

必须避免误触发正式评估：未完成 readiness 时，create task 应返回明确阻断原因。

### 4.7 export API

| 项目 | 说明 |
|---|---|
| 当前状态 | 当前禁止 export API |
| 阻断项 | 正式结果发布、复核和归档需要受控导出 |
| 最小实现任务 | 定义导出范围、脱敏规则、可导出字段、禁止导出字段、权限、审计和下载有效期 |
| 是否需要业务确认 | 是 |
| 是否需要技术实现 | 是 |
| 是否需要 migration | 可能需要。导出任务、文件、审计和过期策略需要记录 |
| 是否需要 API | 是 |
| 是否需要 admin 页面 | 是 |
| 优先级 | P1 |

可导出字段建议限于标准作品 ID、评级、生命周期、风险标签、建议、review 状态、版本信息和聚合/脱敏解释字段。禁止导出原始账单行、真实账单明细、未授权敏感字段、连接信息、内部审计密钥或可反推单作品敏感收入的明细组合。

downlist / renewal / promote 只能作为候选导出；执行类导出必须在人工确认后发生。

### 4.8 audit and release gate

| 项目 | 说明 |
|---|---|
| 当前状态 | candidate-a 是 non-formal candidate；尚无正式版本发布流程 |
| 阻断项 | 没有审计和发布门禁时，不能将结果升级为正式业务结论 |
| 最小实现任务 | 定义算法版本发布、参数冻结、输入数据版本、mapping_version、basic_info_version、人工确认、回滚条件和发布审批记录 |
| 是否需要业务确认 | 是 |
| 是否需要技术实现 | 是 |
| 是否需要 migration | 可能需要。版本发布和审批记录应持久化 |
| 是否需要 API | 是 |
| 是否需要 admin 页面 | 是 |
| 优先级 | P0 |

candidate-a 从 non-formal candidate 升级前，必须能证明：算法版本、参数、输入数据、mapping_version、basic_info_version、review 状态和发布时间均可追溯。

## 5. 推荐下一阶段任务拆分

下一阶段不建议继续 C5/C6 参数微调。建议拆成以下 formal readiness 任务：

1. 运营线：确认 candidate-a formal readiness 阻断清单口径。
2. 技术线：设计 formal evaluation 持久化模型与 migration 草案。
3. 技术线：设计 evaluation task API 与 readiness gate。
4. 技术线：设计 export API 与脱敏审计规则。
5. 产品/运营线：设计 blocking manual review 与 advisory review admin 展示。
6. 技术线：设计 audit/release gate 与版本追溯。

## 6. 不继续 C5/C6 的说明

candidate-a 已被业务有条件接受。当前阻断项集中在正式化前置条件，不是算法参数继续微调。除非后续业务验收发现严重算法解释错误或算法事故，否则不应重新打开 M2-C 技术参数迭代。
