# Codex 工作规则

## 当前唯一入口

- PR #7、PR #8、PR #9、PR #10、PR #11、PR #12、PR #13 均已合入 `main`；已合并分支不得继续作为开发入口。
- 当前仓库治理导航为：
  - `docs/analysis/m2-v2/M2-v2-current-state-index-v0.21.md`
  - `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
  - `docs/analysis/m2-current/M2-current-maturity-reconstruction-v0.6.md`
  - `docs/analysis/m2-current/M2-sales-share-only-target-decision-v0.1.md`
  - `docs/analysis/m2-current/M2-sales-share-model-full-audit-and-research-v0.1.md`
  - `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
  - `docs/analysis/m2-current/M2-current-user-confirmation-form-zh-CN-v0.1.md`
  - `docs/analysis/m2-current/M2-current-as-of-signal-readiness-v0.1.md`
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
  - `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
  - `docs/analysis/m2-current/M2-current-signal-input-portable-intake-v0.1.md`
  - `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- PR #7 cryptographic authority 继续由不可变的
  `docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json` 提供；治理索引不得改写该绑定。
- 历史 B0–B8、C1–C3、旧 PR 状态和旧授权记录只用于审计追溯，不是当前执行指令。

## 用户常驻协作要求（已固化，无需重复下达）

以下要求适用于每次仓库任务。用户以后只需说明本轮目标、业务选择和新增授权，无需重复要求远端同步、进度核对、分支清理、全库查重、方向判断、private 隔离或基础验证。

1. 开始任务时自动执行只读基线：
   - `git fetch origin --prune`
   - 检查工作区、当前分支、upstream、`origin/main`、ahead/behind、开放 PR、CI 和 worktree
   - 只有工作区干净且可快进时才允许 `pull --ff-only`
2. 默认只维护 `main` 和一条当前活动分支。删除分支前必须确认已合并、无独有提交且不再被 PR/worktree 引用。
3. 实现前使用 `rg` 检索入口、调用方、测试和 canonical 实现；检查失效代码、重复文件、平行 runtime/runner/adapter、重复 package scripts、产品/fixture 边界和 CI 重复。
4. 进度报告必须区分“已实现、已验证、已授权、可发布”，并报告 exact HEAD、远端状态、CI、开放 finding、private capability 和业务 gate。
5. 核心开发必须 private-independent。缺少 private 只能阻断所属 capability，不能阻断 clone、安装、lint、build、公共测试、smoke、公共 M2 诊断或本地服务器启动。
6. 修改后按本文件验证规则运行门禁；不得以旧 CI、部分测试或 private 文件存在代替当前工作树验证。
7. 审计、清理和代码整理不自动扩大 provider、数据库、训练、holdout、release 或 M3 formal 授权。
8. 凡是确实需要用户确认或补充的信息，必须先提供中文简化表格和中文填写说明：
   - 表格使用中文事项编号、中文选项和“你的填写”列；
   - 允许填写“不清楚”或“没有”，不得强迫用户猜测；
   - 解释最少需要什么原始依据，并提供可直接复制的简短回复示例；
   - 不要求用户填写内部字段名、算法名、英文状态或预测金额；
   - 敏感材料只允许放入 Git ignored 的 capability-scoped 目录或作为任务附件，
     不得要求上传 GitHub。
   - 已收到的确认应写入 current tracking；除非材料或业务口径发生变化，不得
     重复询问同一事项。

## 多电脑开发基线

新电脑只依赖 GitHub 中的公开仓库内容和明确的工具链，不依赖任何 Git ignored private artifact：

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

工具链合同：

- Node：24.x
- npm：11.13.0
- Python：3.11–3.13；reference/CI 为 3.13
- GitHub CI：Linux 与 Windows 均使用相同公共门禁

`npm start` 启动 formal composition；`npm run start:fixture` 启动 synthetic fixture composition。两者在无 private、无数据库条件下都必须能启动并通过 `/health`。

## Private capability 边界

- `data/private-input/**`、`data/private-output/**`、原始账单、台账、材料、private receipt/workbook、密钥、连接串、dump、`.env` 和 `.pgpass` 禁止提交。
- 禁止伪造 private 文件、从公开聚合摘要反推 private 内容或降低真实性 verifier。
- 使用 `npm run doctor:capability -- <capability-id>` 盘点能力；文件存在只表示库存存在，不等于真实性通过或执行获授权。
- `s1-source-evidence-authenticity-private-v0.1.json` 只属于已退役 PR #7 的历史审计 capability。缺少它不得影响核心开发。
- 必须跨电脑恢复受控 private capability 时，只能使用 capability-scoped 加密包、逐文件摘要和原子恢复；环境变量、provider key 和数据库凭据不得进入包。
- M3 private completion pack 继续保持 Git ignored。缺少 3–5 份用户材料时必须停止该 capability，不得制造材料或补全值。

