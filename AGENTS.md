# Codex 工作规则

## 当前唯一入口

- PR #7、PR #8、PR #9、PR #10、PR #11 均已合入 `main`；已合并分支不得继续作为开发入口。
- 当前仓库治理导航为：
  - `docs/analysis/m2-v2/M2-v2-current-state-index-v0.7.md`
  - `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
  - `docs/analysis/m2-current/M2-current-reliable-model-development-v0.2.md`
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
- 无 cutoff 承诺的 pure-buyout 必须 null abstain，禁止使用 0 或月均等效值冒充预测。
- B4 只作 comparator/fallback，不是 release approval。
- C1、legacy C2-R、C2-R.1、C2、C3 均为历史 development `FAIL`，不得重复进入或复制其 runner。
- 2026-07-24 用户已授权本轮本地 current candidate development；授权只覆盖冻结 development case 上的受约束算法开发和复验，不包含 provider、数据库、final holdout、release 或 M3 formal。
- 当前公共诊断为 `CANDIDATE_DEVELOPMENT_PARTIAL_BLOCKED`：
  - 3,053 部权威作品，824 部 model works，7,851 个 formal-cash cases
  - 全库现金覆盖率 0.7396468495，Top10 覆盖率 0.759412528，门槛 0.90
  - current candidate WAPE/bias 0.51114966 / -0.00586227；B4 为 0.55648454 / 0.08910997
  - paired work×origin bootstrap 相对 B4 WAPE 95% CI 为 [-0.15746081, -0.02908233]
  - 相对 v0.1 WAPE 点估计改善 3.8919%，但 paired 95% CI
    [-0.11829766, 0.01051935] 穿过零，不得声称统计确定优于 v0.1
  - overall bias、各 horizon bias 和 paired CI 已通过；dormant 未改善，结论为 `PARTIAL_PASS`
- 当前候选固定为 `M2-current-hierarchical-robust-calibration-v0.2`：
  dense/intermittent 先做 segment 校准，只有 as-of group 至少有 80 个严格更早成熟
  case 且相对 segment fallback 的 training WAPE 至少改善 1% 时才采用 group scale；
  dormant 在没有可识别 as-of 信号时必须回退 B4。
- eligibility、cash observability 和 served coverage 必须继续分开报告。2,229 部非模型作品的原因 ledger 已在本地 private output 穷尽对账；不得为提高比例移动 824/7,851 冻结人口。
- 120 部唯一作品的确定性业务抽样已生成，人工复核仍为 `PENDING`。当前正确工程
  顺序是复核已冻结样本，再单独补可审计 commitment snapshot；禁止继续堆叠
  evidence runtime、复制历史 runner 或扩建候选家族。

当前业务 gate 保持：

- `currentDecision=CANARY_FAIL`
- `nextDevelopmentReadiness=BUSINESS_SAMPLE_REVIEW_REQUIRED`
- `full160Authorized=false`
- `modelTrainingAuthorized=true` 仅限复现上述 exact v0.2 candidate
- final holdout、embargo shadow、deferred labels 均 sealed
- provider、远端/共享/staging-like 数据库、Canary/full160、新候选家族、release、M3 formal 均未授权

## M2 当前执行队列（2026-07-24 已启动）

以下顺序是当前仓库任务的默认优先级。除非用户明确改变业务方向或新增授权，否则
不得跳过前置项，也不得以继续调参、扩建 evidence runtime 或复制历史 runner 代替。

1. 冻结 120 部唯一作品样本并完成人工业务复核。
   - 受控明细角色固定为
     `data/private-output/m2-current-quality/M2-current-business-sample-private-v0.2.ndjson`。
   - 该文件必须保持 Git ignored，不得向公开文档复制作品标识、明细预测或 actual。
   - 只允许填写 `reviewOutcome`、`reviewReasonCode` 和 `reviewerNote`；
     `reviewOutcome` 必须属于
     `reasonable`、`acceptable_with_limitation`、`model_issue`、`data_issue`
     或 `cash_route_issue`。
   - 同一批复核结果不得用于重新调节 v0.2。
2. 建立同 cutoff 的独立人工预测基线。
   - 人工预测必须在揭示 B4、v0.1、v0.2 和 actual 前完成。
   - 人工只能使用预测 cutoff 时可取得的资料，并记录点预测、合理区间、
     information cutoff、预测时间和 reviewer role。
   - 现有含模型值和 actual 的业务复核明细不能冒充盲视人工预测。
   - 若同一人同时负责盲视预测和业务复核，必须先完成并锁定盲视预测，再打开
     含模型值和 actual 的业务复核明细；本队列编号表示项目交付优先级，不表示
     同一 reviewer 的信息揭示顺序。
3. 冻结 exact v0.2；停止 scale、group 和候选家族搜索。
4. 从业务源单独补充 cutoff 时已签署、确认且可审计的 commitment snapshot。
   未承诺买断不得进入正式现金预测，pure-buyout 无承诺时继续 null abstain。
5. 完成上述输入后，先设计并冻结下一轮评价合同，再申请新候选授权。评价合同应覆盖：
   - 更多月度 rolling origin；
   - 全零、seasonal naive、SBA、TSB、ADIDA；
   - 现金发生概率与正金额分别评估；
   - MASE/RMSSE、发生概率校准、正现金 case 命中率、概率区间和业务损失；
   - eligibility、cash observability、served coverage 和 abstention 分开报告。
6. 新候选若获单独授权，只能扩展 `src/domain/m2Current/**`，优先研究正常销售现金的
   two-part/hurdle、严格 as-of 特征、全局共享与非负层级协调；不得让未承诺买断进入
   概率金额模型。
7. 先完成“人工、v0.1、v0.2、简单基线”的同人口比较，再决定是否申请 final holdout。
8. final holdout、embargo shadow、deferred labels、provider、数据库、Canary/full160、
   release 和 M3 formal 在收到各自明确授权前继续 sealed/禁止。

当前启动状态：

- 已实现：v0.2、120 部冻结样本和 private review 字段已生成。
- 已验证：本机 `m2-algorithm-authoritative-input` capability 库存可用；这不等于新算法授权。
- 执行中：120 部人工业务复核。
- 等待业务输入：盲视人工预测、复核填写和 commitment snapshot。
- 未授权：新候选训练、final holdout 及所有既有业务 gate 外的动作。

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
