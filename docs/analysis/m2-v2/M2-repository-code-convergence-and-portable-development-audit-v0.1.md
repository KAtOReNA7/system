# 全库代码收敛、效率与多电脑开发审计 v0.1

## 1. 结论

项目仍在可挽回的轨道上，但资源配置已经明显失衡：

1. M1 数据底座、正式现金目标、无泄漏回测和审计约束较扎实。
2. M2 算法质量仍未达标：当前最好开发结果 C3-A 的 WAPE 为 55.3945%、signed bias 为 +8.2739%，结论仍是 `FAIL`；B4 的 WAPE 为 55.6485%，C3 只带来约 0.254 个百分点的绝对改善，未形成稳定跨 origin、跨 horizon 优势。
3. 全库在证据、历史重放和版本化 runner 上投入过重，而产品请求链路仍直接加载 fixture，M2 v2 evidence 代码没有进入产品运行时。当前是“审计能力重、产品和算法闭环轻”。
4. 缺少私有文件导致另一台电脑无法继续开发，不应通过把现有 private 文件原样提交 Git 来解决。正确方向是：公共代码和脱敏承诺进 Git，真实私有制品进入加密、带摘要、可恢复的跨电脑制品包，并由 capability doctor 自动说明缺什么。
5. 当前 `s1-source-evidence-authenticity-private-v0.1.json` 的门禁还存在真实性缺口：校验器检查该 JSON 自己声明的摘要和路径，但不重新读取 `reportPath`、`receiptPath` 对应文件并计算摘要。因此它既会阻断没有该 JSON 的正常新电脑，又不能单独证明底层四组证据真实存在。应先修门禁设计，不应手工拼一个“看起来通过”的文件。

建议立即停止继续扩建证据框架，只完成 PR #7 已授权的 B4–B7 最小收口；同时建立可移植私有制品方案。PR #7 收口后，开发资源应依次转向：工具链可复现、产品 fixture 隔离、历史代码退役、M2 当前算法核心、业务覆盖和 point-only serving 合同。

## 2. 审计边界与仓库状态

本轮做了全库文件、哈希重复、JavaScript import graph、产品入口、M2/M3/证据模块、Python 大函数、package scripts、CI、环境变量、私有路径和当前本地制品的静态审计，并对关键运行路径逐文件审读。它不是对约 21 万行可执行文本逐行证明正确性的形式化验证。

审计时状态：

| 项目 | 状态 |
|---|---|
| 当前分支 | `codex/m2-v2-evidence-pilot-v1` |
| HEAD / upstream | `856625f46f8477e9aac92e3ef14965c57dda134d`，0 ahead / 0 behind |
| 相对 `origin/main` | ahead 73 / behind 0 |
| PR | #7，Draft / Open / Clean，Linux、Windows CI 均成功 |
| worktree | 1 个 |
| 本轮前已有未提交修改 | 9 个 B4 入口文件；本审计未改写这些文件 |
| 本轮外部行为 | 未连接 provider、数据库或 Docker；未运行模型、Canary、holdout、B8、merge 或 release |

## 3. 全库规模与结构证据

### 3.1 文件与代码规模

| 范围 | 数量 |
|---|---:|
| Git tracked files | 1,713 |
| `docs/**` | 1,053 |
| `test/**` | 172 |
| `src/**` | 123 |
| `scripts/**` | 113 |
| `experiments/**` | 112 |
| `db/**` | 84 |
| Markdown | 608 |
| JSON | 487 |
| JavaScript | 285 files / 91,571 lines |
| MJS | 43 files / 17,818 lines |
| Python | 84 files / 93,104 lines |
| SQL | 179 files / 6,558 lines |
| PowerShell | 10 files / 2,240 lines |

M2 相关集中区更能说明失衡：

| 范围 | 文件 | 行数 |
|---|---:|---:|
| `scripts/m2-real-data/**` | 68 | 80,441 |
| `src/domain/m2V2EvidencePilot/**` | 38 | 31,965 |
| `scripts/m2-v2-evidence-pilot/**` | 31 | 11,692 |
| `docs/analysis/m2-real-data/**` | 364 | 100,982 |
| `docs/analysis/m2-v2/**` | 133 | 8,928 |
| `docs/technical-design/m2-v2/**` | 75 | 6,119 |