## 命令生命周期

`config/command-lifecycle.v0.1.json` 是 package scripts 生命周期的 canonical registry：

- `current-public`：普通新开发和持续集成可以使用。
- `archive-only`：仅用于历史审计重放，不是新开发模板，不授予任何业务权限。
- `restricted-local`：需要所属 private/local capability 和单独授权。
- 历史命令因不可变审计兼容继续保留；人工需要历史重放时使用：

```bash
npm run history:m2 -- --acknowledge-archive-only <archive-script> [arguments]
```

不得复制历史 runner 创建新的平行路线。新 M2 实现必须扩展 `src/domain/m2Current/**` 的 canonical core。

## M2 当前方向

- 2026-07-25 用户已将正式目标改为**未来分成收入现金**。全部买断现金都在预测范围外，包括 cutoff 时已签署、确认、可审计的买断应收。
- 买断及其他已识别非分成现金只进入独立账单/审计层，不得进入特征、训练标签、回测指标、点预测、区间或年度预测明细。
- 当前实际值必须守恒：
  `salesShareCashActual + isolatedBuyoutCashActual + isolatedOtherCashActual = totalLedgerCashActual`。
- 分成目标内部完整性与“分成现金占公司全部账单现金的经济比例”必须分开报告；后者不是模型覆盖率门禁。
- `buyoutMonthlyEquivalent` 只允许作为 rating/historical context，并保持 `notCashForecast=true`。
- pure-buyout 无论是否有 commitment 都必须 null abstain，原因为
  `buyout_outside_m2_forecast_scope`；禁止使用 0、承诺金额或月均等效值冒充预测。
- commitment snapshot 只可用于模型外账单/审计 capability，不再是 M2 开发、启动或预测依赖。
- B4 只作 comparator/fallback，不是 release approval。
- C1、legacy C2-R、C2-R.1、C2、C3 均为历史 development `FAIL`，不得重复进入或复制其 runner。
- 2026-07-24 用户已授权并完成 R0–R5 及本轮多粒度组合模型本地 development
  复验；授权只覆盖冻结 development case 和本机已验证 authority cache，不包含
  provider、数据库、final holdout、release 或 M3 formal。
- 2026-07-25 人工账单分区已成为现金类型唯一权威：
  - `渠道实销汇总 -总.xlsx` 只作总账守恒审计；
  - `渠道实销汇总 -分成.xlsx` 是预测特征、标签和回测实际值的唯一现金来源；
  - `渠道实销汇总 -买断.xlsx` 只允许进入评级/历史背景，并保持
    `notCashForecast=true`；
  - 不得再按金额形态、备注、渠道或正负号推断买断；全部负数是冲销，其
    `cashCategory` 仍由所在拆分账单决定。
- 三份 private 账单已验证：总账 192,370 行 = 分成 190,663 行 + 买断 1,707 行；
  七个源字段逐行多重集无交叉且完全守恒，逐月行数和金额完全守恒。最新完整月仍为
  2026-04；2026-05 的 3 条分成事实继续排除在模型窗口外。
- 3,053 部基础人口中 3,052 部有账单观察；另 1 部因旧零金额行删除而无现金历史，
  必须保留为无观察/弃权状态，禁止制造零金额事实补齐。
- 原 824 部、7,851-case 冻结人口是旧机器路由的审计基线，不再等同当前 served
  人口。人工权威重分类了 1,142 个 case，其中 768 个为 pure-buyout 并弃权；
  当前可服务为 758 部、7,083 case（4,594 pure-sales-share、2,489
  buyout-plus-sales）。
