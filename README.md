# 有声书产品收入评估与年度目标系统

这是 M1 数据基础、M2 旧产品正式现金预测与 M3 新产品 synthetic prototype 的统一仓库。当前代码可在不具备任何 private 文件、provider key 或数据库的电脑上完成安装、检查、测试、公共诊断和本地启动。

## 当前状态

- PR #7：M2 v2 evidence pilot 完整性修复，已合并。
- PR #8：工具链、runtime、冗余和 M2 current 诊断收敛，已合并。
- PR #9：GitHub Actions exact detached `main` checkout 修复，已合并。
- PR #10：M2 current canonical core、portable development 和 v0.1 候选收敛，已合并。
- PR #11：M2 current v0.2 可靠预测候选和 120 部冻结业务样本，已合并。
- PR #12：M2 current v0.3 自动评价与 120 部 current 依赖退役，已合并。
- 当前业务结论：`currentDecision=CANARY_FAIL`。
- 当前开发 readiness：
  `nextDevelopmentReadiness=AUDITABLE_AS_OF_SIGNAL_AND_CASH_OBSERVABILITY_REQUIRED`。
- R0–R5 评估已完成；全局 hurdle GLM、Tweedie boosting、hurdle GBM、MinT
  和 ensemble 均未通过 nested gate，v0.4 安全回退 exact v0.3。120 部人工
  评估完全跳过。provider、Canary/full160、final holdout、release 和 M3
  formal 均未授权。

当前导航：

- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.10.md`
- `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
- `docs/analysis/m2-current/M2-current-R0-R5-evaluation-and-development-v0.5.md`
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

M2 的正式预测对象是未来账单现金。正式边界保持：

- as-of/no-leakage
- 无承诺 pure-buyout 使用 null abstention
- 禁止 null→0
- B4 仅作 comparator/fallback
- final holdout 保持 sealed

当前公共诊断：

| 指标 | 当前值 |
|---|---:|
| 权威作品 | 3,053 |
| model works / formal-cash cases | 824 / 7,851 |
| model work share | 26.99% |
| 全库 / Top10 cash coverage | 73.96% / 75.94% |
| coverage 门槛 | 90% |
| B4 WAPE / bias | 0.55648454 / 0.08911106 |
| v0.2 WAPE / bias | 0.51114966 / -0.00586227 |
| v0.3 WAPE / bias | 0.50557140 / -0.01198958 |
| v0.4 gated result WAPE / bias | 0.50557140 / -0.01198958 |
| 25-origin mature cases | 56,856 |
| monthly baseline champion WAPE / bias | 0.66335800 / -0.30206120 |
| monthly 80% interval coverage | 0.64363277 |
| development WAPE 门槛 | 0.30（未通过） |
| automation decision | `AUTOMATION_BLOCKED` |

v0.4 与 v0.3 数值相同是因为所有 challenger 被门禁拒绝后 fallback，不是新模型
打平。绝对 WAPE 仍约 50.56%；intermittent WAPE 约 90.73%，dormant
WAPE/bias 约 100.02% / -99.97%。这不是 release 证据。120 部旧 JSON 仅保留
历史追溯，不参与配置、runner、loader、readiness 或验收，也不重建或重放。

## M2 当前执行队列

本队列已于 2026-07-24 按用户判断调整。人工预测竞赛和 120 部清单均已取消。

1. **R0–R5 评价（已执行）**
   - strict target/route/censor/commitment contract；
   - 25 个逐月 origin、六个简单基线、nested global model、rolling conformal、
     MinT、ensemble、risk–coverage、business loss 和 FVA。
2. **质量结论**
   - 三个全局模型和 MinT 均失败；v0.4 在五个 outer origin 回退 exact v0.3；
   - 不得把 fallback 表述为候选升级、可打开 holdout 或可发布。
3. **补充可审计输入（仅真实材料存在时）**
   - exact-work commitment snapshot 和 sales historical availability snapshot；
   - 合同、可售、发布与渠道状态必须能证明在 cutoff 时可得，禁止事后回填；
   - pure-buyout 无 strict commitment 时继续 `null abstain`。
4. **下一轮研究**
   - 先建立 intermittent/dormant occurrence 与 positive amount 数据缺口 ledger；
   - 新信号先过 25-origin 诊断，再在 7,851-case 权威人口 nested 复验；
   - 当前停止新增模型家族和同类调参。
5. **决策门禁**
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