Python 算法和报告脚本中有 59 个函数超过 150 行，分布在 29 个文件。最大函数达到 536 行。最大单文件包括：

- `run_m2_calibration_v1_2.py`：4,643 行；
- `run_m2_calibration_baseline_replay.py`：4,173 行；
- `run_m2_c3_development_validation.py`：4,041 行；
- `run_m2_calibration_scoring_correction.py`：3,224 行；
- `public/admin/app.js`：3,210 行；
- `v2b2Runtime.js`：2,915 行；
- `v2b5Runtime.js`：2,541 行。

这不表示大文件必然错误，但当前文件同时承担数据读取、授权门禁、模型计算、证据生成、报告、隐私检查和 Git 状态验证，已经显著增加修改成本和回归面。

### 3.2 真正产品运行链路

从 `src/server.js` 做静态 import graph：

- `src` 下 111 个 JavaScript 模块；
- 产品入口可达 48 个；
- 产品入口不可达 63 个；
- 38 个 `m2V2EvidencePilot` 模块全部不在产品入口可达集合中；
- 19 个 `newProductEvaluation` 模块因为 M3 fixture API 被产品入口加载。

不可达不等于无用：很多文件是 CLI、离线 runner 或测试目标。但它证明 M2 v2 evidence 目前是独立研究/审计子系统，不是 serving 实现。

更严重的是：

- `src/http/app.js` 默认加载 M2 与 M3 fixture repository；
- `m2EvaluationTaskFixtureRepository.js`、`m2ExportFixtureRepository.js`、`m2BlockingReviewFixtureRepository.js` 直接从 `test/fixtures/**` 导入；
- M3 fixture API 位于正常 server router 中；
- 当前 `M1_APP_ENV` 只允许 `local/test/ci`，尚没有真正的 production 配置边界；
- 正式导出 repository 仍映射 base/optimistic/pessimistic 三情景字段，与已冻结的 point-only 正式输出不一致。

因此目前更接近“本地开发与演示服务器”，不能把 CI 通过解释为正式 serving 已完成。

## 4. 冗余代码与删除分级

### 4.1 第一批：可直接收敛

以下内容不承载当前算法或运行时权威，适合放入一个独立的 cleanup PR。执行前仍应跑引用扫描和全套验证。

| 对象 | 证据 | 建议 |
|---|---|---|
| `experiments/m1-flyway-candidate/migrations/*.sql` 80 个文件 | 与已经晋升到 `db/migrations/` 的 80 个文件逐字节相同；当前 package、CI、src、scripts、test、tools、db 无运行引用 | 保留正式 `db/migrations/`；删除候选 SQL、副本专用 runner/config；把候选验证报告和晋升摘要留在历史文档 |
| `docs/archive/v0.1` 下 8 个文件 | 与 `docs/prd/03`、`07`–`13` 逐字节相同，且 archive 路径无入站引用 | 保留 `docs/prd` 副本；删除 8 个 archive 重复文件，archive README 记录“内容由 Git history 和 PRD canonical path 保留” |
| package 重复命令别名 6 个 | 两组 apply/summary 各重复 1 个；五个 candidate-b validation 命令完全相同，可保留 1 个、删除 4 个 | 删除无独立语义的别名；历史文档命令改为 canonical 命令或标注 historical |
| `lint` 与 `build` 完全相同 | 都只运行 `tools/node/check-syntax.mjs` | 不删除命令名，但必须让两者承担不同职责：lint 做静态规则，build 做可运行产物/入口验证 |

哈希扫描共发现 88 个完全重复组、176 个文件；其中正好是 80 组 migration 副本和 8 组 PRD/archive 副本。

### 4.2 第二批：先建立 canonical 实现，再退役

以下内容不能直接删，因为测试、历史 replay 或当前 PR 合同仍引用；但应停止继续复制版本。

