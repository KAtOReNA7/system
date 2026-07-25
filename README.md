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
- 当前业务结论：`currentDecision=CANARY_FAIL`。
- 当前开发 readiness：
  `nextDevelopmentReadiness=SALES_SHARE_TARGET_VALIDATION_AND_WORK_LEVEL_SIGNAL_REQUIRED`。
- R0–R5 评估已完成；全局 hurdle GLM、Tweedie boosting、hurdle GBM、MinT
  和 ensemble 均未通过 nested gate，v0.4 安全回退 exact v0.3。120 部人工
  评估完全跳过。provider、Canary/full160、final holdout、release 和 M3
  formal 均未授权。v0.6 已把正式目标迁移为纯分成收入并隔离全部买断；
  portfolio development backtest WAPE 仍为 11.68%，作品级和完整 M2
  成熟度仍未通过。当前冻结/逐月合规历史 snapshot 覆盖均为 0；公开
  digest-bound portable signal intake 已实现。v0.7 真实账单历史状态校准把
  逐月 WAPE 改善至 59.58%，但仍被绝对质量、segment、available-at 和独立
  holdout 门禁拒绝，不构成候选升级。

当前导航：

- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.13.md`
- `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
- `docs/analysis/m2-current/M2-current-maturity-reconstruction-v0.6.md`
- `docs/analysis/m2-current/M2-sales-share-only-target-decision-v0.1.md`
- `docs/analysis/m2-current/M2-sales-share-model-full-audit-and-research-v0.1.md`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/analysis/m2-current/M2-current-signal-input-portable-intake-v0.1.md`
- `docs/analysis/m2-current/M2-current-real-bill-recalibration-v0.1.md`
- `AGENTS.md`

历史 PR、B0–B8、C1–C3 和旧授权记录保留在 `docs/analysis/` 中，只用于审计追溯，不是当前开发入口。

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
npm run verify:m2:signal-input
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
| model works / formal-cash cases | 824 / 7,851 |
| model work share | 26.99% |
| 历史全库 / Top10 旧 cash economic scope | 73.96% / 75.94% |
| v0.6 冻结 / 逐月目标变化 case | 0 / 0 |
| v0.6 冻结 / 逐月隔离买断 case 求和 | 4,800,850.15 / 11,578,795.00 |
| v0.6 冻结 / 逐月分类不确定现金占比 | 0 / 0 |
| D1 冻结 / 逐月合规 snapshot 覆盖 | 0 / 0 |
| 已审计 / 可直接使用的历史信号来源角色 | 4 / 0 |
| B4 WAPE / bias | 0.55648454 / 0.08911106 |
| v0.2 WAPE / bias | 0.51114966 / -0.00586227 |
| v0.3 WAPE / bias | 0.50557140 / -0.01198958 |
| v0.4 gated result WAPE / bias | 0.50557140 / -0.01198958 |
| 5-origin 稀疏 origin×horizon 组合 WAPE | 0.08397490 |
| 25-origin mature cases | 56,856 |
| monthly baseline champion WAPE / bias | 0.66335800 / -0.30206120 |
| v0.7 history-regime WAPE / bias | 0.59576421 / -0.21126360 |
| v0.7 dense / intermittent / dormant WAPE | 0.39900895 / 0.82897090 / 1.00725629 |
| monthly baseline 组合 WAPE / bias | 0.32846914 / -0.30206335 |
| v0.5 portfolio development WAPE / bias | 0.11681934 / -0.04876300 |
| v0.5 origin-bootstrap WAPE 95% CI | [0.08500048, 0.13717581] |
| v0.5 origin-bootstrap bias 95% CI | [-0.09940077, 0.02145806] |
| v0.5 vs seasonal naive FVA | 44.94% |
| v0.5 portfolio cell APE p90 | 0.28366167 |
| monthly 80% interval coverage | 0.64363277 |
| development WAPE 门槛 | 0.30（未通过） |
| automation decision | `AUTOMATION_BLOCKED` |

v0.4 与 v0.3 数值相同是因为所有 challenger 被门禁拒绝后 fallback，不是新模型
打平。绝对 WAPE 仍约 50.56%；intermittent WAPE 约 90.73%，dormant
WAPE/bias 约 100.02% / -99.97%。这不是 release 证据。120 部旧 JSON 仅保留
历史追溯，不参与配置、runner、loader、readiness 或验收，也不重建或重放。

v0.5 将预测决策粒度拆成作品、origin 组合和 origin×horizon 组合。新的加总
additive Holt–Winters ensemble 在 2022-01 后 12 个逐月 origin、30 个
development cell 上 WAPE 为 11.68%，较同窗 seasonal naive 改善 44.94%。
按 origin 聚类 bootstrap 的 WAPE 95% CI 为 8.50%–13.72%，bias 95% CI 为
-9.94%–2.15%。
这证明组合预算层已有高准确度 development backtest，但不是独立 holdout：
作品级 WAPE 仍为 50.56%，v0.7 也未通过作品级绝对质量和 segment 门禁，
final holdout 仍 sealed，所以当前状态是
`SALES_SHARE_TARGET_MIGRATED_PORTFOLIO_DEVELOPMENT_PASS_WORK_LEVEL_BLOCKED`。

v0.7 在六个原有基线上增加 recent-mean-3、seasonal-median-2 和 EWMA(0.5)，
只使用最近 6 个更早且已成熟 origin，并按 segment、horizon 和最近 12 个月
出现频次分层选择。它对旧逐月 champion 的 WAPE 相对改善 10.19%，但仍是
posthoc 同窗诊断；历史特征 `availableAt` 不可证明，也没有独立 holdout。
结论固定为 `REJECT_KEEP_V0_3_WORK_LEVEL_FALLBACK`。

买断隔离没有改变当前冻结标签或 WAPE：现有 authority 中没有进入旧目标的
cutoff-linked 买断/其他承诺现金，旧标签事实上已经等于分成标签。本次迁移的
价值是固定未来业务语义、去除 private commitment 依赖和防止新数据重新混入
买断，不是一次精度提升。

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
   - v0.5 portfolio development backtest 通过，但完整 M2 成熟度未通过。
   - v0.7 真实账单校准有改善但仍失败；参数与失败结论已冻结，不得同窗继续调参。
4. **下一次组合验证**
   - 下一次组合或作品模型选模只能使用未参与 v0.5/v0.7 设计的 later-origin
     或单独授权 final holdout；
   - 禁止继续在同一 2022 development 窗口调参后宣称独立验证。
5. **补充可审计输入（仅真实材料存在时）**
   - exact-work sales historical availability、合同可售和渠道状态 snapshot；
   - commitment 只保留在模型外账单/审计层，不作为分成预测信号；
   - 合同、可售、发布与渠道状态必须能证明在 cutoff 时可得，禁止事后回填；
   - 缺少版本化完整性权威时必须 `unknown_at_origin`，pure-buyout 继续
     `null abstain`。
6. **作品级下一轮研究**
   - D1 fact/snapshot、intermittent/dormant 缺口 ledger 和 portable intake
     已建立；
   - 受控输入使用 `diagnose:m2:signal-input -- --bundle-file ... --case-file ...`，
     不依赖仓库内固定 private 文件名，且只输出聚合覆盖；
   - 新信号先过 25-origin 诊断，再在 7,851-case 权威人口 nested 复验；
   - 当前停止新增模型家族和同类调参。
7. **决策门禁**
   - 120 部人工评估完全跳过；人工只做技术门禁后的 post-gate QA。
   - final holdout、embargo shadow、provider、数据库、Canary/full160、release
     和 M3 formal 继续保持未授权。

启动检查：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run verify:m2:current
```

`doctor:capability` 只盘点本机库存，不授予训练、新候选或 holdout 权限。没有 private
capability 的电脑仍可执行全部公共开发基线。

有本机 private capability 且具备对应授权时，复现当前 R0–R5 development：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

该命令只写入 Git ignored private 明细和公开聚合结果，不打开 final holdout。

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
