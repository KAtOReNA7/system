# M2 业务验收合同 v1 与 36 个月冻结基线证据

## 1. 结论

机器数值权威为
`config/m2-business-acceptance-contract.v1.json`。本报告只提供中文解释、脱敏
聚合证据和执行审计，不替代机器合同。

本轮最终状态为：

`M2_BUSINESS_ACCEPTANCE_CONTRACT_V1_ACTIVE_FOR_DEVELOPMENT_ONLY`

- 作品总额门禁（`WORK_TOTAL`）与作品×渠道门禁（`WORK_CHANNEL`）是两个独立、
  可分别机器查询的对象；顶层合同状态不得替代任一粒度状态。

| 门禁对象 | 粒度 | 状态 | 当前含义 |
|---|---|---|---|
| `workTotalGate` | `WORK_TOTAL` | `ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY` | Core80 的 3/6/12/36 个月作品总额门禁已激活，仅限开发评价 |
| `workChannelGate` | `WORK_CHANNEL` | `PARTIAL_NOT_ACTIVE` | 36 个月渠道分解缺少 eligible-channel 组件，未形成完整渠道门禁 |

- 3、6、12 个月周期（H3/H6/H12）作品总额已固化为仅限开发评价的门禁。
- 36 个月周期（H36）已从源权威精确重建作品级模型
  `M2-WORK-LG01`（Human-Anchored Learned Global，人工锚定可学习全局模型）
  的冻结同案例基线，并激活为仅限开发评价的作品总额门禁。
- H36 永久携带
  `HISTORICAL_MULTI_ORIGIN_NOT_PROSPECTIVE_VALIDATION`；当前独立时间证据仍为
  `INDEPENDENT_TIME_EVIDENCE_INSUFFICIENT`。
- H36 作品×渠道分解有 633 个 case 缺少 914 个 eligible-channel 组件，因此
  渠道门禁为 `PARTIAL_NOT_ACTIVE`，原因是
  `MISSING_ELIGIBLE_CHANNEL_COMPONENTS`；不得解释为渠道级完整验证。
- H36 的 H50/M30/L20 头部现金带已经可精确评价，但它们不构成第二套 Core90
  分带，也不自动证明任何未来候选优于基线。
- 本轮没有训练、拟合、调参、模型选择、模型晋升或新候选执行；没有执行头部保护
  分段路由实验第二次独立评价（HPSR02），没有读取 later-origin 或 final
  holdout。

“已实现、已验证、已授权、可发布”必须分开：

| 层次 | 当前结论 |
|---|---|
| 已实现 | 合同、可移植缓存重建入口、精确作品总额行、现金带、独立粒度门禁和聚焦测试已实现 |
| 已验证 | 历史公开聚合精确复现；Core80 H36 作品总额双门限通过；渠道缺口与冻结机器证据一致 |
| 已授权 | 仅授权作品总额 development evaluation 和确定性派生缓存重建 |
| 可发布 | 否；不授权 production、automation、release、财务承诺或 PR 合并 |

## 2. 范围、人口与 actual

当前 M2 只服务预测起点时至少已有 3 个完整账单月的成熟老作品，并且只预测该作品
在起点时已经出现成熟历史账单的 canonical 渠道。目标是未来分成收入现金；actual
定义为开发可建模冲销重述
`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`。

每个预测起点重新计算动态 Core80 和 Core90：

- Core80 是业务可用性的硬门禁人口（`HARD_GATE`）。
- Core90 是必须披露的敏感性人口
  （`DISCLOSED_SENSITIVITY_NOT_A_VETO`）。尾部较差本身不否决已经通过 Core80
  的结果，但 nonfinite、负预测、数值爆炸或其他合同非法输出仍单独失败。

未来新作品、未来首次出现渠道、Core80 外长尾、买断现金、其他非分成现金和公司
总收入补差都不属于当前 M2。作品级、组合级、排序分配和风险区间能力不得混为一个
排行榜。

## 3. 作品总额业务可用性门限

| 周期 | Core80 WAPE 上限 | Core80 绝对 signed bias 上限 | 状态 |
|---|---:|---:|---|
| 3 个月（H3） | 0.30 | 0.10 | `ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY` |
| 6 个月（H6） | 0.32 | 0.10 | `ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY` |
| 12 个月（H12） | 0.35 | 0.12 | `ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY` |
| 36 个月（H36） | 0.40 | 0.12 | `ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY_WITH_HISTORICAL_NON_PROSPECTIVE_CAVEAT` |

上表只定义作品总额门禁（`WORK_TOTAL`），不表示作品×渠道门禁
（`WORK_CHANNEL`）已激活。业务可用性只回答“作品总额绝对预测误差是否进入当前业务
可接受范围”，不回答候选是否优于既有模型。60 个月周期（H60）只保留为未来 M3
新品预测的低置信成熟目录情景参考，不参加当前 M2 门禁或排名，本合同不实现 H60
模型，也不预测未来具体新作品。

## 4. 候选优越性是 AND 规则

任何未来候选只有在 exact same-case、同 actual、同人口、同周期和同评价家族下，
同时满足以下九项，才可宣称稳定且实质性优于预注册健康基线：