| 重复族 | 当前问题 | canonical 收敛方案 | 退役对象 |
|---|---|---|---|
| `pilotRuntime`、`canaryRuntime`、`v2b2Runtime`、`v2b4Runtime`、`v2b5Runtime`、`v2b6Runtime`、`v2b7Runtime`、`v2b8Runtime` | 同一 provider/cache/state/report 职责随批次复制 | 建立一个 current evidence runtime + route registry；历史 runner 只保留薄 replay adapter | PR #7 收口后将旧 runtime 标为 non-routable，逐批移到历史 replay 区 |
| relay/Tavily/extraction adapters | transport、extraction、retention 边界交叉 | 一个 transport interface、一个 extraction normalizer、一个 sink registry | 删除重复 dispatch、重复 env 读取和重复 receipt 构造 |
| S0/S1 preflight 与 validation runner | 大量结构相同，批次差异写进代码 | 一个 capability preflight engine + 声明式 manifest | S0/S1 wrapper 变成参数薄层 |
| C1/C2-R/C2-R.1/C2/C3 runner | 每轮复制数据装载、seal、Git gate、报告和私有 manifest 逻辑 | 冻结旧 runner；新建单一 `m2-current` 数据集、评分、split、gate、report API | 旧命令从默认开发入口和默认测试移出，只留 archive regression |
| 分类/标签、候选复核、workbook v2/v2.1/v2.3 | 多代脚本继续共存 | 固定一个 current workflow；旧版本只保留输入输出 schema 与转换器 | 删除旧 workbook builder、旧 apply runner 和旧 package 命令 |
| 根目录状态文档 | `AGENTS.md`、`NEXT-CODEX-INSTRUCTION.md`、current index 多处手工同步 | `AGENTS.md` 只放稳定规则；current state 用一个 machine JSON 生成 Markdown 和 NEXT 摘要 | 禁止继续手工复制完整状态快照 |

### 4.3 必须保留

以下内容不是“冗余代码清理”的目标：

- `db/migrations/**` 正式 forward-only migration；
- 当前 PR #7 明确列入 immutable binding 的合同、registry、current-state 和 restatement 文件；
- C1、C2-R、C2-R.1、C2、C3 的公开聚合结果、失败结论、seals 和历史审计材料；
- formal-cash target、null abstention、case universe 和 B4 comparator 身份；
- Git ignored private 原始/派生材料，在迁移验证前不得删除；
- 当前 `main` 与唯一活动开发分支。

保留历史证据不等于让历史 runner 继续成为当前入口。历史材料应是 immutable/non-routable，当前开发只能有一个 canonical route。

## 5. 运行效率与开发效率改进

### 5.1 P0：先消除重复执行和不可复现

1. 固定工具链：
   - Node 以 CI 的 24 为 canonical，而不是只写 `>=20`；
   - CPython 固定 3.13，合同允许 3.11–3.13；
   - 增加 `.python-version` 或等价声明；
   - 增加受控 Python dependency lock。当前 CI 明确安装 `numpy==2.5.1`、`pandas==3.0.3`、`openpyxl==3.1.5`，但仓库没有 `requirements.txt`、`pyproject.toml` 或 lock；
   - 所有测试和 runner 通过统一 Python launcher，不再有的走 bundled Python、有的直接寻找 PATH 中的 `python`。

2. 重构测试入口：
   - `package.json` 有 237 个 scripts；
   - `npm test` 命令长约 5,326 字符，显式列出 135 个路径；
   - 仓库有 146 个 `.test.js`，其中 13 个未在默认命令直接列出，个别靠其他测试间接 import；
   - `pretest` 还会先跑 8 个 S0 扩展测试；
   - CI 在 S1 isolated default chain 前后，再次单独执行很多已包含于 default chain 的测试。

   建议拆成：
   - `test:unit`：产品和纯领域单元测试；
   - `test:contract`：当前合同；
   - `test:archive`：历史 C1–C3/replay；
   - `test:e2e`；
   - `test:private`：显式 capability 才运行；
   - CI 每个平台只运行一次完整 isolated chain，重复 focused step只在失败诊断或未纳入主链时执行。

