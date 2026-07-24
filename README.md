# 有声书产品收入评估与年度目标系统

这是 M1 数据基础、M2 旧产品正式现金预测与 M3 新产品 synthetic prototype 的统一仓库。当前代码可在不具备任何 private 文件、provider key 或数据库的电脑上完成安装、检查、测试、公共诊断和本地启动。

## 当前状态

- PR #7：M2 v2 evidence pilot 完整性修复，已合并。
- PR #8：工具链、runtime、冗余和 M2 current 诊断收敛，已合并。
- PR #9：GitHub Actions exact detached `main` checkout 修复，已合并。
- PR #10：M2 current canonical core、portable development 和 v0.1 候选收敛，已合并。
- PR #11：M2 current v0.2 可靠预测候选和 120 部冻结业务样本，已合并。
- 当前业务结论：`currentDecision=CANARY_FAIL`。
- 当前开发 readiness：`nextDevelopmentReadiness=BUSINESS_SAMPLE_REVIEW_REQUIRED`。
- v0.2 可靠预测候选和 120 部确定性业务样本已完成；人工业务复核仍为
  `PENDING`。provider、Canary/full160、final holdout、release 和 M3 formal
  均未授权。

当前导航：

- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.7.md`
- `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.4.md`
- `docs/analysis/m2-current/M2-current-reliable-model-development-v0.2.md`
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
| current candidate WAPE / bias | 0.51114966 / -0.00586227 |
| relative WAPE / paired 95% CI | -8.15% / [-15.75%, -2.91%] |
| current candidate decision | `PARTIAL_PASS` |

v0.2 在 overall、全部 horizon 和相对 B4 paired CI 上通过，并把总体偏差降至接近零；
dormant 切片仍没有改善，全库现金可观察性也仍不足。120 部唯一作品的确定性业务
样本已经生成，下一步是完成人工复核，并单独取得可审计 commitment snapshot；
不得继续复制 C1–C3 runner、堆叠 evidence runtime 或扩建候选家族。

## M2 当前执行队列

本队列已于 2026-07-24 启动。它替代继续调节 v0.2 scale、扩建 evidence runtime
或复制历史 runner 的开发方式。必须按顺序完成前置项，不得跳过人工复核直接训练
新候选或打开 final holdout。

1. **人工复核冻结样本（执行中）**
   - 固定使用已生成的 120 部唯一作品，不增加、替换或重抽样。
   - 本机受控明细角色为
     `data/private-output/m2-current-quality/M2-current-business-sample-private-v0.2.ndjson`；
     文件必须保持 Git ignored。
   - 对每行填写 `reviewOutcome`、`reviewReasonCode` 和 `reviewerNote`。
     `reviewOutcome` 只允许
     `reasonable`、`acceptable_with_limitation`、`model_issue`、`data_issue`
     或 `cash_route_issue`。
   - 同一批复核结果不得再次用于调节 v0.2。
2. **建立独立人工预测基线（等待业务人员）**
   - 人工必须只看到与模型相同 cutoff 时可取得的资料；填写预测后才可揭示
     B4、v0.1、v0.2 和 actual。
   - 至少记录人工点预测、合理区间、资料 cutoff、预测时间和复核角色。
   - 现有业务复核明细含模型值和 actual，只用于模型合理性复核，不能冒充盲视人工基线。
3. **冻结 v0.2（已执行）**
   - `M2-current-hierarchical-robust-calibration-v0.2` 保持当前 exact 规则；
     不继续搜索 scale、group 或候选家族。
4. **补充可审计输入（等待业务源）**
   - 单独准备 cutoff 时已签署、确认且可审计的 commitment snapshot。
   - 未承诺买断不得通过概率乘金额进入正式预测；pure-buyout 无承诺时继续
     `null abstain`。
5. **下一轮算法研究（尚未授权执行）**
   - 增加月度 rolling origin；
   - 建立全零、seasonal naive、SBA、TSB 和 ADIDA 基线；
   - 预先冻结“销售现金发生概率 + 正金额”的 two-part/hurdle 设计；
   - 评估严格 as-of 业务特征、概率区间、全局模型和非负层级协调。
6. **决策门禁**
   - 先比较人工、v0.1、v0.2 和简单基线，再由用户决定是否授权新候选开发。
   - final holdout、embargo shadow、provider、数据库、Canary/full160、release
     和 M3 formal 继续保持未授权。

启动检查：

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run verify:m2:current
```

`doctor:capability` 只盘点本机库存，不授予训练、新候选或 holdout 权限。没有 private
capability 的电脑仍可执行全部公共开发基线。

有本机 private capability 且具备对应授权时，复现 exact candidate：

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