1. paired absolute-error reduction / paired actual 至少为 0.01；
2. 2,000 次整作品聚类 bootstrap 的改善区间下界大于 0；
3. 总体绝对 signed bias 不超过对应周期上限；
4. Core80 H50 绝对误差不高于健康基线；
5. 最大单作品误差占比不恶化；
6. Top10 作品误差占比不恶化；
7. L20 改善不得掩盖 H50 损失；
8. 每起点 absolute-error reduction 中位数大于 0；
9. 不重叠时间证据要求满足。

`relative FVA` 只作诊断。全部滚动 forecast-decision episodes 的人民币误差减少只能
称为“滚动预测决策误差减少（aggregated forecast-decision error reduction）”，
不得称为公司实际节省金额、唯一现金收益、财务利润或未重复业务价值。

相邻起点的主要 future-actual 窗口若重叠，就不算独立证据。稳定支持至少需要两个
不重叠窗口、不重叠窗口 actual-cash-weighted 通过率至少为 2/3，并且每起点误差减少
中位数大于 0。一个真正独立 later-origin 可以否定明显失败，但不能独自确认稳定
成功。

## 5. H36 首个合法冻结重建

重建入口为：

```text
npm run recover:m2:current:business-acceptance-h36
```

入口在运行时解析仓库根、分支、HEAD、Draft PR 和 exact-head CI，不把本机路径、
预先抄录的活动提交或运输包摘要设为门禁。它从不可替代源权威重建月度权威、
LG01 历史特征和原始 H36 案例，随后使用公开冻结的五折参数与确定性作品拆分。
它没有读取旧 human-evaluation cache、旧 frozen-rescore cache 或历史 receipt，
也没有使用失控长期复利模型 `M2-WORK-CRMR01` 充当健康基线。

首个完整合法结果在执行提交
`ac65e59050475fb2024c126b574fa44e14141e89` 形成并立即冻结。对应 GitHub Actions
运行是 `30621317484`，Linux `verify` 与 Windows `verify-windows` 均为
`success`。完整权威账单截止月为 2026-04；源权威已存在的 actual 可用性到
2026-05，但本次标签物化明确截断到 2026-04，没有执行任何保留的独立起点评价。

执行前缺少的是可重建派生缓存
（`CACHE_MISS_REBUILDABLE`），历史 receipt 为可选 provenance
（`OPTIONAL_PROVENANCE_MISSING`）；源权威状态为
`SOURCE_AUTHORITY_AVAILABLE`。重建后状态为
`CACHE_MISS_REBUILT_FROM_SOURCE_AUTHORITY`。

## 6. H36 作品总额聚合复现与业务门禁

固定复现容差为绝对 `1e-7`、相对 `1e-9`。Core80 与 Core90 均在该容差内精确
复现既有公开审计权威，状态为
`EXACT_AGGREGATE_REPRODUCED_WITHIN_FIXED_TOLERANCE`。

| 人口 | 起点数 | case 数 | 作品数 | actual（元） | 绝对误差（元） | WAPE | signed bias | 最大作品误差占比 | Top10 误差占比 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Core80 硬门禁 | 13 | 488 | 62 | 291,953,066.5057 | 86,806,521.4768 | 0.2973303981 | 0.0956889461 | 0.0968804208 | 0.6358073970 |
| Core90 敏感性 | 13 | 1,030 | 138 | 323,669,098.2617 | 110,499,208.4403 | 0.3413956075 | 0.0957459602 | 0.0761078061 | 0.5163300001 |

Core80 的 WAPE 0.2973303981 小于 0.40，绝对 signed bias 0.0956889461 小于
0.12，因此 H36 作品总额业务可用性双门限通过。Core90 的 nonfinite 和负预测计数
均为 0，数值合同合法；其角色仍是非否决敏感性披露。

这只是 H36 历史 development-only 作品总额业务可用性通过，不是作品×渠道完整
验证、prospective validation 或候选优越性结论。13 个历史滚动起点的结果窗口
重叠，不能被写成 13 份独立证据。

## 7. H50/M30/L20 作品总额头部现金证据

现金带只在每个起点的动态 Core80 内，以起点可见的 trailing-12 分成现金排序；
边界作品整体留在较高现金带，不读取未来 actual。Core90 不重新定义第二套现金带。

| Core80 现金带 | case 数 | 历史唯一作品数 | actual（元） | 绝对误差（元） | WAPE | signed bias |
|---|---:|---:|---:|---:|---:|---:|
| H50 | 35 | 5 | 167,601,112.0564 | 21,379,110.4456 | 0.1275594785 | 0.0406261656 |
| M30 | 184 | 31 | 65,327,390.9720 | 38,328,199.8106 | 0.5867094834 | 0.3046489985 |
| L20 | 269 | 52 | 59,024,563.4773 | 27,099,211.2206 | 0.4591175203 | 0.0207670570 |

这些结果证明未来候选可以在 exact same-case 上精确比较 H50/M30/L20。它们同时
显示误差在中部与尾部明显更高；不能用 L20 改善掩盖 H50 损失，也不能把 H50 的
良好表现外推成全人口稳定性。