3. 建立 `doctor:dev` 和 `doctor:capability`：
   - 只验证普通代码开发需要的 Git、Node、npm、Python、Playwright；
   - DB、provider、PR7 private、M3 materials 分能力检查；
   - 普通 lint/test 不应因为某个阶段性 private receipt 缺失而阻断。

### 5.2 P1：产品运行时

1. 从产品启动图中移除对 `test/fixtures/**` 的依赖。fixture 数据应位于明确的 dev/test adapter，并由配置显式启用。
2. 将 `src/http/app.js` 拆为 system/M1、M2 formal、M2 fixture、M3 fixture router；默认 server 不挂载未授权的 M3 formal-like 路由。
3. `staticAdmin.js` 当前每个请求重新读取静态文件且返回 `no-store`。本地影响小，但可在进程启动时缓存三项静态资源，开发 watch 时再失效。
4. `m2EvaluationExportRepository.js` 的 release gate 每次请求顺序执行多次 count/group/status 查询。先用 `EXPLAIN (ANALYZE, BUFFERS)` 测量，再用一个 CTE/aggregate query 合并；在 3,053 部作品规模上不应过度优化，但应消除确定的往返。
5. `public/admin/app.js` 3,210 行，应按页面拆模块并复用列表、过滤、错误和 badge 渲染；目标主要是降低回归风险，不是追求框架迁移。

### 5.3 P1：算法运行效率

1. 新算法不得继续复制 4,000 行 runner。把以下职责拆成稳定模块：
   - authoritative input loader；
   - case matrix / as-of split；
   - formal-cash target；
   - B4 comparator；
   - metrics 与 work×origin bootstrap；
   - seals/gates；
   - private artifact writer；
   - public report generator。
2. 权威输入一次加载、一次规范化、一次构建 case matrix。不要在多个 candidate runner 中重复解析同一 NDJSON/JSON 和重复计算 B4。
3. 对 bootstrap、candidate search 和 per-work prediction 先 profile，再进行确定性并行。并行必须按 seed 和 work/origin block 固定结果，不能改变冻结抽样语义。
4. 把报表/Excel 生成从模型计算中剥离。模型核心输出稳定的中间 schema，Markdown/JSON/XLSX 只是 adapter。
5. 旧 C1–C3 只跑 archive regression；日常算法迭代只跑当前模型、B4 parity、target integrity、future perturbation 和关键切片。

## 6. 整体开发方向调整

### 6.1 当前算法事实

| 指标 | 当前值 | 解释 |
|---|---:|---|
| B4 formal-cash WAPE | 55.6485% | 最强冻结 comparator，不是合格发布模型 |
| C3-A formal-cash WAPE | 55.3945% | 绝对改善约 0.254 个百分点 |
| C3-A signed bias | +8.2739% | 总体 bias 可控，但分 horizon/高价值 gate 未全过 |
| full-library forecastable cash coverage | 73.9647% | 低于 90% 目标 |
| Top10 coverage | 75.9413% | 低于 90% 目标 |
| formal-cash model works | 824 / 3,053 | 业务覆盖比继续微调小公式更关键 |

### 6.2 推荐顺序

1. 完成 PR #7 B4–B7 的已授权最小修复，不再新增 evidence framework 版本和旁路。
2. 修复跨电脑制品与 preflight 设计，保证新电脑能恢复同一可信状态。
3. 将 fixture 与 formal runtime 分离，现行化 point-only API/DB/export 合同。
4. 冻结 C1–C3 为历史失败研究，不再修改这些版本文件；建立唯一的 `M2 current algorithm` 入口。
5. 下一轮算法研究先解决信息与覆盖：
   - cutoff-as-of 已承诺未来应收；
   - prospective external snapshots，而不是事后补历史；
   - 纯买断无承诺继续 null abstain；
   - dense、高价值、18/24 月和 intermittent/dormant 分层诊断。
6. 在同一 7,851 formal-cash case 和同一 B4 comparator 上，优先做受强约束的 tabular residual benchmark 与 hierarchical benchmark。只有稳定跨 origin、horizon、TopK 且 paired CI 通过，才考虑复杂模型。
7. final holdout 继续 sealed；M3 formal 继续不启动。