- 当前公共诊断为 `CANDIDATE_DEVELOPMENT_FAIL_BLOCKED`：
  - 人工分区后作品级 WAPE/bias 为 0.49075894 / 0.07378107；B4 WAPE 为
    0.54929375，配对相对 WAPE 95% CI 为 [-0.18503038, -0.03677696]，但绝对
    WAPE 仍高于 0.30；
  - dense/intermittent/dormant WAPE 为 0.45873171 / 0.96321675 /
    1.01854144；dormant bias 为 -0.97173129；
  - 3/6/12/18/24 月 WAPE 分别为 0.39404067 / 0.41395111 / 0.42992492 /
    0.53734143 / 0.74494329，长周期明显恶化；
  - 组合层 WAPE/bias 为 0.12794956 / 0.10048252，FVA 为 0.22243439；
    WAPE 与 FVA 单项通过，但绝对 bias、WAPE upper-95 和 bias interval 未通过，
    portfolio development gate 仍为 FAIL；
  - 冻结和 25-origin/56,856-case 逐月审计的分类不确定现金占比均为 0；
    final holdout 仍 sealed，完整 M2 成熟度未通过。
- v0.8 人工渠道 comparator 已按人工账单分区重跑 379 个安全 case：
  WAPE/bias 为 0.70444680 / -0.29098286；买断真值门禁通过，但绝对质量、
  canonical 渠道、historical available-at、特殊品类样本和独立验证仍失败。
- canonical 渠道治理已完成：
  - 133 个原始 ID/名称组合全部人工确认，归并为 74 个 canonical 渠道；
  - 分成账单 190,663 行全部映射，完整月金额 87,624,963.9132 精确守恒；
  - 分成账单实际使用 85 个原始组合、39 个 canonical 渠道；
  - 内部 `channelUid` 由 canonical 名称稳定生成，用户无需填写或维护；
  - 渠道主表与账单保持 private；公共 schema、synthetic fixture、核心测试与
    `diagnose:m2:channel-governance` 不依赖 private。
- `M2-current-canonical-channel-hierarchical-v0.9` 已按 2026-07-26 本轮授权完成：
  - 25-origin seasonal-naive 基线 WAPE 0.46274198，v0.9 WAPE 0.46506585，
    相对恶化 0.5022%；
  - 当前人工权威 7,083 served case 上 exact v0.3 WAPE 0.49075894，v0.9
    WAPE 0.49070110，只改善 0.0118%，低于 1% nested 门槛；
  - 逐月诊断实际采用渠道权重的 case 占 45.45%，但 out-of-sample 恶化；冻结
    served case 采用占 5.87%，未产生实质改善；
  - 单购/点播约占完整分成现金 10.12%，但没有可审计净单价，销量分支保持阻断，
    禁止假定统一 30 元或固定 50% 分成；
  - 主表生效年月覆盖为 0，角色/收入模式只能作 post-hoc development；历史渠道
    状态、合同可售状态、真实上线月和独立验证均未具备；
  - 结论为 `REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK`，v0.9 不得替换 v0.3。
- `M2-current-human-anchored-hierarchical-probabilistic-v1.0` 已按 2026-07-26
  用户目标完成本地 development：
  - 从全部 3,053 部权威作品建立资格账本，不固定抽取 300 本；2021—2025 有
    分成事实的作品为 2,682 部；
  - 36 个月主评估覆盖 1,125 部独立作品、12,039 个成熟 case；人工原式
    WAPE/bias 为 0.53141021 / -0.40552340，v1.0 为
    0.44022707 / -0.12366598，相对改善 17.16%；
  - 在 5,203 个与 v0.3 精确重叠的 case 上，v1.0/v0.3 WAPE 为
    0.27683274 / 0.37610234，相对改善 26.39%；这是同窗 development 配对比较，
    不是独立 later-origin；
  - active/intermittent/dormant WAPE 为 0.36837319 / 0.82752420 /
    1.00000000；作品聚类 bootstrap 的相对人工 WAPE 改善 95% 区间为
    [-38.40%, 5.36%]；
  - 中央 80% 区间覆盖率为 0.80089708，但绝对 WAPE、绝对 bias、主要分群、
    聚类 bootstrap 和独立 later-origin 门禁失败；
  - 四专家原始层 WAPE 0.45540455、发生/冲销原始层 WAPE 0.44126080，均劣于
    已学习人工参数层 0.44022707，已按 nested FVA 拒绝并回退；后两层 FVA=0
    表示安全回退，不是层级成功；
  - 2026-07-26 已修复 FVA 报告与门禁语义：完整 raw candidate、选前
    occurrence/reversal candidate 和 selected pipeline 分开报告；历史选择口径中
    四专家 candidate FVA 为 -0.015177，发生/冲销 candidate FVA 为 -0.001034。
    门禁改查回退前 candidate FVA，相邻 calendar origin 只算一个时间证据块；
    该修复不改参数、不重训、不改写冻结 development artifact；
  - 结论为 `HUMAN_ANCHORED_DEVELOPMENT_FAIL` / `M2_NOT_MATURE`。参数空间、
    失败试验和失败结论已冻结，不得在同一 2021—2025 development 窗口继续调参，
    不得替换 exact v0.3。
