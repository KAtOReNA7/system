# 有声书产品收入评估与年度目标系统 PRD v0.2

## 2026-07-24 PR #7 当前执行状态

用户已授权 B5–B8。B5 已在 exact HEAD `8804cd508f8e30d90dfc6f429e0b49ab6cae647c` 通过双平台 CI；B6 已完成本地 provider-free 离线重建、确定性 workbook vNext、14-role 原子 supersession 和幂等 no-op 证明，当前等待 B6 exact-head 双平台 CI。随后依次进入 B7 全注册表回归和 B8 独立复审。B8 必须由独立 reviewer 执行，实施代理不得自审并关闭 finding。

当前 10 个 finding 仍全部 `OPEN`，PR #7 仍为 Draft/open/unmerged。provider、数据库、Canary/full160、模型训练、holdout、mark ready、merge、release 和 M3 formal 仍未授权。

## 2026-07-23 全库审读与多电脑协同入口（v0.2 当前入口）

全库结构、冗余代码、运行/开发效率、M2 算法方向和多电脑 private state 的当前审计见：

- `docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.2.md`

v0.2 保留 v0.1 作为历史输入，并纠正两项会影响后续执行的旧结论：

1. 当前 S1 validator 会重新读取 `reportPath`、`receiptPath`，重算 report SHA-256 和 canonical receipt digest；它不是只信任 receipt 自我声明。
2. private artifact 的“本机存在/缺失”是运行时库存状态，不应写成仓库长期事实；核心开发必须始终与 private capability 解耦。

审计结论不是批量删除授权。PR #7 收口前，只允许处理当前已授权批次、修复跨电脑制品恢复和准备后续 cleanup；不得据此运行 provider、数据库、Canary/full160、模型训练、holdout、merge、release 或 M3 formal。B8 已由用户另行授权，但仅限独立 reviewer 执行。

新电脑的公开核心开发入口：

```bash
git pull --ff-only
npm ci
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
```

`doctor:dev` 不读取或要求任何 private 文件。只有需要某项受控能力时才运行：

```bash
npm run doctor:capability -- m2-pr7-s1
npm run doctor:capability -- m2-v2-current-state
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run doctor:capability -- m3-private-materials
```

能力目录由 `config/development-capability-catalog.v0.1.json` 声明。缺少 private artifact 只阻断所属能力，不得阻断普通代码、文档、公开测试或 fixture 本地启动；存在也只表示可进入 canonical validation，不表示真实性已验证或获得执行授权。

### 当前电脑能做什么

| 能力 | 当前状态 | 说明 |
|---|---|---|
| Git/代码/文档全库审读 | 可执行 | 可以继续做引用扫描、重复检测、调用图、文档和 synthetic fixture 工作 |
| `check:no-real-data`、lint、build、默认测试 | 可执行 | 本轮工作树验证通过；默认测试 1157/1157、0 skipped |
| 产品 runtime、测试和 CI 收敛设计 | 可准备 | 可以形成 patch/计划，但 PR #7 收口前不批量删除历史证据 |
| M2 权威算法输入盘点 | 按机器动态盘点 | 使用 capability doctor 只检查最小角色；运行新算法仍需另行授权 |
| PR #7 S1 本地 doctor/validation | 按机器动态盘点 | 先运行 capability doctor；只有原 S1 preflight 能作真实性判定 |
| provider、数据库、Canary/full160、训练、holdout、B8、merge/release | 禁止 | 缺文件不扩大业务授权 |
| M3 private/formal | 禁止 | private 材料按机器动态盘点；M3 formal 未授权 |

S1 capability 的受控 private role 为：

```text
data/private-output/m2-v2-pr7-s1-remediation-badbf45/s1-source-evidence-authenticity-private-v0.1.json
```

不得手工拼装该 JSON。当前 validator 会重新读取其引用的底层 report/receipt 并重算摘要；跨电脑恢复仍必须提供完整、可重新计算的 authenticity package，不能只复制单个 JSON。

### 缺少 private state 时，授权电脑需要提供什么

第一优先级是 `m2-pr7-s1` 加密包，至少包含：