更详细的算法候选与门禁沿用：

- `docs/analysis/m2-v2/M2-v2-current-system-audit.md`
- `docs/analysis/m2-v2/M2-v2-algorithm-roadmap.md`

## 7. 本地后续开发所需材料清单

### 7.1 普通代码开发：不应需要 private 文件

新电脑完成以下条件后，应能进行普通代码、单元测试、文档和 synthetic fixture 开发：

- Git；
- Node.js 24 + npm；
- CPython 3.13；
- locked Python dependencies；
- Playwright Chromium（只在 E2E 时需要）；
- Windows symlink/Developer Mode 权限（只在相关跨平台文件系统测试时需要）；
- GitHub CLI 登录（只在查 PR、push/PR 操作时需要）。

普通开发不应要求 provider key、数据库、真实账单、S1 private receipt 或 M3 materials。

### 7.2 当前 PR #7 B4–B7：必须恢复

当前本机缺少：

`data/private-output/m2-v2-pr7-s1-remediation-badbf45/s1-source-evidence-authenticity-private-v0.1.json`

当前代码在本地运行 S1 doctor 时要求它；CI 在满足严格 GitHub 环境条件时允许只依赖 tracked manifest。

不要手工填写该文件。应从生成它的原电脑恢复一整个真实性包，并保持 receipt 中记录的 repository-relative path。完整包至少应包含：

1. 上述 S1 authenticity receipt；
2. receipt 引用的 4 个 report 文件；
3. receipt 引用的 4 个原始 receipt 文件；
4. 一个内部 manifest，记录每个文件的字节数和 SHA-256；
5. 加密包外层 SHA-256。

四个 source identity 及已公开冻结的 binding：

| sourceId | report SHA-256 | receipt digest |
|---|---|---|
| `independentReview` | `e5ceba89d1b1fdd573f4f8296636ab9fb9c297eae7f28c8bd1c023abb2bfcc13` | `3a7d922b57d31547b2d6d646e186c42cc6b98c494d27922bb917af53f38febde` |
| `planning` | `2fc541e023e000901c7d55222b0d947ccc856835060fcf317a5fb604f01dc6f7` | `cf9d420ba667038f9a9f672f9ba8f75eca0ca667204bda886a97e268fbca479f` |
| `supportAudit` | `f79d625d695250230e11a2788637b6298daac86c456297c1ae4da769e25f0cd6` | `8d7e95e7ab88b56e0ea1bb6698e52887041ea7fecd9ce2167de30d7d2c11d872` |
| `s0Implementation` | `9c97aa423dd2297abedbcd9157d39a2cfb063f29e96fed8c9adaba63436bc51a` | `a63152d9656e365383476eb27fd4f714dbd7cccae73c052e324de62c5ebd35cc` |

S1 receipt 的 schema、字段和 digest 以以下 tracked 文件为准：

- `config/m2-v2-pr7-s1-task.v0.1.json`
- `config/m2-v2-pr7-s1-command-registry.v0.1.json`
- `scripts/m2-v2-evidence-pilot/m2_v2_pr7_s1_contract.mjs`

### 7.3 B6 离线重建：应一并迁移并验证

以下是历史/current private state 的能力角色，不应逐文件手工复制：

- `data/private-output/m2-v2-evidence-pilot/**`
- `data/private-output/m2-v2-integrity-remediation/**`
- `data/private-output/m2-v2-pr7-p1-remediation/**`
- `data/private-output/m2-v2-pr7-s1-remediation-badbf45/**`

当前电脑只有第一项的主要 evidence-pilot 内容；后三项的关键 binding/receipt 不完整。B6 前必须由 preflight 列出 exact required files，并从原电脑或已验证加密包恢复。缺失时应 `BLOCKED`，不能从公开报告反推或伪造 private receipt。

### 7.4 后续 M2 算法研究：权威输入角色

新一轮算法研究应优先从最小权威输入重建，不要依赖每一代历史中间结果。当前已知的核心本地角色：