- `M2-current-human-anchored-tsb-occurrence-challenger-v0.1` 已按 2026-07-26
  单一候选授权完成本地 development：
  - 只替换 v1.0 occurrence/positive amount 子层，复用共同 reversal 层；冻结
    `3 × 3 × 3 = 27` 个组合，inner selection 只读取 outer fold 之前的 origin；
  - 36 个月主评估仍为 1,125 部独立作品、12,039 个成熟 case；learnedGlobal
    WAPE/bias 为 `0.44022495 / -0.12377106`，raw TSB 为
    `0.54346231 / 0.22068122`，选前 blend 为
    `0.45348237 / 0.03777402`；
  - raw TSB 与选前 blend 的 FVA 分别为 `-0.10323736 / -0.01325742`；
    selected pipeline 在门禁拒绝后回退 `lambda=0`，FVA=0 只表示安全回退；
  - active/intermittent/dormant WAPE 为 `0.40697875 / 0.70411859 /
    1.82646345`；作品聚类相对候选改善 95% 区间为
    `[-0.02847674, 0.09264632]`；
  - strict rolling 74,320 case 的 learnedGlobal/blend WAPE 为
    `0.41191878 / 0.44487051`，11 个连续时间块中仅 3 个改善；
  - 在相同 inner selection 下与 v0.3 精确重叠的 5,203 case 中，blend/v0.3
    WAPE 为 `0.26352433 / 0.37610234`；这是同窗配对诊断，不具独立性，不能覆盖
    主评估、strict rolling、分群、bootstrap 与时间块门禁失败；
  - 结论为 `TSB_OCCURRENCE_DEVELOPMENT_FAIL`。该单变量候选、网格、结果和失败
    结论已经冻结，不得继续调参、建立第二个同窗候选或替换 exact v0.3。
- `M2-lifecycle-aware-revenue-forecast-challenger-v0.1` 已按 2026-07-26 本轮
  算法重构授权完成：
  - 在既有 as-of 分成历史上建立互斥的
    active/stable/decline/dormant/revival 状态，并实现状态条件 occurrence、
    log-amount、共同 reversal、revenue-weighted WAPE、生命周期分群和 top-revenue
    误差诊断；
  - 直接 Huber log、baseline-offset Huber log、带 cap state log-ratio 和不截断
    state log-ratio 四个 raw 实验均已保存且失败；最终 raw challenger 的
    primary/strict WAPE 为 `0.50139298 / 0.62275977`，对应 baseline 为
    `0.44022495 / 0.41191878`；
  - 仅在 revival 使用 challenger、其余状态回退 baseline 的 post-hoc 诊断，
    primary/strict 相对 WAPE 只改善 `0.0145% / 0.0048%`，低于 1% materiality；
    top 1%/5%/10% 收入作品 WAPE 均无改善；
  - 5,203 个 exact v0.3 overlap case 上 raw/selected/learnedGlobal/exact v0.3
    WAPE 为 `0.27458711 / 0.27723899 / 0.27723899 / 0.37610234`；这是同窗
    子集诊断，不是独立 later-origin，不能覆盖总体和 strict raw 失败；
  - 结论为 `LIFECYCLE_AWARE_DEVELOPMENT_FAIL_TRIVIAL_POSTHOC_GAIN`，
    `modelUpgradeSupported=false`。不得替换 exact v0.3，不得将 post-hoc state
    routing 表述为独立选模或成熟度提升；本轮配置、实验和失败结论已冻结。