1. `s1-source-evidence-authenticity-private-v0.1.json`；
2. 该 receipt 引用的 4 个 report；
3. 该 receipt 引用的 4 个原始 receipt；
4. 包内 manifest：逐文件 repository-relative path、size、SHA-256 和 source commit；
5. AES-256 header-encrypted archive；
6. archive 外层 SHA-256 sidecar；
7. 与 archive 分开传输的密码/recovery key。

四个 source identity 必须是 `independentReview`、`planning`、`supportAudit`、`s0Implementation`。冻结摘要以 `config/m2-v2-pr7-s1-task.v0.1.json` 为准，不能从公开摘要手工伪造 private evidence。

B6 前还要检查以下 private capability roots 是否完整；缺失时一并从原电脑通过独立加密包恢复：

```text
data/private-output/m2-v2-evidence-pilot/**
data/private-output/m2-v2-integrity-remediation/**
data/private-output/m2-v2-pr7-p1-remediation/**
data/private-output/m2-v2-pr7-s1-remediation-badbf45/**
```

不要提供或提交：

- provider API keys；
- `.env.local` 全量内容；
- 数据库密码或连接串；
- 原始账单、台账、作品明细、数据库 dump；
- 浏览器 Cookie、Authorization header；
- 未加密 private archive；
- Git stash 或 Git object。

当前工作是 provider-free、DB-free 的 PR #7 离线修复。现有 `build_m2_v2_private_state_migration.ps1` 只覆盖 `m2-v2-evidence-pilot/**`，不能被当作完整的 PR7 S1/B6 迁移包；应按审计文档把它扩展为 capability-based bundle 后再长期使用。

### 授权电脑同步后的执行顺序

在有 private state 的电脑上：

```powershell
git fetch origin --prune
git switch codex/m2-v2-evidence-pilot-v1
git pull --ff-only origin codex/m2-v2-evidence-pilot-v1
git status --short
npm ci
npm run check:no-real-data
npm run lint
npm run build
npm test
Get-Content -Encoding utf8 docs/analysis/m2-v2/M2-repository-code-convergence-and-portable-development-audit-v0.2.md
```

然后只读检查当前批次和 S1 private 前置：

```powershell
$task = Get-Content -Raw -Encoding utf8 config/m2-v2-pr7-s1-task.v0.1.json | ConvertFrom-Json
$head = git rev-parse HEAD
Test-Path data/private-output/m2-v2-pr7-s1-remediation-badbf45/s1-source-evidence-authenticity-private-v0.1.json
npm run m2:v2:pr7:s1:doctor -- --expected-head=$head --batch-id=$($task.currentBatch)
```

如果 doctor 因 source evidence 缺失或摘要不一致失败，应停止代码实施并准备上述加密包；不得修改 expected digest、降低门禁或制作自我声明式 receipt。doctor 通过也只证明对应批次前置满足，不自动授权下一批次或审计文档中的批量删除。

执行全库审读建议时按以下顺序：

1. capability catalog 与加密 bundle 的构建、恢复、验证已完成；S1 validator 保持当前重算语义；
2. B4 已完成候选收口；只有在每批获得新的明确启动指令后，才继续 PR #7 B5–B7；
3. PR #7 收口后建立独立 cleanup PR，处理完全重复 migration/docs/package aliases；
4. 再建立 M2 current algorithm canonical core，把 C1–C3 变为 archive-only；
5. 最后才申请新的算法训练、业务抽检和 holdout 授权。

## 2026-07-23 PR #7 S1 当前进度