| 角色 | 路径 | 当前本机 |
|---|---|---|
| 正式执行 payload | `data/private-output/m2-formal-execution/m2-formal-execution-payload-v1.json` | 有 |
| 权威收入事实 | `data/private-output/m2-formal-execution/m2-formal-income-facts-v1.ndjson` | 有 |
| 模型输入缓存 | `data/private-output/m2-formal-execution/m2-formal-model-input-cache-v1.pkl` | 有 |
| v1.1 cases | `data/private-output/m2-calibration-v1/M2-calibration-baseline-development-cases-private-v1.1.ndjson` | 有 |
| v1.1 manifest | `data/private-output/m2-calibration-v1/M2-calibration-baseline-development-manifest-private-v1.1.json` | 有 |
| v1.2 cases | `data/private-output/m2-calibration-v1-2/M2-calibration-v1.2-baseline-cases-private.ndjson` | 有 |
| v1.2 manifest | `data/private-output/m2-calibration-v1-2/M2-calibration-v1.2-baseline-manifest-private.json` | 有 |
| formal-cash comparator cases | `data/private-output/m2-formal-cash-comparator-v1/M2-formal-cash-comparator-cases-private-v1.ndjson` | 有 |
| formal-cash comparator manifest | `data/private-output/m2-formal-cash-comparator-v1/M2-formal-cash-comparator-manifest-private-v1.json` | 有 |
| C2-R.1 cases/manifest | `data/private-output/m2-c2r1-v1/` 下两个冻结 development 文件 | 有 |
| C2 cases/manifest | `data/private-output/m2-c2-v1/` 下两个冻结 development 文件 | 有 |
| C3 cases/manifest | `data/private-output/m2-c3-v1/` 下两个冻结 development 文件 | 缺失；C3 已完成且禁止重跑，不构成当前开发前置 |

上述“有/缺失”只描述当前电脑，不代表授权运行。下一轮算法研究仍需新的明确授权和新的 canonical output root。

### 7.5 M3：现在不准备也不阻断 M2

M3 formal 未授权。以后进入 M3 private completion 时才需要：

- `data/private-input/m3-material-dry-run/` 下 3–5 组 private materials；
- 可接受主文件扩展名：doc/docx/pdf/pptx/jpg/jpeg/png/txt/md/xlsx；
- 同 stem 的 txt/md 可作 companion transcript；
- 输出到 `data/private-output/m3-dry-run/**`；
- apply filled pack 需另行授权。

当前电脑没有该输入目录和 completion pack；这不应阻断 M2 或普通代码开发。

### 7.6 阶段性工具

| 能力 | 额外工具/配置 | 是否当前需要 |
|---|---|---|
| 普通开发 | Git、Node 24、Python 3.13、npm ci | 是 |
| E2E | Playwright Chromium | 验证时 |
| PR/GitHub | GitHub CLI 登录 | push/PR 时 |
| 私有包迁移 | 7-Zip、PowerShell、独立保存的 recovery key | 恢复 private state 时 |
| 本地 DB | Docker Desktop、PostgreSQL 16 client、Flyway 10.21、`.env.local` 本地凭据 | 当前 B4 禁止；以后获授权才需要 |
| provider | provider keys、allowlist 和治理批准 | 当前禁止 |
| M3 materials | 3–5 组本地材料 | 当前不需要 |

## 8. 多电脑协同的正确设计

### 8.1 为什么不能直接把现有 private 文件提交 Git

即使文件名只是 receipt，也可能包含内部路径、时间、来源身份、制品关系或可关联摘要。更重要的是，把一份旧电脑生成的自我声明复制进 Git，不等于另一台电脑重新验证了底层证据。

允许进入 Git 的应是重新设计后的 public commitment，例如：

- artifact role ID；
- schema/version；
- 适用 commit 和 capability；
- public/non-sensitive digest commitment；
- encrypted bundle ID；
- restore/verify command；
- 缺失时的明确降级行为。

不能只是把 `privateOnly=true` 改名后提交。

### 8.2 现有迁移能力与缺口

仓库已有：

