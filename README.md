# 有声书产品收入评估与年度目标系统

这是 M1 数据基础、M2 旧产品分成收入预测与 M3 新产品 synthetic prototype 的统一仓库。当前代码可在不具备任何 private 文件、provider key 或数据库的电脑上完成安装、检查、测试、公共诊断和本地启动。

## 当前状态

- PR #7：M2 v2 evidence pilot 完整性修复，已合并。
- PR #8：工具链、runtime、冗余和 M2 current 诊断收敛，已合并。
- PR #9：GitHub Actions exact detached `main` checkout 修复，已合并。
- PR #10：M2 current canonical core、portable development 和 v0.1 候选收敛，已合并。
- PR #11：M2 current v0.2 可靠预测候选和 120 部冻结业务样本，已合并。
- PR #12：M2 current v0.3 自动评价与 120 部 current 依赖退役，已合并。
- PR #13：M2 current R0–R5 全局/概率/层级模型评估与安全 fallback，已合并。
- PR #16：M2 current 严格 as-of 分成事实、快照合同和信号缺口 ledger，已合并。
- M2 模型名称、别名、角色、成绩人口和可比组的唯一当前机器权威是
  `config/m2-model-registry.v1.json`；中文目录见
  `docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`。
- 当前现行运行回退模型（operational fallback）为作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）；当前研究比较基线
  （research baseline）为人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。当前无活动候选或自动化
  批准模型（`activeCandidate=null`，`approvedForAutomation=null`）。
- 当前业务结论：`currentDecision=CANARY_FAIL`。
- 当前开发 readiness：
  `nextDevelopmentReadiness=LATER_ORIGIN_NOT_QUALIFIED_2029_01_COMPLETE_LABELS_AND_ORIGINAL_FROZEN_STATE_REQUIRED`。
- R0–R5 评估已完成；全局 hurdle GLM、Tweedie boosting、hurdle GBM、MinT
  和 ensemble 均未通过 nested gate，v0.4 安全回退 exact v0.3。120 部人工
  评估完全跳过。provider、Canary/full160、final holdout、release 和 M3
  formal 均未授权。三份人工复核账单已成为现金分类权威：总账只审计，分成只
  预测，买断只作评级背景。人工权威复验后作品 WAPE 为 49.08%，portfolio
  WAPE 为 12.79%，但 bias 与区间门禁失败，作品层也失败；v0.8 人工渠道规则
  379 个安全 case 的 WAPE 为 70.44%。canonical 渠道治理现已完成：133 个原始
  组合归并为 74 个渠道，分成账单 100% 映射且金额守恒。人工锚定层级概率 v1.0
  已从全部 3,053 部权威作品建立样本账本；36 个月主评估覆盖 1,125 部独立作品、
  12,039 个成熟 case，WAPE 为 44.02%，较人工原式改善 17.16%，但绝对质量、
  分群与作品聚类 bootstrap 仍失败，因此继续回退 v0.3。later-origin 资格审计
  随后确认 2023-01 至 2023-04 虽已标签成熟，但 2023-03 已进入既有辅助评估，
  且选择证据使用到 2025-12；整块不独立。最早可能独立的 origin 为 2026-01，
  需账单完整到 2029-01，并需找回原运行时 frozen v1 state。FVA 语义审计还确认
  后两层的 0 是安全回退值；当前代码已分开报告 raw candidate 与 selected
  pipeline，并让门禁检查回退前 candidate FVA，不改变冻结模型参数和预测路径。
  随后获准的单一 TSB occurrence 候选也已完成：主评估 raw TSB 与选前 blend
  WAPE 分别为 54.35% 和 45.35%，两层 FVA 都为负；strict rolling 11 个连续
  时间块中仅 3 个改善。候选已拒绝并回退，网格与失败结论冻结，不建立第二个同窗
  候选。随后完成的 lifecycle-aware v0.1 算法重构把作品互斥分类为
  active/stable/decline/dormant/revival，并实现状态条件 occurrence 与 log-amount。
  raw challenger 的 primary/strict WAPE 为 50.14%/62.28%，均劣于
  learnedGlobal baseline 的 44.02%/41.19%；仅 revival 启用的 post-hoc 管线改善
  0.0145%/0.0048%，低于 1% materiality，top 1%/5%/10% 收入作品无改善。因此
  结论为 development fail，不替换 exact v0.3，也不进入生产。
  5,203-case exact v0.3 overlap 上 raw lifecycle WAPE 为 27.46%、exact v0.3
  为 37.61%，但这是同窗子集诊断，不能覆盖总体与 strict raw 失败。
  随后的信息增益与数据就绪审计确认，下一轮更可能产生增益的是 cutoff 时真实
  可得、可版本化的渠道上下架、合同可售和权利续约状态，而不是继续从同一现金
  序列派生特征。但当前合规 historical commercial-state 覆盖为 0：
  `standard_work_status_history` 是单行 current projection，
  `basic_info_version` 只有一个有效填充快照，`mapping_change_record` 为空；
  transfer archive 也只是当前文件副本。三轮结论依次为
  `NEEDS_DATA_MATERIALIZATION_FIRST`、
  `NO_COMPLIANT_HISTORICAL_COMMERCIAL_STATE_SOURCE_FOUND_IN_INSPECTED_SCOPE` 和
  `NO_RECOVERABLE_COMPLIANT_HISTORICAL_COMMERCIAL_SOURCE_ACQUIRED`。在业务系统
  提供 capability-scoped immutable export 前，不创建 event ledger、不训练
  commercial-state 模型，也不得用 current 属性事后回填历史。