## 8. 作品总额完整性与渠道分解限制

源重放包含 12,039 个原始 H36 case，其中 11,137 个进入当前范围匹配。最终生成
6,784 条 Git-ignored 私有证据行；作品总额层完整保留 488 条 Core80 与 1,030 条
Core90 冻结行，没有缺失历史、nonfinite 预测或负预测。作品总额来源为冻结 primary
LG01 作品行的精确重建，不由不完整的渠道组件反推。

渠道级分解存在透明限制：633 个 case 合计缺少 914 个 eligible-channel 组件。
机器可查询的作品×渠道门禁（`workChannelGate`，`WORK_CHANNEL`）因此为
`PARTIAL_NOT_ACTIVE`，原因为 `MISSING_ELIGIBLE_CHANNEL_COMPONENTS`。冻结重建记录
继续保留原渠道证据状态
`PARTIAL_DISCLOSED_NOT_USED_TO_DEFINE_WORK_TOTAL_BASELINE`。这不会删除或改变完整
作品总额基线；作品总额门禁不依赖这些不完整渠道组件反推。当前合同的 H36 门禁和
H50/M30/L20 均在作品总额层定义，不得解释为“H36 作品×渠道预测已完整验证”。

私有精确行足以支持未来已授权候选的 exact same-case join、现金带误差、每起点
WAPE/bias、每起点误差减少、最大作品/Top10 集中度、整作品 bootstrap 和时间块
评价。公开文件只保存脱敏聚合，不包含作品、渠道或账单身份。

## 9. 跨电脑与私有工件边界

私有工件严格分三类：

- `PRIVATE_SOURCE_AUTHORITY`：不可替代权威输入；只有它缺失才阻断。
- `PRIVATE_DERIVED_CACHE`：月度物化、人口、冻结展开、same-case 行和 bootstrap
  输入；缺失时可由源权威与仓库冻结代码确定性重建。
- `PRIVATE_RUN_PROVENANCE`：历史 receipt、旧机器路径和旧日志；缺失只告警。

私有行与 manifest 位于 Git ignored 的
`data/private-output/m2-business-acceptance-contract-v1/`，没有提交 GitHub。
换电脑不需要恢复旧缓存或旧 receipt；有源权威时运行同一 capability-scoped 入口
即可重建。机器合同记录证据执行 HEAD 仅用于冻结审计，不是未来电脑的路径、分支或
活动 HEAD 门禁。

## 10. 授权与停止状态

本合同不授权：

- 训练、拟合、调参、模型选择、模型晋升或新候选执行；
- 头部保护分段路由实验第二次独立评价（HPSR02）；
- 头部保护分段路由实验后续开发（HPSR03）；
- later-origin、final holdout、Canary/full160、production、automation、release；
- M3 formal、生产 route/API 或 PR 合并。

合同字段本身不授权 PR 合并；本次 PR 收口如发生，只能来自当前用户在独立任务中的
明确授权，并且不改变上述模型、数据与发布边界。

本次粒度澄清只读取公开合同、报告和测试；private actual/row 读取 0。模型训练 0、
拟合 0、调参 0、模型选择 0、新候选执行 0、HPSR02 独立评价 0。
`laterOriginRead=false`，`finalHoldoutRead=false`，
`privateIdentityPublished=false`。

## 11. 验证与 Git 状态

当前工作区对最终合同状态完成了以下串行公共基线：

- `npm run doctor:dev`：通过，Node 24.16.0、npm 11.13.0，Python 3.12.13
  由仓库统一 resolver 解析；
- `npm run check:no-real-data`：通过，2,172 个受检路径无真实数据或密钥违规；
- `npm run lint`：通过，477 个 JavaScript 文件与 312 条 package script
  生命周期通过；
- `npm run build`：通过；
- `npm test`：1,038/1,038 通过；
- `npm run smoke`：通过，fixture 启动且 `realDataImported=false`；
- `npm run smoke:portable-start`：formal 与 fixture 均通过，均不依赖 private；
- `npm run test:e2e`：13/13 通过；
- `npm run verify:m2:current`：通过，公开诊断未读取 private source。

聚焦合同测试 10/10 通过，覆盖独立作品总额/作品×渠道门禁查询、633/914 缺口与
冻结机器证据绑定、报告不宣称渠道完整验证、合同 schema、四周期上限、
Core80/Core90 角色、候选优越性 AND 规则、重叠起点非独立、现金带仅用起点可见
trailing-12、L20 不得掩盖 H50、缓存/receipt/source 三类边界、私有身份不进入
公开合同，以及冻结后零训练与零保留窗口读取。

交付时必须从 GitHub 远端活动分支的精确 HEAD 建立匿名 HTTPS、无 private、无凭据
的新克隆，重复上述完整公共基线，并等待同一精确 HEAD 的 Linux `verify` 与
Windows `verify-windows` 成功后才可合并。动态提交 SHA、CI run 和 PR 合并提交由
PR 与最终交付记录绑定，不写入数值合同，也不作为未来执行条件。

H36 科学结果已经冻结；上述后续动作只验证公开代码、合同和文档，不得再次重评分。