- lifecycle-aware 失败后的 feature information gain 与 commercial-state source
  审计已完成：
  - 下一轮最有潜在增益的信息是 cutoff 时真实可得、可审计、可版本化的渠道
    上下架、合同可售和权利续约状态，不是继续从同一现金序列派生新状态；
  - readiness 决定为 `NEEDS_DATA_MATERIALIZATION_FIRST`；source discovery 决定为
    `NO_COMPLIANT_HISTORICAL_COMMERCIAL_STATE_SOURCE_FOUND_IN_INSPECTED_SCOPE`；
    acquisition audit 决定为
    `NO_RECOVERABLE_COMPLIANT_HISTORICAL_COMMERCIAL_SOURCE_ACQUIRED`；
  - `m1.standard_work_status_history` 实际只有每部作品一条 current row，
    `validFrom` 相同且无关闭记录；`basic_info_version` 只有一个有效填充快照；
    `mapping_change_record` 为 0 行。三者均不是可训练的商业状态历史；
  - transfer ZIP 与本地 current master/dump 字节一致，没有新增历史来源；仓库、
    migration、dump、archive、loader 中均未发现可生成 canonical commercial
    event ledger 的未接入历史源；
  - 当前合规 historical commercial-state work/channel/contract/month 覆盖均为
    0，不得创建空 ledger、填 0、从 current 属性回填或进入模型训练。下一步仅允许
    业务系统提供 capability-scoped immutable export 后重新审计。
- v1.0 独立 later-origin 资格审计已按 2026-07-26 授权完成，未读取预测指标：
  - 最新完整账单月为 2026-04，理论成熟的 36 个月 origin 为 2023-01 至
    2023-04；四个相邻月只算 1 个连续时间块；
  - 2023-03 已进入 v1.0 既有短周期辅助评估，且 v1.0 选择/比较证据的标签边界
    到 2025-12，因此 2023-01 至 2023-04 整块不具备严格时间独立性；
  - 原 v1.0 执行未留下可复用的完整冻结模型状态；不得重新拟合人工参数、专家
    权重、发生/冲销层或残差池来补造；
  - 2026-05 的 3 条不完整事实在缓存中仍标记为 calibration-valid，later-origin
    审计按完整月上限显式排除，未成熟标签零填充数仍为 0；
  - 资格结论为 `NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN`，
    `metricsRead=false`、`laterOriginConsumed=false`、`trainingPerformed=false`；
  - 最早可能时间独立的 origin 为 2026-01，36 个月标签需账单完整到 2029-01；
    当前缺 2026-05 至 2029-01 共 33 个完整月，且仍需原始 frozen v1 state。
- D1 `revenueShareFact`、`availabilitySnapshot`、信号缺口 ledger 和 portable
  digest-bound 输入继续有效；当前版本化历史 snapshot 覆盖仍为 0，不得用当前
  状态事后回填。
- 当前 development champion 仍为
  `M2-current-occurrence-amount-calibration-v0.3`。v0.4 只是在严格门禁拒绝所有
  challenger 后返回 v0.3，不能表述为候选升级。
- 当前 portfolio development candidate 为
  `M2-current-multi-resolution-revenue-service-v0.5`；只允许用于组合层
  development backtest 结论，不得下放为作品级预测、自动化或 release。
- 当前业务目标候选为
  `M2-current-sales-share-revenue-service-v0.6`；它是目标合同迁移与人工账单
  权威修正，不是新模型家族，也不构成成熟度升级。
- `M2-current-history-regime-recalibration-v0.7` 只是一轮已完成且被门禁拒绝的
  posthoc development diagnostic；不具备选模、自动化、holdout 或 release
  权限，不得继续在同一 2022 窗口调参。
- `M2-current-manual-channel-prior-v0.8` 只是一轮已完成且被绝对质量门禁拒绝的
  comparator；不得替换 v0.3，不得按本轮三个 origin 调整 40%/50%/80% 后冒充
  独立验证。
- `M2-current-canonical-channel-hierarchical-v0.9` 只是一轮已完成且被
  25-origin、绝对质量、as-of 和独立验证门禁拒绝的 development challenger；
  参数与失败结论已经冻结，不得继续在同一 2022 窗口调参。
- zero、seasonal naive、classic Croston、SBA、TSB、ADIDA、B4 和 v0.3 已进入
  同人口自动回归；基线不得因表现较弱而删除。
- eligibility、target classification、served coverage 和 company-cash
  economic scope 必须继续分开报告。旧 824/7,851 保留为机器路由审计基线；
  当前人工权威 served 758/7,083 必须单独报告，768 个 pure-buyout case 不得
  为维持旧人口而继续参与预测指标。
- 用户已明确取消并要求跳过 120 部人工预估/复核。不得重建、重放或生成替代
  样本；旧 JSON 仅是历史审计 artifact，不是 current 配置、runner、loader、
  readiness 或验收依赖。
- 人工只在自动技术门禁和后续授权通过后做 post-gate quality assurance：
  `accept`、`accept_with_limits` 或 `reject`；人工不提供预测金额，也不与模型比赛。

当前业务 gate 保持：

