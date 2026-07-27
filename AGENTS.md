# Codex 工作规则

## 当前权威入口

- 用户首页与公共开始入口：`README.md`
- 当前 M2 状态：`docs/analysis/m2-v2/M2-v2-current-state-index-v0.28.md`
- M2 模型机器权威：`config/m2-model-registry.v1.json`
- M2 中文目录：`docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`
- M2 评价体系：
  - `docs/analysis/m2-current/M2-evaluation-system-audit-v1.md`
  - `docs/analysis/m2-current/M2-evaluation-contract-v2-proposal.md`
  - `docs/analysis/m2-current/M2-evaluation-v2-frozen-artifact-readiness-v1.md`
  - `docs/analysis/m2-current/M2-evaluation-v2-frozen-rescore-v1.md`
  - `docs/analysis/m2-current/M2-evaluation-contract-v2-validation-v1.md`
- M2 canonical core 局部规则：`src/domain/m2Current/AGENTS.md`
- 仓库收敛与可移植开发：
  - `docs/analysis/repository-current-state-and-convergence-audit-v0.1.md`
  - `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
- 产品定义：`docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`

PR #7 的 cryptographic authority 继续由不可变的
`docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json` 提供。历史 PR、旧分支、
B0–B8、C1–C3、局部实验臂和旧授权记录只用于审计追溯，不是当前执行指令。

## 长期用户报告与审计身份规则

- 用户可见的阶段反馈、结论和复盘必须中文优先；英文原名、稳定 ID 与机器状态码
  保留在括号或反引号中，不能用英文缩写或状态码代替中文解释。
- 不得向用户裸写缺少所属实验的局部缩写，例如 `G1`、`A5`、`R3` 或 `K1`。
  必须同时给出所属实验、中文含义和对象类型。
- 明确区分模型、模型家族、实验、实验臂/消融、检查点、评价活动、状态索引、
  报告/config/schema 版本、状态码和命令；不得用一个编号冒充另一类对象。
- 历史文件名、历史 ID、schema、digest、冻结结果与不可变审计 artifact
  不得因此被重命名、改写或回填，也不得重新解释为当前授权；命名、目录或信息架构
  治理只能增加当前映射和解释层。
- 进度报告必须区分“已实现、已验证、已授权、可发布”，并报告 exact HEAD、远端
  状态、CI、开放 finding、private capability 和业务 gate。

## 每次任务的只读基线

1. 运行 `git fetch origin --prune`。
2. 检查工作区、当前分支、upstream、`origin/main`、ahead/behind、开放 PR、CI
   和 worktree。
3. 只有工作区干净且可快进时才允许 `pull --ff-only`。
4. 实现前用 `rg` 检索入口、调用方、测试和 canonical 实现，并检查：
   - 失效代码和逐字节重复文件；
   - 平行 runtime/runner/adapter；
   - 重复 package scripts；
   - formal/fixture 与 public/private 边界；
   - CI 与本地门禁是否一致。
5. 非本轮修改属于用户；不得读取、删除、覆盖或混入提交。

默认只维护 `main` 和一条当前活动分支。删除分支前必须确认已合并、没有独有提交，
且不再被 PR 或 worktree 引用。

## 工具链与多电脑基线

- Node：24.x
- npm：11.13.0
- Python：3.11–3.13；reference/CI 为 3.13
- GitHub CI：Linux 与 Windows 使用相同公共门禁

新电脑只依赖 GitHub 中的公开内容：

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
npm run test:e2e
npm run verify:m2:current
```

`npm start` 启动 formal composition；`npm run start:fixture` 启动 synthetic
fixture composition。两者在无 private、无数据库条件下都必须能启动并通过
`/health`，formal 不得静默回落到 fixture。

## Private capability 边界

- `data/private-input/**`、`data/private-output/**`、原始账单、台账、材料、private
  receipt/workbook、密钥、连接串、dump、`.env` 和 `.pgpass` 禁止提交。
- 禁止伪造 private 文件、从公开聚合摘要反推 private 内容、降低真实性 verifier，
  或用文件存在代替真实性通过和执行授权。
- 使用 `npm run doctor:capability -- <capability-id>` 盘点能力。缺少 private 只能
  阻断所属 capability，不能阻断 clone、安装、lint、build、公共测试、smoke、
  公共诊断或本地服务器启动。
