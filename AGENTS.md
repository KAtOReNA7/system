# Codex 工作规则

## 当前唯一入口

- PR #7、PR #8、PR #9、PR #10、PR #11、PR #12、PR #13 均已合入 `main`；已合并分支不得继续作为开发入口。
- 当前仓库治理导航为：
  - `docs/analysis/m2-v2/M2-v2-current-state-index-v0.11.md`
  - `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
  - `docs/analysis/m2-current/M2-current-maturity-reconstruction-v0.6.md`
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

- 正式目标继续是未来账单现金：未来实销现金，加 cutoff 时已签署、确认且可审计的未来现金承诺。
- 未承诺未来买断、概率乘金额、历史买断摊销和 `buyoutMonthlyEquivalent` 不得进入正式现金预测。
- `buyoutMonthlyEquivalent` 只允许作为 rating/historical context，并保持 `notCashForecast=true`。
- 无 strict cutoff commitment 的 pure-buyout 必须 null abstain，禁止使用 0 或月均等效值冒充预测。
- commitment 必须 exact-work、已签署、已确认、cutoff 前可得、可审计，且预计入账月位于 horizon。
- B4 只作 comparator/fallback，不是 release approval。
- C1、legacy C2-R、C2-R.1、C2、C3 均为历史 development `FAIL`，不得重复进入或复制其 runner。
- 2026-07-24 用户已授权并完成 R0–R5 及本轮多粒度组合模型本地 development
  复验；授权只覆盖冻结 development case 和本机已验证 authority cache，不包含
  provider、数据库、final holdout、release 或 M3 formal。
- 当前公共诊断为
  `PORTFOLIO_DEVELOPMENT_BACKTEST_PASS_WORK_LEVEL_BLOCKED`：
  - 3,053 部权威作品，824 部 model works，7,851 个 formal-cash cases
  - 全库现金覆盖率 0.7396468495，Top10 覆盖率 0.759412528，门槛 0.90
  - v0.3 WAPE/bias 0.50557140 / -0.01198958；v0.2 为
    0.51114966 / -0.00586227；B4 为 0.55648454 / 0.08910997
  - v0.4 gated result WAPE/bias 0.50557140 / -0.01198958；它在五个 outer
    origin 都回退 exact v0.3，不是新模型打平
  - 绝对 WAPE 高于 0.30 development 门槛；intermittent WAPE 0.9073，
    dormant WAPE/bias 1.00018 / -0.99972，均不具备 decision-grade 质量
  - 25 个逐月 origin 形成 56,856 个成熟 case；rolling baseline champion
    WAPE/bias 0.66335800 / -0.30206120，80% interval coverage 0.64363277
  - v0.3/v0.4 在 5 个稀疏半年 origin 的 origin×horizon 组合 WAPE 为
    0.08397490，但现有逐月组合基线 WAPE/bias 为 0.32846914 /
    -0.30206335；稀疏汇总不得冒充逐月成熟度
  - v0.5 使用 strictly as-of 的加总 additive Holt–Winters 三模型 ensemble；
    在 2022-01 后 12 个逐月 origin、30 个 origin×horizon development cell 上
    WAPE/bias 0.11681934 / -0.04876300，较 seasonal naive 的
    0.21217335 改善 44.94%，portfolio development gate 通过
  - 按 origin 聚类 bootstrap 的 WAPE 95% CI 为
    [0.08500048, 0.13717581]，bias 95% CI 为
    [-0.09940077, 0.02145806]；区间门禁通过但仍是 development evidence
  - v0.5 是 development backtest，不是独立 holdout；cell APE p90 为
    0.28366167，作品级 WAPE、intermittent/dormant、cash observability 和
    final holdout 仍阻断完整 M2 成熟声明
  - global hurdle GLM、Tweedie boosting、hurdle GBM、MinT 和受约束 ensemble
    均未通过 nested gate；继续堆叠同类模型不是当前优先级
- 当前 development champion 仍为
  `M2-current-occurrence-amount-calibration-v0.3`。v0.4 只是在严格门禁拒绝所有
  challenger 后返回 v0.3，不能表述为候选升级。
- 当前 portfolio development candidate 为
  `M2-current-multi-resolution-revenue-service-v0.5`；只允许用于组合层
  development backtest 结论，不得下放为作品级预测、自动化或 release。
- zero、seasonal naive、classic Croston、SBA、TSB、ADIDA、B4 和 v0.3 已进入
  同人口自动回归；基线不得因表现较弱而删除。
- eligibility、cash observability 和 served coverage 必须继续分开报告。2,229 部非模型作品的原因 ledger 已在本地 private output 穷尽对账；不得为提高比例移动 824/7,851 冻结人口。
- 用户已明确取消并要求跳过 120 部人工预估/复核。不得重建、重放或生成替代
  样本；旧 JSON 仅是历史审计 artifact，不是 current 配置、runner、loader、
  readiness 或验收依赖。
- 人工只在自动技术门禁和后续授权通过后做 post-gate quality assurance：
  `accept`、`accept_with_limits` 或 `reject`；人工不提供预测金额，也不与模型比赛。

当前业务 gate 保持：

- `currentDecision=CANARY_FAIL`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=PORTFOLIO_INDEPENDENT_VALIDATION_AND_WORK_LEVEL_SIGNAL_REQUIRED`
- `full160Authorized=false`
- 本轮多粒度重构研究授权已执行完毕；默认不得继续在同一 development 窗口调参
- final holdout、embargo shadow、deferred labels 均 sealed
- provider、远端/共享/staging-like 数据库、Canary/full160、release、M3 formal 均未授权