当前导航：

- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.27.md`
- `docs/analysis/m2-current/M2-evaluation-system-audit-v1.md`
- `docs/analysis/m2-current/M2-evaluation-contract-v2-proposal.md`
- `config/m2-model-registry.v1.json`
- `docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`
- `docs/analysis/m2-current/M2-model-identity-audit-v1.md`
- `docs/analysis/m2-current/M2-user-facing-bilingual-reporting-standard-v1.md`
- `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
- `docs/analysis/m2-current/M2-current-maturity-reconstruction-v0.6.md`
- `docs/analysis/m2-current/M2-sales-share-only-target-decision-v0.1.md`
- `docs/analysis/m2-current/M2-sales-share-model-full-audit-and-research-v0.1.md`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/analysis/m2-current/M2-current-signal-input-portable-intake-v0.1.md`
- `docs/analysis/m2-current/M2-current-real-bill-recalibration-v0.1.md`
- `docs/analysis/m2-current/M2-current-manual-channel-backtest-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-research-and-decision-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-code-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-fva-semantics-remediation-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-fva-semantics-remediation-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-decision-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-code-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-tsb-occurrence-public-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-current-model-structure-and-lifecycle-aware-proposal-v0.1.md`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-revenue-forecast-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-lifecycle-aware-public-diagnostic-v0.1.json`
- `docs/analysis/m2-current/M2-current-feature-information-gain-and-commercial-state-model-proposal-v0.1.md`
- `docs/analysis/m2-current/M2-commercial-state-data-readiness-audit-v0.1.md`
- `docs/analysis/m2-current/M2-commercial-state-source-discovery-v0.1.md`
- `docs/analysis/m2-current/M2-historical-commercial-source-acquisition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

历史 PR、B0–B8、C1–C3 和旧授权记录保留在 `docs/analysis/` 中，只用于审计追溯，不是当前开发入口。
其中 PR 编号是集成记录，B0–B8 是历史证据治理阶段，C1–C3 是历史实验臂，
R0–R5 是评价活动阶段，A0–A6 与 G0–G6 是各自实验内的局部臂，K0–K2 是所属
任务的执行检查点；这些编号都不得脱离作用域冒充模型名称。

## M2 模型只读查询

模型查询默认中文优先，并保留英文原名、稳定 ID 和机器状态码。它只读取公开
Model Registry，不训练模型、不访问 private capability，也不改变 production：

```bash
npm run m2:model -- status
npm run m2:model -- list
npm run m2:model -- show M2-WORK-OA03
npm run m2:model -- aliases exact-v0.3
npm run m2:model -- experiment M2-EXP-CHANNEL-GENERATIVE-02
npm run m2:model -- explain G1
npm run m2:model -- compare M2-WORK-OA03 M2-WORK-LG01
```

## 新电脑开始开发

工具链要求：

- Git
- Node 24.x
- npm 11.13.0
- Python 3.11–3.13；推荐 3.13

执行：

```bash
git clone <repository-url>
cd system
npm ci
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run smoke:portable-start
npm run verify:m2:current
```

上述流程不读取：

- `data/private-input/**`
- `data/private-output/**`
- `s1-source-evidence-authenticity-private-v0.1.json`
- provider/API key
- PostgreSQL 连接
- `.env`、`.pgpass` 或数据库 dump

缺少 private artifact 只会阻断所属的受控 capability，不会阻断核心开发。

## 启动方式

正式 composition：

```bash
npm start
```

无数据库时服务器仍能启动，`/health` 返回健康；数据库业务接口会明确返回 degraded/unavailable，不会回落到 fixture。

合成 fixture composition：

```bash
npm run start:fixture
```

开发热重载：

```bash
npm run dev
```

`npm run smoke:portable-start` 会在无 private、无数据库和无 provider 凭据的环境中真实启动 formal 与 fixture 两种服务器并检查 `/health`。

## 常用公共命令

```bash
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run test:e2e
npm run smoke
npm run smoke:portable-start
npm run diagnose:m2:current
npm run diagnose:m2:signal-input
npm run diagnose:m2:channel-governance
npm run diagnose:m2:lifecycle-aware
npm run verify:m2:signal-input
npm run verify:m2:channel-governance
npm run verify:m2:current
```

package scripts 生命周期由 `config/command-lifecycle.v0.1.json` 管理：

- `current-public`：当前开发和 CI 入口。
- `archive-only`：历史审计重放，不授予新开发或业务权限。
- `restricted-local`：需要所属 capability、private 输入或单独授权。

需要人工执行历史 M2 重放时，使用统一入口：

```bash
npm run history:m2 -- --acknowledge-archive-only <archive-script> [arguments]
```

旧 package script 名称因不可变审计和兼容性继续保留，但不得作为新实现模板。

## Private capability

盘点受控能力：

```bash
npm run doctor:capability -- <capability-id>
```

当前 catalog 位于 `config/development-capability-catalog.v0.1.json`。可能的 capability 包括：

- `m2-pr7-s1`：已退役 PR #7 的历史真实性验证。
- `m2-v2-current-state`：本机恢复的历史 M2 v2 private state。
- `m2-algorithm-authoritative-input`：未来单独授权的 M2 算法研究输入。
- `m2-current-canonical-channel`：本机人工渠道主表和账单驱动的受控 development。
- `m2-current-human-anchored`：本机 2021—2025 分成账单驱动的人工锚定模型复现。
- `m2-current-human-anchored-tsb-occurrence`：已冻结的单一 TSB occurrence
  候选受控 development；只允许精确重放既有 27 组合和失败证据。
- `m2-current-lifecycle-aware`：本轮已执行的五状态 lifecycle-aware occurrence
  与 log-amount 受控 development；只保留算法实验和失败证据，不修改 production。
- `m2-current-human-anchored-later-origin`：later-origin 资格审计；缺少原始 frozen
  v1 state 时只允许公共 readiness，不允许运行模型验证。
- `m3-private-materials`：用户提供 3–5 份 private 材料后的 M3 completion workflow。

文件存在只表示库存存在，不等于真实性通过或执行获授权。private 数据必须继续位于 Git ignored 角色中；不得提交、伪造或从公开摘要反推。

## M2 当前方向

M2 的正式预测对象是未来分成收入现金。正式边界为：

- as-of/no-leakage
- 全部买断现金进入模型外账单/审计层，不进入训练、回测或预测
- pure-buyout 无论是否有 commitment 都使用 null abstention
- 禁止 null→0
- B4 仅作 comparator/fallback
- final holdout 保持 sealed

当前公共诊断：

| 指标 | 当前值 |
|---|---:|
| 权威作品 | 3,053 |
| 有账单观察作品 | 3,052 |
| 旧机器路由审计人口 | 824 works / 7,851 cases |
| 当前人工权威 served 人口 | 758 works / 7,083 cases |
| 人工权威 pure-buyout 弃权 | 768 cases |
| 总账 / 分成 / 买断行数 | 192,370 / 190,663 / 1,707 |
| 人工账单分区分类不确定现金占比 | 0 |
| D1 冻结 / 逐月合规 snapshot 覆盖 | 0 / 0 |
| 已审计 / 可直接使用的历史信号来源角色 | 4 / 0 |
| 合规 historical commercial-state work/channel/month 覆盖 | 0 / 0 / 0 |
| 可恢复 historical commercial event ledger | 否 |
| 当前作品级 WAPE / bias | 0.49075894 / 0.07378107 |
| 当前 B4 WAPE | 0.54929375 |
| dense / intermittent / dormant WAPE | 0.45873171 / 0.96321675 / 1.01854144 |
| 3 / 6 / 12 / 18 / 24 月 WAPE | 0.3940 / 0.4140 / 0.4299 / 0.5373 / 0.7449 |
| 25-origin mature cases | 56,856 |
| 当前 portfolio WAPE / bias | 0.12794956 / 0.10048252 |
| 当前 portfolio FVA | 0.22243439 |
| v0.8 人工渠道规则安全窗口 case | 379 |
| v0.8 人工规则 WAPE / bias | 0.70444680 / -0.29098286 |
| canonical 原始组合 / 统一渠道 | 133 / 74 |
| 分成账单渠道映射覆盖 | 100% |
| v0.9 25-origin 基线 / 候选 WAPE | 0.46274198 / 0.46506585 |
| v0.9 7,083-case v0.3 / 候选 WAPE | 0.49075894 / 0.49070110 |
| v1.0 36个月独立作品 / 成熟 case | 1,125 / 12,039 |
| v1.0 人工原式 / 人工锚定 WAPE | 0.53141021 / 0.44022707 |
| v1.0 active / intermittent / dormant WAPE | 0.36837319 / 0.82752420 / 1.00000000 |
| v1.0 相对人工 bootstrap 95% 区间 | [-38.40%, 5.36%] |
| TSB 主评估 learnedGlobal / raw / blend WAPE | 0.44022495 / 0.54346231 / 0.45348237 |
| TSB raw / blend / selected FVA | -0.10323736 / -0.01325742 / 0 |
| TSB active / intermittent / dormant WAPE | 0.40697875 / 0.70411859 / 1.82646345 |
| TSB strict learnedGlobal / blend WAPE | 0.41191878 / 0.44487051 |
| TSB strict 改善时间块 | 3 / 11 |
| TSB 精确重叠 blend / v0.3 WAPE | 0.26352433 / 0.37610234（同窗，不独立） |
| later-origin 2023 候选块 | 2023-01 至 2023-04，1 个时间块，不合格 |
| earliest independent origin / label through | 2026-01 / 2029-01 |
| later-origin 指标读取 / 候选块消耗 | false / false |
| development WAPE 门槛 | 0.30（未通过） |
| automation decision | `AUTOMATION_BLOCKED` |

现金类型现在只由用户人工复核后的三份 private 账单成员关系决定。总账只作守恒
审计，分成账单是预测链路唯一现金来源，买断账单只作评级历史背景。旧机器路由的
7,851 个 case 仍保留为审计基线，但其中 768 个被人工权威纠正为 pure-buyout，
当前必须弃权；不得为了保持旧人口继续预测买断。

这次修正推翻了旧的组合层“development PASS”：人工分区后 portfolio WAPE 为
12.79%、FVA 为正，但 bias 为 10.05%，且 WAPE upper-95 与 bias interval 未过；
作品层、intermittent、dormant 和长周期也全部未达标。
因此当前状态是 `CANDIDATE_DEVELOPMENT_FAIL_BLOCKED`，不能开启自动化、final
holdout 或 release。v0.8 人工渠道规则的买断真值门禁已经通过，但 WAPE 仍为
70.44%。canonical 渠道与平台类型治理现已完成，不能再作为继续阻断数据治理的
理由；真正剩余的是渠道属性历史生效时间、渠道/合同可售 snapshot、真实上线时间
和单购净单价。v0.9 没有通过；v1.0 虽在同窗配对比较中改善，但绝对误差、分群、
聚类 bootstrap 与独立 later-origin 均未通过，因此同样不能替换 v0.3。单一 TSB
occurrence 候选也未通过：raw 与 blend FVA 为负，strict rolling、active、
dormant、作品聚类 bootstrap 和时间块多数门禁失败；selected FVA=0 只表示
`lambda=0` 安全回退。该候选已冻结，不允许同窗调参或建立第二个候选。
资格审计没有运行表现验证：2023-01 至 2023-04 必须作为一个连续块，但 2023-03
已进入既有辅助证据，且整个块早于 2025-12 的选择证据边界。2026-05 的 3 条
不完整事实也被显式排除，未成熟标签没有填 0。

## M2 当前执行队列

本队列已于 2026-07-25 按用户决定调整。人工预测竞赛和 120 部清单均已取消，
全部买断已移出 M2 预测目标。

1. **多粒度合同（已执行）**
   - 作品 case、origin 组合和 origin×horizon 组合必须分别报告；
   - 5 个半年 origin 的低误差必须由 25 个逐月 origin 交叉检查。
2. **R0–R5 评价（已执行）**
   - strict target/route/censor/commitment contract；
   - 25 个逐月 origin、六个简单基线、nested global model、rolling conformal、
     MinT、ensemble、risk–coverage、business loss 和 FVA。
3. **质量结论**
   - 三个全局模型和 MinT 均失败；v0.4 在五个 outer origin 回退 exact v0.3；
   - 不得把 fallback 表述为候选升级、可打开 holdout 或可发布。
   - 旧 v0.5 portfolio PASS 只适用于旧机器现金路由；人工分区复验后已失败。
   - v0.7 真实账单校准有改善但仍失败；参数与失败结论已冻结，不得同窗继续调参。
   - v0.8 人工渠道规则有相对改善但绝对质量失败；仅保留为 comparator。
4. **渠道治理（已执行）**
   - 133 个 raw ID/名称组合已归并到 74 个 canonical channel；
   - 内部 UID 自动生成，不要求用户填写或维护；
   - 分成账单 190,663 行映射覆盖、行数和金额守恒均通过；
   - 分成/买断人工账单分区已完成；更新账单后运行
     `npm run develop:m2:current:ledger-partition` 验证守恒；
   - private 账单和渠道主表不进入 Git，也不得成为公共 clone、测试或启动依赖。
5. **补充历史渠道与单购证据**
   - 当前主表生效年月覆盖为 0，角色/收入模式只能作 post-hoc development；
   - 补充带 `effectiveAt/availableAt` 的渠道状态和合同可售 snapshot；
   - 单购/点播必须先有作品净单价、净分成或销量换算依据；缺少时禁止假定统一
     定价和分成比例，保持 fallback。
6. **later-origin 资格（已审计并阻断）**
   - 2023-01 至 2023-04 连续块不独立，不得拆月重试或读取表现；
   - 最早可能时间独立的 origin 为 2026-01，36 个月标签需完整到 2029-01；
   - 原 v1.0 没有完整 frozen state artifact；当前授权禁止重新拟合补造；
   - final holdout 继续 sealed。
7. **补充可审计输入（仅真实材料存在时）**
   - exact-work sales historical availability、合同可售和渠道状态 snapshot；
   - commitment 只保留在模型外账单/审计层，不作为分成预测信号；
   - 合同、可售、发布与渠道状态必须能证明在 cutoff 时可得，禁止事后回填；
   - 缺少版本化完整性权威时必须 `unknown_at_origin`，pure-buyout 继续
     `null abstain`。
8. **作品级下一轮研究**
   - D1 fact/snapshot、intermittent/dormant 缺口 ledger 和 portable intake
     已建立；
   - 受控输入使用 `diagnose:m2:signal-input -- --bundle-file ... --case-file ...`，
     不依赖仓库内固定 private 文件名，且只输出聚合覆盖；
   - 新信号先过 25-origin 诊断，再在 7,083 个当前 served case nested 复验，
     并保留 7,851 个旧机器路由 case 的差异审计；
    - v0.9 渠道曲线已执行并失败，参数与失败结论冻结；
    - v1.0 人工锚定模型已覆盖全部合格作品并失败，参数空间与失败结论冻结；
    - TSB occurrence 单一候选已执行并失败，27 组合、inner selection 与失败结论
      冻结；不得再建第二个同窗候选；
    - 只有独立 mature later-origin，或与明确公式绑定的新 historical as-of
      信号通过门禁后，才建立下一候选；
   - 当前停止新增同类总收入模型和同窗调参。
9. **决策门禁**
   - 120 部人工评估完全跳过；人工只做技术门禁后的 post-gate QA。
   - final holdout、embargo shadow、provider、数据库、Canary/full160、release
     和 M3 formal 继续保持未授权。

启动检查：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run doctor:capability -- m2-current-canonical-channel
npm run doctor:capability -- m2-current-human-anchored
npm run doctor:capability -- m2-current-human-anchored-tsb-occurrence
npm run diagnose:m2:human-anchored-tsb-occurrence
npm run doctor:capability -- m2-current-human-anchored-later-origin
npm run diagnose:m2:later-origin-readiness
npm run verify:m2:current
```

`doctor:capability` 只盘点本机库存，不授予训练、新候选或 holdout 权限。没有 private
capability 的电脑仍可执行全部公共开发基线。

有本机三账单和既有审计材料且具备对应授权时，重新核验 later-origin 资格：

```bash
npm run develop:m2:current:ledger-partition
npm run doctor:capability -- m2-current-human-anchored-later-origin
npm run check:m2:current:later-origin-readiness
npm run diagnose:m2:current
npm run verify:m2:current
```

later-origin 检查只写入 Git ignored private 摘要绑定和公开聚合资格结果；资格不
成立时不拟合、不评分、不消耗验证块，也不打开 final holdout。

## 仓库结构

- `src/`：应用与 domain runtime
- `src/domain/m2Current/`：当前 M2 canonical diagnostic core
- `src/fixtureServer.js`：synthetic fixture composition
- `src/server.js`：formal composition
- `scripts/`：受控执行、审计和诊断入口
- `test/`：公共、合成、历史合同和 E2E 测试
- `db/migrations/`：唯一 forward-only Flyway migrations
- `docs/prd/`：canonical 产品需求
- `docs/analysis/`：公开脱敏分析与历史审计
- `config/`：工具链、能力、测试和命令生命周期合同

## 安全与提交

- 禁止提交 private input/output、原始材料、真实账单、台账、Excel/CSV、环境文件、密钥、连接串和数据库文件。
- 禁止连接远端生产、共享、staging-like 或未授权数据库。
- 正式 runtime 不得静默回落到 fixture。
- 使用显式路径暂存；禁止 `git add .` 和 `git add -A`。
- 不得使用 rebase、squash、amend、force push 或触碰 stash。

详细协作、授权和验证规则见 `AGENTS.md`。