- PR #7 的 B3 closing correction 已在 exact HEAD `a945ed3a22fbc86e8ca381db9124fc0927461ec7` 完成；CI run `29704510651` 的 Linux job `88239115427` 与 Windows job `88239115429` 均成功。
- 当前批次状态为：B0 `COMPLETE`，B1–B6 `COMPLETE_PENDING_B8`，B7 `REGRESSION_COMPLETE_PENDING_EXACT_HEAD_CI`。S1 task 的 `currentBatch=B7`、`nextBatch=B8`；B8 已获授权，但必须由独立 reviewer 执行。
- B3 已将 preflight、local validation 与 Linux/Windows CI 显式绑定到 `--batch-id=B3`；canonical gate 为 `npm run test:m2-v2:b3-safe-cache-provider`。B3 registry 21/21、canonical tests 35/35、default skips 0、provider/DB/external access 均为 0。
- B4 implementation exact HEAD `65bee39e012e013d4e4347076fc24757f7bcc9f9` 已通过 run `30021984333` 的 Linux job `89256777608` 与 Windows job `89256777664`；canonical gate 为 `npm run test:m2-v2:b4-event-tuple`，16/16 frozen cases、52/52 canonical tests、default skips 0、provider/DB/external access 均为 0。
- B6 exact HEAD `3e79ce654cd335129005d3916f25f5bf8a2bef7d` 已通过 run `30030360312` 的 Linux job `89285146244` 与 Windows job `89285146296`。B7 canonical gate 为 `npm run test:m2-v2:b7-full-regression`；本地 Windows 已通过 88/88 原生案例、161 tests、zero skip，等待 B7 exact-head 双平台 CI。
- `PR7-P1-008`、`PR7-P2-016`、`PR7-P1-009` 与 `PR7-P2-013` 仍为 `OPEN`，candidate status 为 `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`。全部 10 个 finding 仍等待独立 B8 review；不得声明 `CLOSED`。
- PR #7 必须继续保持 Draft/open/unmerged。`currentDecision=CANARY_FAIL`、`full160Authorized=false`、`modelTrainingAuthorized=false`、`mergeAuthorized=false`、`nextDevelopmentReadiness=NOT_AUTHORIZED` 保持不变。

## 2026-07-18 M2 v2 当前权威入口

- V2-A 架构合同已完成；V2-B.1 至 V2-B.8 均为保留的历史 checkpoint。V2-B.8 原始 Canary v3.1 结论仍为 `CANARY_CONDITIONAL`；修复后合同的离线 restatement 当前结论为 `CANARY_FAIL`，`full160Authorized=false`。
- verifier 只读/幂等、receipt/cache/state/counter 原子绑定、B8 fail-closed 合同缺口、private derived state 离线恢复与本轮全量验证已经完成。版本化结论见 `M2-v2-integrity-remediation-summary-v0.1`；100% 复审和 PR roundtrip 细节仅保存在 Git ignored private 审计角色中。
- 当前权威导航为 `docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md`。v0.1 index 与历史报告继续保留为 `historical / superseded / not authorization`，不能作为当前执行指令；原 V2-B.8 报告不得被静默覆盖。
- B4 未改变，继续仅作为 comparator/fallback，未 release；formal-cash target 与 pure-buyout null abstention 未改变；final holdout、embargo shadow、deferred labels 仍 sealed。
- PR #7 必须保持 Draft/open/unmerged，等待外部审查。V2-C、V2-D、C4、M3 formal、模型训练、Canary 重跑、full160、release 和 PR merge 均未授权；`nextDevelopmentReadiness=NOT_AUTHORIZED`。

**状态：M1/M2 本地真实数据开发 checkpoint**
**确认日期：2026-07-13**
**面向读者：运营、Codex、开发与测试**

## 本版本目的

v0.2 将 v0.1 的业务汇总稿改造成更适合 Codex 长期维护的文档结构：

- 每条正式规则只有一个权威定义位置；
- 使用稳定需求编号；
- 总体文档只摘要并引用专项规则；
- 冲突记录转为决策记录，不再永久充当最高优先级补丁；
- M1 需求与验收用例建立追踪关系；
- 真实数据分析后才能决定的内容继续保持待定。

## 当前工程进度提示

当前仓库处于 **authorized local real-data development mode**。允许读取用户提供的本地真实数据和 `data/**`，允许使用本地开发数据库、本地 Docker/PostgreSQL、本地 migration、真实数据导入、严格对账、回测和算法校准。仍禁止提交原始账单、台账、私有 Excel/CSV/JSON、`.env`、`.pgpass`、数据库 dump、临时数据库文件或敏感明细；仍禁止连接远端生产、共享、staging-like 或未明确授权的数据库。

### 2026-07-17 M2 v2 历史入口（已被上方 2026-07-18 入口替代）