- 跨电脑恢复只能使用 capability-scoped 加密包、逐文件摘要和原子恢复；环境变量、
  provider key 与数据库凭据不得进入包。
- 需要用户补充材料时，先给中文简表、中文选项和“你的填写”列；允许“不清楚”或
  “没有”，并说明最少依据和可复制回复。敏感材料只能进入 Git ignored 的
  capability 目录或任务附件，不得要求上传 GitHub。

## 命令生命周期与代码收敛

`config/command-lifecycle.v0.1.json` 是 package scripts 生命周期的 canonical
registry：

- `current-public`：普通开发与 CI 可使用；
- `archive-only`：只用于历史审计重放，不授予新开发或业务权限；
- `restricted-local`：需要所属 private/local capability 和单独授权；
- `history-dispatcher`：历史命令的统一人工入口。

历史命令因不可变审计兼容继续保留。人工重放时使用：

```bash
npm run history:m2 -- --acknowledge-archive-only <archive-script> [arguments]
```

不得复制历史 runner 创建新路线。新 M2 实现必须扩展
`src/domain/m2Current/**`；production loader、route、API 和 fixture composition
必须保持单一 canonical 实现。清理代码前必须证明无调用方、无测试/合同绑定、无
冻结审计依赖；“旧”或“失败”本身不是删除依据。

## M2 长期业务与评价边界

- 正式目标是未来分成收入现金。买断及其他非分成现金只进入模型外账单/审计层，
  不得进入特征、标签、回测指标、点预测、区间或年度预测明细。
- 人工拆分账单成员关系是现金类型唯一权威：总账只作守恒审计，分成账单是预测
  actual 的唯一来源，买断账单只作评级/历史背景。
- pure-buyout 必须 `null abstain`，原因为
  `buyout_outside_m2_forecast_scope`；禁止使用 0、承诺金额或月均等效值冒充预测。
- eligibility、target classification、served coverage 和 company-cash economic
  scope 必须分别报告；不得为了保持旧人口把弃权 case 计为 0。
- 所有模型输入必须能证明在 forecast origin 可得。没有 historical
  `effectiveAt/availableAt` 的 current 状态不得事后回填。
- 作品点预测、组合预测、排序/分配和风险区间属于不同能力，不得共享排行榜，也不得
  将 portfolio 结果分配回作品。
- 不同目标、粒度、人口、horizon、评价窗口、actual 定义或评价家族的成绩不得直接
  排名；只允许同人口或明确 same-case intersection 的配对比较。
- operational fallback、research baseline、candidate、blocked、failed 和
  not executed 必须明确区分。fallback 或 selected pipeline 不得掩盖 raw
  candidate 结果、raw FVA 或真实失败结论。
- 当前模型角色、可比组和状态必须从 Model Registry 与最新状态索引读取，不得把
  README、旧报告或历史 PR 当成机器权威。
- 120 部人工预测/复核已取消；不得重建、重放或生成替代样本。人工只做技术门禁后的
  post-gate QA，不提供预测金额。
- 默认不授权训练、调参、新候选、private evaluation、provider、数据库、
  final holdout、embargo、Canary/full160、release 或 M3 formal。只有当前用户任务
  的明确授权才能打开对应能力，且授权不跨任务自动延续。

## Git 与提交规则

- 禁止 rebase、squash、amend、force push。
- 禁止触碰 stash，包括应用、删除、改写或清理。
- 禁止 `git add .` 和 `git add -A`；暂存必须使用显式路径。
- 技术线与运营线不得混提交。
- 禁止连接远端 production、共享或 staging-like 数据库。

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

涉及跨电脑、工具链、private 解耦、启动入口或 CI 时，还必须在不含
`data/private-input`、`data/private-output` 和环境凭据的全新克隆中运行完整公共
基线。任何失败不得伪造通过，必须报告失败命令、原因和未验证项。

## M3 边界

可以维护 M3 synthetic fixture/prototype，但不得解释为 M3 formal execution。
M3 formal task/export/write API、真实材料应用、正式回测和 release 必须等待独立
授权；私有字段应用命令也不等于 M3 formal execution。