- `currentDecision=CANARY_FAIL`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=LATER_ORIGIN_NOT_QUALIFIED_2029_01_COMPLETE_LABELS_AND_ORIGINAL_FROZEN_STATE_REQUIRED`
- `full160Authorized=false`
- 本轮多粒度重构研究授权已执行完毕；默认不得继续在同一 development 窗口调参
- 本轮真实账单 v0.7 recalibration 授权已执行完毕；参数和失败结论已冻结，
  `candidateSelectionAuthorized=false`
- 本轮人工渠道 v0.8 comparator 授权已执行完毕；规则、窗口和失败结论已冻结，
  `candidateSelectionAuthorized=false`
- 本轮 canonical 渠道 v0.9 新候选、development fitting 与 nested selection
  授权已执行完毕；映射、参数和失败结论已冻结，
  `candidateSelectionAuthorized=false`
- 本轮 human-anchored TSB occurrence 单一候选、inner fitting、公开 synthetic
  与 private development 授权已执行完毕；27 组合、结果和失败结论已冻结，
  `candidateSelectionAuthorized=false`、`newCandidateFamilyDevelopmentAuthorized=false`、
  `modelTrainingAuthorized=false`
- 本轮 lifecycle-aware revenue forecast v0.1 算法重构、快速实验、公开 synthetic
  与 private development 授权已执行完毕；raw 候选失败，post-hoc revival-only
  收益低于 materiality，配置和失败结论已冻结，`candidateSelectionAuthorized=false`、
  `newCandidateFamilyDevelopmentAuthorized=false`、`modelTrainingAuthorized=false`
- 本轮 commercial-state information-gain proposal、data readiness、source
  discovery 和 historical source acquisition audit 已执行完毕；只授权
  source investigation，不授权 schema、event ledger、模型实现或训练。
  `commercialStateHistoricalCoverage=0`、`canonicalEventLedgerGenerated=false`，
  在取得合规 immutable export 前保持 data-materialization blocked
- 本轮 v1.0 later-origin readiness audit 已授权并执行；合格块的一次冻结验证也
  获授权，但资格未成立，故未执行。`candidateSelectionAuthorized=false`、
  `laterOriginReadinessAuditAuthorized=true`、
  `qualifiedLaterOriginValidationAuthorized=true`、
  `laterOriginValidationExecuted=false`、`finalHoldoutAuthorized=false`
- final holdout、embargo shadow、deferred labels 均 sealed
- 公开门禁中 `developmentReplayAuthorized=true` 只表示可精确重放既有
  development evidence；`newCandidateFamilyDevelopmentAuthorized=false`、
  `candidateSelectionAuthorized=false`、`modelTrainingAuthorized=false`
  才是当前新模型开发权限，禁止混用
- provider、远端/共享/staging-like 数据库、Canary/full160、release、M3 formal 均未授权

## M2 当前执行队列（2026-07-25 分成收入目标迁移后）

以下顺序是当前仓库任务的默认优先级。除非用户明确改变业务方向或新增授权，否则
不得以继续调参、扩建 evidence runtime、复制历史 runner 或重新引入 120 部人工评估代替。

1. 保持 exact v0.3/v0.4 作品级 fallback；不得把 v0.5 portfolio 结果分配回作品。
2. 保持三个分辨率同时报告：作品 case、origin 组合、origin×horizon 组合；任何
   稀疏权威结果都必须由逐月 origin 结果交叉检查。
3. 人工拆分账单成员关系是现金类型唯一权威，旧 D0 exact-cell 确认已被整份账单
   分区取代且不得再作为 current 分类输入。每次更新三份账单必须先运行
   `npm run develop:m2:current:ledger-partition`；守恒失败时停止 private
   capability，但不得阻断公共开发。
4. v0.8 人工渠道规则仅进入自动回归 comparator。版本化渠道主表已经完成：
   raw ID/名称 → canonical channel → 渠道角色/收入模式/内容形态。后续只在原始
   渠道出现变化时更新；不得再次要求用户逐行判断买断或填写内部 UID。
5. v1.0 已验证“以人工公式为主干并扩大到全部合格作品”方向有相对价值，但现有
   信号仍不足以达到绝对质量。v1.0 的人工阈值、层级专家、概率层、参数空间和失败
   结论已经冻结；不得继续在同一 2021—2025 development 窗口调参。FVA 评估必须
   同时报告 raw candidate 与 selected pipeline；不得把安全回退后的 0 当作层级
   增量，也不得用大量作品/case 数替代时间验证块数量。
6. human-anchored TSB occurrence 单一候选已经按预注册执行并失败。raw TSB 和
   选前 blend FVA 都为负，strict rolling、active、dormant、作品聚类 bootstrap
   和时间块多数门禁未通过；selected FVA=0 只表示回退。网格、inner selection、
   结果和失败结论全部冻结，不得继续同窗调参或建立第二个候选。
7. 2023-01 至 2023-04 later-origin 连续块已经资格审计并被拒绝，不得拆月重试。
   下一次最早可能时间独立的 origin 为 2026-01，只有账单完整到 2029-01 且取得
   原运行时 frozen v1 state 后才可重新审计；此前不读取指标、不填 0、不打开
   final holdout。
8. 只接收 cutoff 时真实可得、可审计、可版本化、exact-work 的分成预测信号：
   sales historical availability、合同可售状态、渠道状态；commitment 不得作为
   分成预测信号。现有 repo、migration、dump、archive 和 loader 已确认不能恢复
   合规 commercial-state history；不得重复扫描同一 current projection 冒充新来源。
9. D1 合同、缺口 ledger、来源字段审计和 digest-bound portable intake 已建立；
   使用 `npm run diagnose:m2:signal-input` 验证公开 synthetic 输入，受控数据通过
   `--bundle-file` 与 `--case-file` 提交同目录摘要绑定包。下一步采集/物化符合
   合同的历史 `availabilitySnapshot`，补齐 economic、posting、available-at、
   来源版本和 lineage。当前冻结/逐月 occurrence 与 positive amount 合规覆盖
   均为 0；无历史 snapshot 的 current 状态不得回填。商业状态来源需由业务系统
   提供不可变导出，至少包含 stable work/channel identity、状态 before/after、
   `effectiveAt`、`availableAt`、来源版本、lineage、撤销/更正语义与完整性权威；
   取得后先重新做 acquisition/readiness audit，再决定是否物化 event ledger。
10. 新信号必须对应明确的人工公式参数或 occurrence/positive amount 误差目标，
   并具有 historical `effectiveAt/availableAt`。先通过成熟短周期 rolling-origin
   诊断，再按独立作品做 nested challenger；同时保留 7,083 个当前 served 与
   7,851 个旧机器路由 case 的差异审计。不剔除困难分成 case，不将
   pure-buyout/null 计为 0。
11. 只有绝对质量、segment、平台类型/品类、risk–coverage 和业务损失均通过，才申请 final
   holdout；失败时继续 fallback，不得用新模型数量替代证据质量。
12. 120 部人工评估继续完全跳过。人工只负责渠道主表/账单分区的数据治理，以及
   技术门禁通过后的 post-gate QA；不提供预测金额。
13. final holdout、embargo shadow、deferred labels、provider、数据库、
   Canary/full160、release 和 M3 formal 在收到各自明确授权前继续 sealed/禁止。

当前启动状态：

- 已实现：R0–R5 strict contract、multi-resolution evaluator、加总
  additive Holt–Winters ensemble、六个简单基线、三个全局 challenger、
  rolling conformal、MinT、risk–coverage、业务损失和 FVA；D1
  `revenueShareFact`、`availabilitySnapshot`、signal-gap ledger、来源字段审计
  和 digest-bound portable signal input bundle/CLI；v0.7 三个低复杂度历史
  baseline 与分层 recent-origin nested selector；v0.8 人工渠道 comparator、
  安全历史窗口物化和聚合回测；canonical 渠道 schema、内部 UID、private
  加载器、守恒门禁、公共 synthetic 诊断，以及 v0.9 canonical-channel nested
  challenger；v1.0 人工公式主干、可学习人工参数、四个受约束专家、正向/冲销
  分离、按作品外验证、严格短周期 rolling-origin、作品聚类 bootstrap、FVA 与
  分位数区间；later-origin 资格 core、public preregistration、private digest
  binding 和无 private readiness verifier；v1.0 raw/selected FVA 分离、非恒真
  candidate FVA 门禁和连续月份时间块审计；canonical TSB 过程共用实现、
  observed-zero/unobserved-zero 历史物化、单一 runner mode、27 组合 earlier-origin
  inner selection、公开 synthetic 诊断和三层 raw/blend/selected FVA 报告；
  lifecycle-aware 五状态 encoder、状态条件 occurrence、log-amount、raw/selected
  分离、revenue-weighted WAPE、生命周期分群和 top-revenue 误差诊断；
  commercial-state feature information gain proposal、data readiness、historical
  source discovery 和 acquisition audit。
- 已验证：三账单逐行/逐月守恒、3,053 基础人口与 3,052 账单观察人口边界、
  7,851 旧机器路由到 7,083 当前 served case 的重分类、25-origin/56,856-case
  次级 development 复验；人工分区后作品 WAPE 0.49075894，组合 WAPE
  0.12794956；组合 WAPE 单项通过，但 bias 与区间门禁失败，作品层也失败；
  D1 synthetic contract 通过，合规 snapshot 覆盖为 0；v0.8 按人工分区重跑
  WAPE 0.70444680 并被拒绝；渠道主表 133→74 且 190,663 行 100% 映射守恒；
  v0.9 逐月 WAPE 0.46506585、冻结 served WAPE 0.49070110 并被拒绝，完整 M2
  成熟度未通过；v1.0 在 1,125 部独立作品、12,039 个成熟 36 个月 case 上
  WAPE 0.44022707，虽较人工原式改善 17.16%，仍被绝对质量、分群、作品聚类
  bootstrap 与 later-origin 门禁拒绝；TSB occurrence 候选主评估 learnedGlobal/
  raw/blend WAPE 为 0.44022495 / 0.54346231 / 0.45348237，raw 与 blend FVA
  均为负；strict rolling 11 个时间块仅 3 个改善，active、dormant 与 bootstrap
  失败，故安全回退且冻结，不建立第二个候选；2023-01 至 2023-04 虽已标签成熟，但因
  2023-03 已用及选择证据截至 2025-12，被作为单一时间块拒绝，未读取新指标；
  lifecycle-aware raw challenger primary/strict WAPE 为
  0.50139298 / 0.62275977，均劣于 0.44022495 / 0.41191878 baseline；post-hoc
  revival-only 管线只改善 0.0145% / 0.0048%，低于 materiality 且头部收入作品
  无改善；5,203-case exact v0.3 overlap 的 raw WAPE 虽为 0.27458711，但只是
  同窗子集诊断，因此拒绝升级；历史商业状态 source audit 确认 current projection、
  单快照 version、空 mapping change 与 current archive 均不能生成合规 event
  ledger，work/channel/contract/month 合规历史覆盖均为 0。
- 已退役：120 部人工评估的 current 依赖；不重建、不重放。
- 下一输入：later-origin 路线等待账单完整到 2029-01，并要求原运行时 frozen
  v1 state；或者仅在明确公式需要时接收带 effective/available-at、来源版本、
  lineage 与完整性权威的历史渠道状态/合同可售 snapshot、真实上线月、单购
  净单价/净分成/销量换算。历史商业状态必须来自 capability-scoped immutable
  export；报告中的业务系统材料表是当前唯一采集入口。渠道主表和账单分区已完成，
  不得重复索要；不存在新输入时保持阻断，不能把 current 属性事后回填。
  final holdout 仍需单独授权。
- 未授权：final holdout 及所有既有业务 gate 外的动作。

## Git 与提交规则

- 禁止 rebase、squash、amend、force push。
- 禁止触碰 stash，包括应用、删除、改写或清理。
- 禁止 `git add .` 和 `git add -A`；所有暂存必须使用显式路径。
- 技术线与运营线不得混提交；发现非本轮修改必须报告并避免混入。
- 禁止连接远端生产、共享、staging-like 或未明确授权的数据库。
- 禁止把本地真实数据候选、历史 conditional、rating standard 或 private pack 表述为正式发布结果。

## 验证规则

修改代码后必须运行：

```bash
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run smoke:portable-start
npm run test:e2e
npm run verify:m2:current
```

只改文档也至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
```

涉及跨电脑开发、工具链、private 解耦、启动入口或 CI 时，还必须在一个没有 `data/private-input`、`data/private-output` 和环境凭据的全新克隆中运行完整公共基线。

任何失败不得伪造通过；必须报告失败命令、原因和未验证项。

## M3 边界

- M2 旧 v1.1 conditional 已被用户拒绝；C1–C3 全部失败，业务覆盖仍为 CONDITIONAL。
- 当前可以保留和维护 M3 synthetic fixture/prototype，但不得解释为 M3 formal execution。
- M3 formal task/export/write API、真实材料应用、正式回测和 release 必须等待 M2 质量、业务抽检、final holdout 和发布授权。
- `npm run m3:field-completion-apply` 需要单独用户授权，且不等于 M3 formal execution。