## M2 当前执行队列（2026-07-24 多粒度重构后）

以下顺序是当前仓库任务的默认优先级。除非用户明确改变业务方向或新增授权，否则
不得以继续调参、扩建 evidence runtime、复制历史 runner 或重新引入 120 部人工评估代替。

1. 保持 exact v0.3/v0.4 作品级 fallback；不得把 v0.5 portfolio 结果分配回作品。
2. 保持三个分辨率同时报告：作品 case、origin 组合、origin×horizon 组合；任何
   稀疏权威结果都必须由逐月 origin 结果交叉检查。
3. 下一次组合模型评价必须使用未参与本轮选择的 later-origin/final holdout；
   未获单独授权前继续 sealed，不得在当前 2022 development 窗口继续调参。
4. 只接收 cutoff 时真实可得、可审计、可版本化、exact-work 的新信号：
   commitment snapshot、sales historical availability、合同/可售/渠道状态。
5. 先建立 intermittent/dormant occurrence 与 positive amount 的数据缺口
   ledger，并量化每个信号的 work/origin 覆盖；无历史 snapshot 的 current
   状态不得回填。
6. 新信号先通过 25-origin 次级诊断，再回到 7,851-case 权威人口做 nested
   challenger；不移动冻结人口，不剔除困难 case，不将 null 计为 0。
7. 只有绝对质量、segment、risk–coverage 和业务损失均通过，才申请 final
   holdout；失败时继续 fallback，不得用新模型数量替代证据质量。
8. 120 部人工评估继续完全跳过。人工只在技术门禁通过后做 post-gate QA。
9. final holdout、embargo shadow、deferred labels、provider、数据库、
   Canary/full160、release 和 M3 formal 在收到各自明确授权前继续 sealed/禁止。

当前启动状态：

- 已实现：R0–R5 strict contract、multi-resolution evaluator、加总
  additive Holt–Winters ensemble、六个简单基线、三个全局 challenger、
  rolling conformal、MinT、risk–coverage、业务损失和 FVA。
- 已验证：权威 7,851-case 与 25-origin/56,856-case 次级 development 复验；
  作品级 challenger 均失败并安全回退 v0.3；portfolio v0.5 development
  backtest 通过，但完整 M2 成熟度未通过。
- 已退役：120 部人工评估的 current 依赖；不重建、不重放。
- 下一输入：组合层未参与选择的 later-origin/final holdout，或作品层真实的
  cutoff as-of signal 与 cash observability 数据；不存在时保持阻断。
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