- C1、legacy C2-R、C2-R.1、C2 和 C3 均已完成 development 且结论为 `FAIL`；不得重复进入 C3。
- B4 继续作为 formal-cash comparator、fallback 与安全锚点，但未获正式发布批准。
- final holdout、embargo shadow 和 deferred 60-month labels 仍 sealed；所有结果保持 `not_for_formal_decision`，未 release，未进入 M3。
- M2 Forecast Intelligence v2 的 V2-A 架构合同已完成：五头 PRD、字段字典、External Evidence Layer、Human Baseline、API/DB/export、JSON Schema 与 traceability 已统一。
- **V2-B External Evidence Pilot framework 与 fail-closed checkpoint 已完成**：从 3053 部冻结 160 部 immutable 样本，640 个计划 query、0 次外部派发、0 result/page/evidence；resume 640/640 cache hit，17/17 安全/审计硬门通过。
- `blocked_no_provider`、`PILOT_CONDITIONAL` 与“provider/source governance 后 resume”是 V2-B.1 的历史 checkpoint 记录，已被 B.2–B.8 和后续完整性修复 supersede，不构成当前 provider 或 resume 授权。当前只服从 current-state-index-v0.2；不得重抽样、要求运营逐作品补信息、调用 provider、训练模型或进入 V2-C/V2-D/C4/M3。

权威入口：`docs/prd/m2-v2/README.md`、`docs/technical-design/m2-v2/README.md`、`docs/analysis/m2-v2/M2-v2-evidence-pilot-summary-v0.1.md`、`docs/analysis/m2-v2/M2-v2-evidence-pilot-gate-v0.1.json`。

当前远端 `main` 已包含 M1/M2 本地开发 checkpoint：

- M1 dual-source 主数据补全链路已形成文件级 limited local staging apply 证据；该 staging 不写正式主数据，不等同于正式主数据验收。
- M2 candidate-b DB-backed import/reconciliation、review workflow 和本地 business closure 证据已完成；这些结果是授权本地开发证据，不是最终生产发布审批结果。
- candidate-b 系列预测模型已不再作为 M2 算法基线。用户已于 2026-07-13 明确拒绝将 disentangled forecastability v1.1 conditional 作为最终上线算法；该版本只保留为历史校准证据，不得 release，也不得作为 M3 输入。
- M2 评级/建议已推进到 rating-standard-v3：包含收入模式识别、货架/版权状态推断、单一前台评级、风险/复核提示，并移除自动运营建议主输出。private 任务包只保存在 Git 忽略区域，不会进入版本控制。
- 2026-07-08 本地五源重清洗已完成：账单、数字版权台账、原创全库、原创全库2、授权汇总台账、授权关系仪表板合并后，作者、版权开始、版权到期三个核心字段已形成本地文件级 staging 候选。该候选覆盖 3053 个账单作品、9159 个核心字段，其中 8729 个字段为高置信直接通过，430 个字段为用户确认填写；仍未写正式主数据，private 输出不进入版本控制。
- 2026-07-09 状态类字段已完成本地文件级 staging：作品状态和音频版权状态覆盖 3053 个账单作品、6106 个状态字段；作品状态分布为已上架 2410、已下架 643；音频版权状态分布为版权有效 2238、无限期 487、版权已到期 328。该结果仍未写正式主数据。
- 2026-07-10 分类树和辅助标签口径已更新：历史三级分类新增先秦、汉、三国、南北朝、隋、唐、五代十国、宋、元、明、清、近代史；辅助标签新增国家组，仍与一级、二级、三级分类分开管理。
- 用户已完成分类与辅助标签人工核对：257 部人工分类和 51 部辅助标签核对均已应用到本地文件级 staging。3053 部作品分类路径全部有效，其中系统自动 2796 部、用户确认 257 部；正式主数据仍未写入。
- 用户已完成 19 条国家标签核对：采用 6 条、不采用 13 条；当前本地辅助标签结果覆盖 57 部作品、127 个标签赋值。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，不再进入当前人工补表。历史基础字段补表入口已废弃。
- 2026-07-10 用户已完成并明确确认分类与标签最终基础大表。最终覆盖 3053 部作品，出版物 1195 部、网文 1858 部，分类路径和标签均有效，分类与标签人工缺口为 0。
- 最终大表相对系统预填基线修正 836 部作品；当前有 387 部作品包含 532 个辅助标签赋值。新增“科普、教辅、诗歌”三级分类及 11 个辅助标签已进入受控词表版本 `2026-07-10-user-confirmed-v2`。
- 用户已确认大表中的 2 个作者显示修改属于误操作；系统已恢复为此前已收口作者值，未进入固定结果，也不会进入提交。当前没有作者人工待办。
- 2026-07-10 已完成最终基础表接入后的 M2 重算：旧 3054 部口径中的 1 个历史分册身份已在内存中归并到已确认标准作品，192872 行账单和收入金额全部保留，账单/基础表/评估范围均统一为 3053 部。
- 重算后收入模式为纯实销 2578、纯买断 287、买断+实销 183、unknown 5；前台评级为 S+ 38、S 117、A 84、B 358、C 152、D 356、E 1948。相对旧 checkpoint 只减少被归并的 1 条纯实销/E 旧身份，没有模型规则回归。
- 按 PRD 的 Excel 底层完整金额精度重算后，到期但仍有收入复核桶为 146，版权有效但收入稀疏复核桶为 92。用户已完成全部 238 条确认，系统已校验并应用，形成 238 条审计事件、139 条事实型复核提示，待确认数为 0。
- 逐作品 private 正式基础信息输入已覆盖 3053 部作品并通过 schema、范围、必填字段、状态、复核决定、日期顺序和禁止运营建议字段的内容契约。当前作品状态为已上架 2298、已下架 755；音频版权状态为版权有效 2250、无限期 473、版权已到期 330；跨来源期限/当前权利状态冲突和到期早于开始均为 0。
- 2026-07-13 已在隔离本地 PostgreSQL 16 完成获授权的 M2 正式执行：Flyway schema `0071.020`、3053 部正式基础信息版本、192872 条收入事实及 projection、active mapping、3053 条 DB-backed evaluation/input snapshot、task/audit 和 3053 条 prepared export item 均已写入并严格对账通过。
- prepared export 当前仍未 released：预测候选 `m2-realdata-dev-disentangled-forecast-v1.1-conditional` 已被用户拒绝，算法继续保持 `is_formal=false`，评估结果保持 `not_for_formal_decision=true`，最终发布批准为 false。禁止把该 package 改为 approved/released。
- M2 正式口径已冻结为不输出自动运营建议或资源投入动作；只保留风险和事实型复核提示。正式导出不得包含运营建议字段。
- 当前 3053 部基础信息是用户能够提供的最终、最准确基础数据版本，后续最终上线预测算法必须以该版本和对应 192872 条收入事实为输入，不得退回旧补表或旧 3054 口径。
- 当前 M2 的隔离本地正式执行链已走到 prepared export，但 v1.1 已拒绝，最终 formal release 尚未完成。下一开发方向是基于已冻结基础数据校准并验证最终上线预测算法；本轮不直接开始开发。M3 formal execution 未获授权，3 至 5 份代表性选题材料继续暂缓。