- `docs/analysis/m2-v2/M2-v2-cross-device-private-state-migration-v0.1.md`
- `build_m2_v2_private_state_migration.ps1`
- `verify_m2_v2_private_state_migration.ps1`
- `restore_m2_v2_private_state_migration.ps1`

它们使用 AES-256 7z、header encryption、内部 manifest、逐文件 SHA-256 和恢复前验证，方向正确。

当前缺口：

1. 只覆盖 `data/private-output/m2-v2-evidence-pilot/**`，不覆盖 PR7 S1、integrity、算法或 M3 capability；
2. 文档说“7 个 provider 变量”，脚本 allowlist 实际已扩展到更多变量，说明文档与代码漂移；
3. 构建器要求 provider key，不适合 provider-forbidden 的 PR7 离线开发；
4. 没有 capability catalog；
5. 没有新电脑一条命令 doctor/bootstrap；
6. S1 preflight 在本地和 CI 使用两种真实性语义；
7. 当前 S1 receipt 校验没有重新读取底层 report/receipt 字节。

### 8.3 推荐实现

建立声明式 `private-artifact-catalog`，按能力拆包：

- `core-dev`：无 private；
- `m2-pr7-s1`：S1 authenticity package；
- `m2-v2-current-state`：evidence + integrity + recovery binding；
- `m2-algorithm-authoritative-input`：formal execution facts/cache；
- `m2-local-db`：只记录配置要求，不迁移密码或数据库；
- `m3-private-materials`：独立包，默认不恢复。

每个包：

1. 内部 manifest 记录 exact path、size、SHA-256、schema、source commit；
2. AES-256 header-encrypted；
3. archive 和 recovery key 分开传输；
4. 外层 digest 可进入 Git；包本身放在受控私有对象存储、加密移动介质或私有 Release asset，不进入普通 Git object；
5. restore 使用 staging + verify + atomic promote；
6. 任何缺失只阻断对应 capability；
7. `doctor` 输出中文缺失清单和恢复命令；
8. S1 等真实性门禁直接重算底层文件，或验证受信签名；不接受只有字段声明的 receipt。

建议命令接口：

```text
npm run doctor:dev
npm run doctor:capability -- m2-pr7-s1
npm run private:bundle -- m2-pr7-s1
npm run private:restore -- m2-pr7-s1 --archive <outside-repo-path>
npm run private:verify -- m2-pr7-s1
```

## 9. 建议实施顺序

### P0：现在

1. 不手工伪造 S1 receipt；从原电脑恢复 authenticity package。
2. 修复 S1 validator，使它重新读取并校验 4 组 report/receipt，或改用可信签名。
3. 扩展现有 AES-256 私有迁移工具为 capability package，先覆盖 PR7 S1。
4. 完成已授权 B4–B7，禁止新增 evidence runtime/provider/adapter 版本。

### P1：PR #7 收口后的第一个 cleanup PR

1. 删除 80 个 candidate migration 副本和 8 个 archive/PRD 重复文件。
2. 删除 6 个 package 重复别名。
3. 固定 Node/Python/Python dependencies。
4. 将 CI 测试分层并移除重复执行。
5. 将 fixture repository 从产品默认入口隔离。

### P2：M2 current algorithm PR

1. 建一个 canonical input/scoring/gate/report core。
2. 冻结 C1–C3 runner 为 archive-only。
3. 先做业务覆盖和现有失败切片诊断，再做 tabular residual/hierarchical benchmark。
4. 现行化 point-only DB/API/export。
5. 达到预注册开发 gate 后，才申请业务抽检和 final holdout。

## 10. 删除门禁

任何批量删除前必须同时满足：

- 引用扫描为 0，或调用方已经迁移；
- canonical successor 已写明；
- 历史 replay 仍可从 Git commit/tag 获取；
- private state 已完成加密备份和恢复演练；
- `check:no-real-data`、lint、build、unit/contract/archive tests、smoke 按改动范围通过；
- PR #7 immutable artifacts 不在删除范围；
- 不把 cleanup 与算法修改或业务产物混在同一提交。

本报告只给出删除和重构决策，不执行删除，不改变授权门禁，也不把当前任何 development 结果表述为正式发布结果。
