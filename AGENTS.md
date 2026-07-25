# Codex 工作规则

## 当前唯一入口

- PR #7、PR #8、PR #9、PR #10、PR #11、PR #12、PR #13 均已合入 `main`；已合并分支不得继续作为开发入口。
- 当前仓库治理导航为：
  - `docs/analysis/m2-v2/M2-v2-current-state-index-v0.15.md`
  - `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
  - `docs/analysis/m2-current/M2-current-maturity-reconstruction-v0.6.md`
  - `docs/analysis/m2-current/M2-sales-share-only-target-decision-v0.1.md`
  - `docs/analysis/m2-current/M2-sales-share-model-full-audit-and-research-v0.1.md`
  - `docs/analysis/m2-current/M2-current-authority-source-audit-v0.1.json`
  - `docs/analysis/m2-current/M2-current-user-confirmation-form-zh-CN-v0.1.md`
  - `docs/analysis/m2-current/M2-current-as-of-signal-readiness-v0.1.md`
  - `docs/analysis/m2-current/M2-current-real-bill-recalibration-v0.1.md`
  - `docs/analysis/m2-current/M2-current-manual-channel-backtest-v0.1.md`
  - `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
  - `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
  - `docs/analysis/m2-current/M2-current-signal-input-portable-intake-v0.1.md`
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
  - 组合层 WAPE/bias 为 0.42609452 / 0.42609452，FVA 为 -1.34255921，
    portfolio development gate 已从旧机器分区下的 PASS 修正为 FAIL；
  - 冻结和 25-origin/56,856-case 逐月审计的分类不确定现金占比均为 0；
    final holdout 仍 sealed，完整 M2 成熟度未通过。
- v0.8 人工渠道 comparator 已按人工账单分区重跑 379 个安全 case：
  WAPE/bias 为 0.69415424 / -0.32056442；买断真值门禁通过，但绝对质量、
  canonical 渠道、historical available-at、特殊品类样本和独立验证仍失败。
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
- `nextDevelopmentReadiness=CANONICAL_CHANNEL_AND_PLATFORM_TYPE_MASTER_REQUIRED`
- `full160Authorized=false`
- 本轮多粒度重构研究授权已执行完毕；默认不得继续在同一 development 窗口调参
- 本轮真实账单 v0.7 recalibration 授权已执行完毕；参数和失败结论已冻结，
  `candidateSelectionAuthorized=false`
- 本轮人工渠道 v0.8 comparator 授权已执行完毕；规则、窗口和失败结论已冻结，
  `candidateSelectionAuthorized=false`
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
4. v0.8 人工渠道规则仅进入自动回归 comparator。下一步建立版本化渠道主表：
   raw ID/名称 → canonical channel → 会员/单购/其他平台类型。账单分区已经完成，
   不得再次要求用户逐行判断买断。
5. 下一模型应使用“作品×canonical 平台×平台类型×三级分类×级别×上线月龄”
   的分层结构。会员平台建收入曲线；单购平台先换算销量，再建首发衰减与季节
   曲线。安全窗口无耽美成熟 case 时保持该分群阻断。
6. 下一次组合或作品模型选模必须使用未参与 v0.5/v0.7/v0.8 设计的 later origin 或
   final holdout；未获单独授权前继续 sealed，不得在当前 2022 development
   窗口继续调参。
7. 只接收 cutoff 时真实可得、可审计、可版本化、exact-work 的分成预测信号：
   sales historical availability、合同可售状态、渠道状态；commitment 不得作为
   分成预测信号。
8. D1 合同、缺口 ledger、来源字段审计和 digest-bound portable intake 已建立；
   使用 `npm run diagnose:m2:signal-input` 验证公开 synthetic 输入，受控数据通过
   `--bundle-file` 与 `--case-file` 提交同目录摘要绑定包。下一步采集/物化符合
   合同的历史 `availabilitySnapshot`，补齐 economic、posting、available-at、
   来源版本和 lineage。当前冻结/逐月 occurrence 与 positive amount 合规覆盖
   均为 0；无历史 snapshot 的 current 状态不得回填。
9. 新信号先通过 25-origin 次级诊断，再在 7,083 个当前人工权威 served case
   上做 nested challenger，并同时保留 7,851 个旧机器路由 case 的差异审计；
   不剔除困难分成 case，不将 pure-buyout/null 计为 0。
10. 只有绝对质量、segment、平台类型/品类、risk–coverage 和业务损失均通过，才申请 final
   holdout；失败时继续 fallback，不得用新模型数量替代证据质量。
11. 120 部人工评估继续完全跳过。人工只负责渠道主表/账单分区的数据治理，以及
   技术门禁通过后的 post-gate QA；不提供预测金额。
12. final holdout、embargo shadow、deferred labels、provider、数据库、
   Canary/full160、release 和 M3 formal 在收到各自明确授权前继续 sealed/禁止。

当前启动状态：

- 已实现：R0–R5 strict contract、multi-resolution evaluator、加总
  additive Holt–Winters ensemble、六个简单基线、三个全局 challenger、
  rolling conformal、MinT、risk–coverage、业务损失和 FVA；D1
  `revenueShareFact`、`availabilitySnapshot`、signal-gap ledger、来源字段审计
  和 digest-bound portable signal input bundle/CLI；v0.7 三个低复杂度历史
  baseline 与分层 recent-origin nested selector；v0.8 人工渠道 comparator、
  安全历史窗口物化和聚合回测。
- 已验证：三账单逐行/逐月守恒、3,053 基础人口与 3,052 账单观察人口边界、
  7,851 旧机器路由到 7,083 当前 served case 的重分类、25-origin/56,856-case
  次级 development 复验；人工分区后作品 WAPE 0.49075894，组合 WAPE
  0.42609452，二者均失败；D1 synthetic contract 通过，合规 snapshot 覆盖为
  0；v0.8 按人工分区重跑 WAPE 0.69415424 并被拒绝，完整 M2 成熟度未通过。
- 已退役：120 部人工评估的 current 依赖；不重建、不重放。
- 下一输入：版本化 canonical 渠道/平台类型主表，以及带 economic、posting、
  available-at、来源版本、lineage 与完整性权威的作品层历史分成 snapshot。
  账单分区已完成，不得重复索要买断逐行判断；不存在新输入时保持阻断，不能把
  现有 posthoc history 改名冒充。later-origin/final holdout 仍需单独授权。
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