## M2 后续补全信息提醒

在继续任何 M3 设计或实现前，必须先确认以下 M2 信息仍是后续补全项，不能把当前 M2 local candidate 当作 formal complete：

| 数据项 | 当前缺口/状态 | 对 M2/M3 的影响 |
|---|---:|---|
| 作者 | 缺口 0；已写入隔离本地 active 正式基础信息版本 | 非生产发布，不再生成作者补表 |
| 版权开始 | 人工缺口 0；已写入隔离本地 active 正式基础信息版本和 evaluation snapshot | 不再进入分类与标签核对表 |
| 版权到期 | 人工缺口 0；无限期/相对期限/仅年份/到期日未知语义由 `0071.020` 保真持久化 | 不再静默改为空日期，不再生成旧补表 |
| 一级分类 | 出版物 1195、网文 1858；人工缺口 0 | 已写入隔离本地 active 分类版本 |
| 二级分类 | 3053 部均已固定；人工缺口 0 | 已写入隔离本地 active 分类版本 |
| 三级分类 | 3053 部均已固定；新增科普、教辅、诗歌已进入受控词表 | 已写入隔离本地 active 分类版本 |
| 辅助标签 | 387 部作品、532 个标签赋值已固定；人工缺口 0 | 已写入隔离本地正式基础信息关联 |
| 特殊属性标签 | 当前 M1/M2 人工收口不再启用独立字段；后续只有在明确新增规则和版本时才单独治理 | 不阻断本轮分类与标签人工收口 |
| 作品状态 | 已上架 2298、已下架 755；已写入隔离本地 active 正式基础信息版本 | 可支撑当前 DB-backed M2 评估 |
| 音频版权状态 | 版权有效 2250、无限期 473、版权已到期 330；已写入隔离本地 active 正式基础信息版本 | 期限与当前状态分别保真，冲突计数 0 |
| 到期但仍有收入样本 | 146 条已全部确认并应用，待确认 0 | 保留事实型审计/复核提示，不再构成人工数据阻断 |
| 版权有效但收入稀疏样本 | 92 条已全部确认并应用，待确认 0 | 状态决定已进入 private 输入候选，不再构成人工数据阻断 |

