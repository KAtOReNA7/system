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
  `nextDevelopmentReadiness=CANONICAL_CHANNEL_AND_PLATFORM_TYPE_MASTER_REQUIRED`。
- R0–R5 评估已完成；全局 hurdle GLM、Tweedie boosting、hurdle GBM、MinT
  和 ensemble 均未通过 nested gate，v0.4 安全回退 exact v0.3。120 部人工
  评估完全跳过。provider、Canary/full160、final holdout、release 和 M3
  formal 均未授权。三份人工复核账单已成为现金分类权威：总账只审计，分成只
  预测，买断只作评级背景。人工权威复验后作品 WAPE 为 49.08%，portfolio
  WAPE 为 42.61%，两层均失败；v0.8 人工渠道规则 379 个安全 case 的 WAPE
  为 69.42%。下一步完成 canonical 渠道/平台类型主表，再开发平台分层模型。

当前导航：

- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.15.md`
- `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
- `docs/analysis/m2-current/M2-current-maturity-reconstruction-v0.6.md`
- `docs/analysis/m2-current/M2-sales-share-only-target-decision-v0.1.md`
- `docs/analysis/m2-current/M2-sales-share-model-full-audit-and-research-v0.1.md`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/analysis/m2-current/M2-current-signal-input-portable-intake-v0.1.md`
- `docs/analysis/m2-current/M2-current-real-bill-recalibration-v0.1.md`
- `docs/analysis/m2-current/M2-current-manual-channel-backtest-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
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
| 有账单观察作品 | 3,052 |
| 旧机器路由审计人口 | 824 works / 7,851 cases |
| 当前人工权威 served 人口 | 758 works / 7,083 cases |
| 人工权威 pure-buyout 弃权 | 768 cases |
| 总账 / 分成 / 买断行数 | 192,370 / 190,663 / 1,707 |
| 人工账单分区分类不确定现金占比 | 0 |
| D1 冻结 / 逐月合规 snapshot 覆盖 | 0 / 0 |
| 已审计 / 可直接使用的历史信号来源角色 | 4 / 0 |
| 当前作品级 WAPE / bias | 0.49075894 / 0.07378107 |
| 当前 B4 WAPE | 0.54929375 |
| dense / intermittent / dormant WAPE | 0.45873171 / 0.96321675 / 1.01854144 |
| 3 / 6 / 12 / 18 / 24 月 WAPE | 0.3940 / 0.4140 / 0.4299 / 0.5373 / 0.7449 |
| 25-origin mature cases | 56,856 |
| 当前 portfolio WAPE / bias | 0.42609452 / 0.42609452 |
| 当前 portfolio FVA | -1.34255921 |
| v0.8 人工渠道规则安全窗口 case | 379 |
| v0.8 人工规则 WAPE / bias | 0.69415424 / -0.32056442 |
| development WAPE 门槛 | 0.30（未通过） |
| automation decision | `AUTOMATION_BLOCKED` |

现金类型现在只由用户人工复核后的三份 private 账单成员关系决定。总账只作守恒
审计，分成账单是预测链路唯一现金来源，买断账单只作评级历史背景。旧机器路由的
7,851 个 case 仍保留为审计基线，但其中 768 个被人工权威纠正为 pure-buyout，
当前必须弃权；不得为了保持旧人口继续预测买断。

这次修正推翻了旧的组合层“development PASS”：人工分区后 portfolio WAPE/bias
均为 42.61%，FVA 为负，作品层、intermittent、dormant 和长周期也全部未达标。
因此当前状态是 `CANDIDATE_DEVELOPMENT_FAIL_BLOCKED`，不能开启自动化、final
holdout 或 release。v0.8 人工渠道规则的买断真值门禁已经通过，但 WAPE 仍为
69.42%，下一数据治理重点只剩 canonical 渠道与平台类型，而不是再次判断买断。

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
4. **先完成渠道治理**
   - 建立 raw ID/名称到 canonical channel 及会员/单购/其他平台类型的版本化主表；
   - 分成/买断人工账单分区已完成；更新账单后运行
     `npm run develop:m2:current:ledger-partition` 验证守恒；
   - private 账单和渠道主表不进入 Git，也不得成为公共 clone、测试或启动依赖。
5. **下一次组合验证**
   - 下一次组合或作品模型选模只能使用未参与 v0.5/v0.7 设计的 later-origin
     或单独授权 final holdout；
   - 禁止继续在同一 2022 development 窗口调参后宣称独立验证。
6. **补充可审计输入（仅真实材料存在时）**
   - exact-work sales historical availability、合同可售和渠道状态 snapshot；
   - commitment 只保留在模型外账单/审计层，不作为分成预测信号；
   - 合同、可售、发布与渠道状态必须能证明在 cutoff 时可得，禁止事后回填；
   - 缺少版本化完整性权威时必须 `unknown_at_origin`，pure-buyout 继续
     `null abstain`。
7. **作品级下一轮研究**
   - D1 fact/snapshot、intermittent/dormant 缺口 ledger 和 portable intake
     已建立；
   - 受控输入使用 `diagnose:m2:signal-input -- --bundle-file ... --case-file ...`，
     不依赖仓库内固定 private 文件名，且只输出聚合覆盖；
   - 新信号先过 25-origin 诊断，再在 7,083 个当前 served case nested 复验，
     并保留 7,851 个旧机器路由 case 的差异审计；
   - 渠道治理完成后，开发作品×canonical 平台×平台类型×三级分类×级别的分层
     模型；会员平台建收入曲线，单购平台建销量、首发衰减和季节曲线；
   - 当前停止新增同类总收入模型和同窗调参。
8. **决策门禁**
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