当前状态证据见：

- `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
- `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
- `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
- `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`

早期 master-data/copyright gap 报告仅用于历史追溯，不再作为当前人工补表入口。

## M3 当前状态提醒

当前 `main` 的 M3 状态为：`prototype complete / user-deferred until M2 closure / formal blocked`。本地 fixture/synthetic 主链已覆盖 material-first、字段补全、readiness、外部证据结构、对标、作者排位、渠道点预测、候选评级、workflow 和 backtest anchor；不代表 M3 formal execution 已开始，也不包含正式 M3 发布能力。

M3 private 材料准备、dry-run 和 human acceptance 当前均按用户决定暂缓。M2 已完成隔离本地持久化、mapping activation、formal-evaluation run、task/audit 和 prepared export，但用户已拒绝当前 v1.1 conditional 算法与对应 release。新算法通过回测、业务抽检和 release gate 前，不得进入 M3 formal execution，不得开放正式 M3 task/export/write API。

截至 2026-07-13，作者、版权日期、作品状态、音频版权状态、分类、标签和 146/92 两类业务复核均已收口；隔离本地正式执行与严格对账已通过，DB-backed export 状态为 `prepared`。v1.1 已明确拒绝，下一步只推进基于最终基础数据的 M2 上线预测算法校准、回测和新一轮业务验收；M3 formal execution 仍未授权。

## 推荐阅读顺序

1. `docs/prd/README.md`
2. `docs/prd/00-governance/scope.md`
3. `docs/prd/00-governance/glossary.md`
4. `docs/prd/10-data-foundation/overview.md`
5. `docs/prd/10-data-foundation/bill-import.md`
6. `docs/prd/10-data-foundation/data-quality.md`
7. `docs/prd/10-data-foundation/work-master-data.md`
8. `docs/prd/70-acceptance/M1.md`
9. `docs/prd/00-governance/traceability.md`
10. `docs/technical-design/M2-next-stage-formalization-master-plan-v0.1.md`
11. `docs/analysis/m1-master-data/M1-dual-source-limited-staging-apply-result-v1.json`
12. `docs/analysis/m2-real-data/M2-disentangled-forecast-v1.1-validation.md`
13. `docs/analysis/m2-real-data/M2-rating-standard-v3-task-pack-summary.md`
14. `docs/analysis/m2-real-data/M2-revenue-model-business-rule-alignment-v1.md`
15. `docs/analysis/m2-real-data/M2-shelf-status-business-rule-alignment-v1.md`
16. `docs/analysis/m2-real-data/M2-front-rating-simplification-v1.md`
17. `docs/analysis/m2-real-data/M2-suggestion-removal-boundary-v1.md`
18. `docs/analysis/m2-real-data/M2-classification-aux-tag-local-staging-summary-v1.md`
19. `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
20. `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
21. `docs/analysis/m2-real-data/M2-post-foundation-readiness-rerun-v1.md`
22. `docs/analysis/m2-real-data/M2-post-foundation-formal-gap-audit-v1.md`
23. `docs/analysis/m2-real-data/M2-formal-local-execution-summary-v1.md`
24. `docs/analysis/m3/M3-next-execution-roadmap-v1.md`
25. `docs/analysis/m3/M3-local-prototype-closeout-v0.1.md`
26. `docs/analysis/m3/M3-formal-boundary-after-prototype-v0.1.md`
27. `docs/technical-design/M3-restart-development-plan-v0.1.md`（历史设计背景）
28. `AGENTS.md`
29. `NEXT-CODEX-INSTRUCTION.md`

## Latest M1/M2 checkpoint note

The current remote checkpoint is for local development continuity only. It includes sanitized aggregate reports, source code, scripts, tests, and package scripts for M1/M2 local validation. It intentionally excludes private workbooks, private JSON/CSV outputs, raw bills, raw ledgers, original library files, database dumps, environment files, and sensitive row-level details.

### 2026-07-15 M2 正式现金目标校正

M2 正式 point forecast 已冻结为未来账单现金：未来实销现金，加 cutoff 时已确认且可审计的未来应收。未承诺未来买断、历史周期推测、买断概率乘金额、已到账买断未来摊销及 `buyoutMonthlyEquivalent` 均不进入正式现金预测；买断月均等效值只用于历史价值和评级。

当前权威输入没有历史 cutoff commitment as-of 数据角色，因此后来发生的买断只能进入 `uncommittedBuyoutSurpriseActual`，不能事后恢复为已承诺。冻结 development universe 的 scoreable 重叠 case-window 聚合为：`forecastableCashActual=82206415.70`、`uncommittedBuyoutSurpriseActual=5517115.15`、`totalLedgerCashActual=87723530.85`。case key、eligibility 和所有 sealed labels 未改变。

legacy-target C2-R development 已完成但结论为 `FAIL`，其结果继续作为历史目标口径证据，不是 formal-cash 指标，也不得与 C2-R.1 直接比较；旧 development 写入口现已 fail-closed，只保留历史验证入口。2026-07-16 formal-cash comparator replay 已在 7851 个固定模型人口 case 上冻结 B4 为 primary，Gate B 经远端 checkpoint 后验证为 14/14；随后获授权的 C2-R.1 development 使用 45 个预冻结透明候选完成训练与验证，overall WAPE 0.5838、signed bias +2.93%，23 项验收通过 13 项，结论为 `FAIL`。C2 的 79 个候选、as-of 活跃度分层、generic residual、高价值保护和选择顺序已在 Phase A checkpoint 后由 Gate C 14/14 授权；development overall WAPE 0.55695480、signed bias +9.289130%。货币 reconciliation checkpoint 已将 0.01 元量化后的差额转换为整数分并要求精确为 0，原始 0.00000011 元浮点差仅作诊断；25 项验收通过数由 15 修正为 16，`modelQualityDecision=FAIL` 不变。全库/Top10 forecastable cash coverage 为 73.96%/75.94%，`businessCoverageDecision=CONDITIONAL`。C3-A 随后完成 development，overall WAPE 0.55394517、signed bias +8.273913%，模型质量 `FAIL`、业务覆盖 `CONDITIONAL`，组合结论仍为 `MODEL_FAIL_BUSINESS_COVERAGE_CONDITIONAL`。所有结果继续 `not_for_formal_decision`；final holdout、embargo shadow 和 deferred 60-month labels 仍 sealed，未 release，未进入 C4 或 M3。

正式现金口径证据：

- `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md`
- `src/domain/oldProductEvaluation/calibrationSpec.c2r.v1.1.amendment.json`
- `docs/analysis/m2-real-data/M2-C2R1-formal-cash-target-separation-v1.md`
- `docs/analysis/m2-real-data/M2-C2R1-buyout-commitment-as-of-audit-v1.md`
- `docs/analysis/m2-real-data/M2-C2R1-old-target-new-target-bridge-v1.md`
- `docs/analysis/m2-real-data/M2-C2R-legacy-target-supersession-v1.md`
- `docs/analysis/m2-real-data/M2-formal-cash-comparator-replay-v1.md`
- `docs/analysis/m2-real-data/M2-surprise-buyout-unique-impact-audit-v1.md`
- `docs/analysis/m2-real-data/M2-calibration-gate-b-v1.json`
- `docs/analysis/m2-real-data/M2-C2R1-development-validation-v1.md`
- `src/domain/oldProductEvaluation/calibrationSpec.c2.v1.amendment.json`
- `docs/analysis/m2-real-data/M2-calibration-gate-c-v1.json`
- `docs/analysis/m2-real-data/M2-C2-development-validation-v1.md`
- `docs/analysis/m2-real-data/M2-C2-model-quality-decision-v1.md`
- `docs/analysis/m2-real-data/M2-C2-business-coverage-decision-v1.md`

## M1 本地验证命令

当前 M1 应用和最小只读管理端使用 Node.js、原生 HTTP 服务和 PostgreSQL 驱动。

常规验证：

```bash
npm run lint
npm run build
npm test
npm run smoke
npm run check:no-real-data
```

管理端浏览器 E2E：

```bash
npm run test:e2e
```

E2E 使用 Playwright 启动本地临时 HTTP 服务和 Chromium 浏览器，仅访问 `/admin`、前端 fixture 和无数据库配置的降级态。首次在新机器运行前，如本地尚未安装 Playwright 浏览器，请执行：

```bash
npx playwright install chromium
```

CI/E2E 默认仍使用 fixture/no-DB 路径，不要求 GitHub Actions 访问真实数据。本地授权开发可另行读取真实数据、连接本地开发库、执行本地 migration 和回测脚本，但不得提交原始数据或敏感明细。

## CI 门禁

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，使用 Node.js 24 和 `npm ci`。

CI 当前执行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run test:e2e
```

CI 会在运行 E2E 前执行：

```bash
npx playwright install chromium
```

CI 显式将 `M1_APP_ENV` 设为 `ci`，并将 `M1_DATABASE_URL`、`M1_DATABASE_READONLY_URL`、`M1_DATABASE_BACKGROUND_URL` 保持为空。CI 不应连接数据库、不应读取或导入真实数据，也不应执行 mapping_version 激活。本地授权真实数据开发脚本必须保持可选运行，不能让 CI 依赖私有数据。

## 版本边界

- PRD v0.2 保留稳定业务语义、数据边界和验收框架；当前工程状态以最新脱敏 checkpoint、closeout 和 formal-boundary 证据为准。
- local candidate、private dry-run 和 fixture prototype 均不自动转为 formal approval。
- M2 本地正式持久化、审计和 prepared export 已实现；v1.1 conditional 已被用户拒绝，必须完成新算法校准和新一轮验收后才能重新申请 release，且任何本地执行都不代表生产部署或生产审批。
- v0.1 原文和早期 gap 报告仅用于历史追溯，不得重新作为当前人工待办入口。

# M2 PR #7 S1 private capability bundle

普通新电脑开发不需要任何 private 文件：

```bash
git pull --ff-only
npm ci
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
```

只有继续已授权的 `m2-pr7-s1` 离线批次时，才需要从授权电脑生成并恢复 capability-scoped encrypted bundle。该包固定包含 authenticity receipt、4 个 report 和 4 个原始 receipt，不包含 `.env.local`、provider key 或数据库凭据。

构建与恢复入口：

```powershell
npm run m2:v2:private-capability:build -- -BatchId <explicitly-authorized-batch> -OutputDirectory <outside-repository> -RecoveryKeyDirectory <separate-directory>
npm run m2:v2:private-capability:verify -- -ArchivePath <archive>
npm run m2:v2:private-capability:restore -- -ArchivePath <archive> -TargetRepoRoot <repository>
```

构建端和恢复端必须位于相同 exact HEAD 且 tracked worktree 干净。恢复后继续运行 capability doctor 和原 S1 canonical doctor；恢复成功不自动授权下一 batch。完整合同见 `docs/analysis/m2-v2/M2-v2-private-capability-bundle-v0.1.md`。

# M3 Private Completion Pack Recovery

After a new machine runs `git pull origin main`, ignored private materials and completion packs are intentionally absent. README/AGENTS never record machine-specific absolute paths and never promise that ignored artifacts exist on every computer.

Use this local recovery flow:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

Provide 3 to 5 private topic materials through the Git-ignored private input role before running the bootstrap command. Supported primary formats are `.doc`, `.docx`, `.pdf`, `.pptx`, `.jpg`, `.jpeg`, `.png`, `.txt`, `.md`, and `.xlsx`.

If no private input materials are present, the command stops with guidance and does not fabricate a completion pack. If private input materials are present, it regenerates the ignored local completion pack. Only the bootstrap code, format contract, safety tests and sanitized evidence are committed.

The private completion pack is not committed. After the user fills it, apply requires separate authorization and can be run with `npm run m3:field-completion-apply`. This remains local private execution, not M3 formal execution.
