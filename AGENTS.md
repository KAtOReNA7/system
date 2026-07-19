# Codex 工作规则

## 2026-07-19 PR #7 S1 分层修复入口（当前最高优先）

- 7 项 S0 开发支持基线已在 exact HEAD `badbf453e1e99ba87cc3064601e480a09ff1b149` 完成并通过 Linux/Windows CI；`supportSharpeningStopCriteriaReached=true`。
- 用户已单独授权在 `codex/m2-v2-evidence-pilot-v1` 上实施 PR #7 的 B0–B7 分层 S1 修复；B1 已在 exact remote HEAD `66eecbc57c4186ad61df8152ef38b5f28300f130` 完成，CI run `29692415607` 的 Linux job `88207352223` 与 Windows job `88207352209` 均成功；当前 batch 为 `B2`。每个 batch 必须普通 push，并在该 exact remote HEAD 的 Linux/Windows CI 成功后才能进入下一 batch。
- open-finding 状态以 `docs/analysis/m2-v2/M2-v2-PR7-open-findings-status-v0.1.md` 为增量 overlay：5 个 P1 与 5 个直接耦合 P2 当前仍全部 `OPEN`。B0–B7 最多只能形成 `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`，不得由本代理执行 B8 或声明 `CLOSED`。
- 本轮允许按附件冻结的范围修改 `src/domain/m2V2EvidencePilot/**`、配套测试、合同、CI 与公开治理文档，并在 B6 进行 provider-free 离线重建和原子 supersession；历史/private immutable 产物不得覆盖。
- 禁止 provider、数据库、Canary/full160、模型训练、holdout、B8、mark ready、PR merge 或 release。`currentDecision=CANARY_FAIL`、`mergeAuthorized=false`、`full160Authorized=false`、`modelTrainingAuthorized=false`、`nextDevelopmentReadiness=NOT_AUTHORIZED` 保持不变，除非 B6 的版本化离线重算真实得出不同 current decision；即便变化也不自动授权下游阶段。
- 禁止 rebase、squash、amend、force push、`git add .`、`git add -A` 或触碰 stash。任一 source evidence 摘要不一致、remote drift、non-fast-forward、真实外部访问、新依赖需求、原生平台验证不可用、workbook 无确定性路径、private promotion 失败或 `providerRequestDelta != 0` 都必须立即停止并输出 `BLOCKED`。

## 2026-07-18 M2 v2 完整性修复入口（最高优先）

- V2-A 已完成；V2-B.1 至 V2-B.8 均是历史 checkpoint。V2-B.8 Canary v3.1 原始业务结论保持 `CANARY_CONDITIONAL`；修复合同的离线 restatement 当前结论为 `CANARY_FAIL`，`full160Authorized=false`。
- verifier 只读/幂等、receipt/cache/state/counter 原子绑定、B8 合同缺口修复、从既有 immutable/append-only 材料离线恢复 private derived state 以及完整性复审已经收口。public 结论以版本化 remediation summary 与 restatement 为准，审计细节以 Git ignored private audit v0.2 和 PR roundtrip receipt 为准。
- 禁止任何外部 provider 请求，禁止 Canary/run/resume/full160、模型训练、B4/formal-cash 修改、holdout、V2-C/V2-D、C4、M3 formal、release 或 PR merge。
- 当前导航以 `docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md` 为准。历史报告不得删除或静默覆盖，也不得作为新授权。
- `nextDevelopmentReadiness=NOT_AUTHORIZED`。必须停在 Draft/open/unmerged PR #7，等待用户安排外部审查；不得把修复完成解释为下一阶段授权。

## 当前模式

项目从 2026-06-22 起进入 **authorized local real-data development mode**。

本地开发允许：

- 读取用户提供的本地真实数据，包括 `data/**`。
- 使用本地开发数据库和本地 Docker/PostgreSQL。
- 为本地开发新增或修改 `db/migrations/`。
- 在本地执行 migration、导入、严格对账、回测和算法校准。

本地真实数据开发结果不自动等于正式发布审批结果。

## 2026-07-17 M2 v2 历史入口（已被上方 2026-07-18 入口替代）

- C1、legacy C2-R、C2-R.1、C2、C3 均已完成 development 且结论为 `FAIL`；禁止重复进入 C3。
- C3-A overall WAPE 0.55394517、signed bias +0.08273913，`modelQualityDecision=FAIL`、`businessCoverageDecision=CONDITIONAL`；B4 继续作为 comparator/fallback，未获 release 批准。
- final holdout、embargo shadow、deferred 60-month labels 均 sealed；所有结果 `not_for_formal_decision`，未进入 C4 或 M3，未 release。
- M2 Forecast Intelligence v2 V2-A 架构合同已完成并进入 checkpoint：五头 PRD、字段字典、External Evidence、Human Baseline、API/DB/export、JSON Schema、traceability 和 manifest。
- V2-B 已按固定 seed 从 3053 部权威人口冻结 160 部 private immutable 样本；最终 manifest digest 为 `f85308436328bd056e27025407f45aa840cd5cc07e4e7ad9fe0eec4a2d8a3020`，全部预注册 effective target 达成。检索前 sampler aggregate QA 曾修正持续 stress bonus；旧 attempt 私下保留，修正前 provider dispatch/search result 均为 0，最终 manifest 禁止再次更换。
- 当前无授权 runtime provider 凭证且 source allowlist 没有经条款/法律批准的域名；V2-B 因而 fail-closed 为 `blocked_no_provider`：640 个计划 query、0 dispatch、0 result、0 page、0 evidence，resume 为 640/640 cache hit。17/17 安全/审计硬门通过，但 usability 未验证，结论 `PILOT_CONDITIONAL`、V2-C readiness=`NOT_READY`。
- 不得要求运营逐作品补外部信息。下一步只允许 provider/source governance 后在同一 manifest 上 resume；不得把 0 evidence 表述为没有外部信号，不得进入 V2-C/V2-D/C4/M3。
- V2-B private manifest、query log、receipt、evidence、review pack 与 cache 只能写入 Git 忽略的 `data/private-output/m2-v2-evidence-pilot/`，禁止提交。
- V2-B 公开证据见 `docs/analysis/m2-v2/M2-v2-evidence-pilot-summary-v0.1.md`、`M2-v2-evidence-pilot-gate-v0.1.json` 和 `M2-v2-evidence-pilot-next-step-v0.1.md`；所有结果仍 `not_for_formal_decision`，未训练模型、未改变 B4、未打开任何 seal、未 release。

## 当前项目状态快照

- 远端 `main` 已包含 M1/M2 本地开发 checkpoint：dual-source limited local staging、M2 v1.1 conditional forecastability、收入模式识别、货架/版权状态推断、rating-standard-v3 单一前台评级、风险/复核提示和自动运营建议主输出移除。
- M1 dual-source staging 是文件级本地 staging，不写正式主数据，不等于正式主数据验收完成。
- 用户已于 2026-07-13 明确拒绝 M2 v1.1 conditional 作为最终上线预测算法；该版本只能作为历史校准证据，不得 release，也不得作为 M3 输入。rating-standard-v3 仍是当前评级边界，但不改变预测算法被拒绝的事实。
- 2026-07-08 本地五源重清洗已完成：账单、数字版权台账、原创全库、原创全库2、授权汇总台账、授权关系仪表板合并后，作者、版权开始、版权到期三个核心字段已形成本地文件级 staging 候选。该候选覆盖 3053 个账单作品、9159 个核心字段，其中 8729 个字段为高置信直接通过，430 个字段为用户确认填写；仍未写正式主数据，private 输出不进入版本控制。
- 2026-07-09 状态类字段已完成本地文件级 staging：作品状态和音频版权状态覆盖 3053 个账单作品、6106 个状态字段；作品状态分布为已上架 2410、已下架 643；音频版权状态分布为版权有效 2238、无限期 487、版权已到期 328。该结果仍未写正式主数据。
- 2026-07-10 分类树和辅助标签口径已更新：历史三级分类新增先秦、汉、三国、南北朝、隋、唐、五代十国、宋、元、明、清、近代史；辅助标签新增国家组，仍与一级、二级、三级分类分开管理。
- 用户已完成分类与辅助标签人工核对：257 部人工分类和 51 部辅助标签核对均已应用到本地文件级 staging。3053 部作品分类路径全部有效，其中系统自动 2796 部、用户确认 257 部；正式主数据仍未写入。
- 用户已完成 19 条国家标签核对：采用 6 条、不采用 13 条；当前本地辅助标签结果覆盖 57 部作品、127 个标签赋值。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，不再进入当前人工补表；历史基础字段补表入口已废弃，禁止继续使用。
- 用户已完成并明确确认分类与标签最终基础大表，覆盖 3053 部作品，出版物 1195、网文 1858，分类与标签人工缺口为 0。private 明细不进入版本控制。
- 最终大表相对系统预填基线修正 836 部作品，固定 387 部作品、532 个辅助标签赋值；新增科普、教辅、诗歌和 11 个辅助标签已进入受控词表 `2026-07-10-user-confirmed-v2`。
- 用户已确认表中 2 个作者显示变化属于误操作；系统已恢复此前已收口作者值，未进入固定结果，也不会进入提交。当前没有作者人工待办，禁止据此重开全量作者补表。
- 2026-07-10 已完成 3054/3053 范围对账：1 个账单独有身份是已确认标准作品的历史分册，已在内存中归并；192872 行账单和收入金额全部保留，账单/基础表/评估范围均为 3053 部。
- 最终基础表重算后，收入模式为纯实销 2578、纯买断 287、买断+实销 183、unknown 5；前台评级为 S+ 38、S 117、A 84、B 358、C 152、D 356、E 1948，无意外回归。
- 按 Excel 底层完整金额精度重算，到期但仍有收入复核桶为 146，版权有效但收入稀疏复核桶为 92；用户已完成全部 238 条确认，系统已校验并应用，待确认数为 0。
- 逐作品 private 正式基础信息输入覆盖 3053 部并通过内容契约；当前作品状态为已上架 2298、已下架 755，音频版权状态为版权有效 2250、无限期 473、版权已到期 330。238 条用户决定全部通过，保留 139 条事实型复核提示。
- 2026-07-13 已在隔离本地 PostgreSQL 16 执行 Flyway `0071.020`，完成 3053 部正式基础信息版本、192872 条收入事实/projection、active mapping、3053 条 evaluation/input snapshot、task/audit 和 prepared export；严格对账全部通过，运营建议数为 0。
- v1.1 仍是 `CONDITIONAL PASS`：WAPE 0.6409、baseline 0.7043、coverage 0.5769、P0/P1/P2=0/0/473、可预测收入覆盖 0.7788、true blocked 收入占比 0.2038。算法仍 `is_formal=false`，export 仍 `prepared`，最终 release 未批准。
- 用户已拒绝上述 v1.1 conditional 和 prepared export；禁止后续 Codex 自动批准、release 或通过改写状态绕过该决定。
- 2026-07-15 `calibration-spec-v1.2-amendment` 已修正 baseline 身份和比较规则：faithful B0b 是旧 v1.1 Model E（A/B/C/D selector）的无泄漏、as-of、route-aware 重放；此前误称 B0b 的切换公式现命名为 `B4_formula_switched_legacy_variant`。B0a 仍只作历史审计，不能参与选择。
- v1.2 development replay 中每个 baseline 均为 18615 个 case，其中 statistically scoreable 12223、覆盖 1044/3053 部作品；所有 scoreable case 均保留 raw prediction，abstained 的 served prediction 为 null，`zeroImputationUsed=false`。
- v1.2 all-scoreable WAPE / signed bias 为：faithful B0b 1.6996 / +1.1024，B1 1.9022 / +1.4794，B2 1.8640 / +1.4497，B3 1.6995 / +1.2348，B4 1.6666 / +1.1961；所有 baseline 均未通过最终候选 bias gate。
- practical-equivalence 已由旧 OR 规则改为四项严格 AND：WAPE 相对差绝对值不超过 1%、paired work×origin block-bootstrap 95% CI 完整落在 [-1%, +1%]、signed bias 差不超过 2 个百分点、top10 与各核心 horizon 回退不超过 2%。按该规则仅 B4 与经验 leader 等价，primary performance comparator 锁定为 B4；B1、B3 与 faithful B0b 继续组成固定 comparator bundle。
- 完整人口报告以 3053 部作品和 192872 条权威收入事实为范围，以截至 2026-04 的 192869 条完整月事实计算非重叠全库收入覆盖：scoreable 1044 部、历史 unscoreable 2009 部；小样本继续互补抑制，完整总量分母不抑制。
- v1.2 重放已证明 B0b/B1/B2/B3/B4 全部经同一 `predict_as_of` 入口重新 materialize，旧 checkpoint numeric point 只作锁后审计对账；case-key/actual/scoreable/raw prediction parity、future perturbation invariance、scoreable/served/abstention 契约与逐 fold prediction lock 均通过。公开 JSON/Markdown 不含作品或渠道标识、private 路径、原始行或 PI endpoints；scoreable/served 互补作品数小于 10 时，served 精确数量与收入覆盖做互补抑制。
- Phase A comparator checkpoint `879fbd0a951ce6d465082321b38f965b14815935` 已正常 push；推送后的独立 runtime receipt 已复跑全套验证、核对真实远端 SHA 并重新计算 Gate A，全部条件为 true。该收据保持 Git 忽略且只授权本次 C1 development。
- C1 transparent ensemble development 已按冻结的 8 个组件、148 个候选、nested expanding-origin 和 B4 primary comparator 完成。每个 outer origin 的 bias-feasible candidate 均为 0；前两个 origin 因 earlier-origin 证据不足使用预注册 fallback，后三个 origin 因没有 bias-feasible candidate 使用同一 fallback，未移动候选空间或阈值。
- C1 在相同 18615/12223 case universe 上的 all-scoreable WAPE / signed bias 为 3.8502 / +3.5114，高价值 WAPE / bias 为 2.9538 / +2.7188，内部 80% coverage 为 0.8302；相对 B4 overall WAPE 回退 131.02%，paired work×origin bootstrap 相对差 95% CI 为 [0.0531, 4.5434]。19 项验收仅 coverage、P0=0、P1=0、P2 事实边界和无自动运营动作 5 项通过，结论明确为 `FAIL`。
- C1 的 case-key/actual/state parity、raw/served/abstention、同一 `predict_as_of`、prediction lock、future perturbation、C1 自有 earlier-residual 区间和脱敏产物契约均通过；失败是模型质量失败，不是泄漏或计分失败。后续 legacy-target C2-R、formal-cash C2-R.1、C2 和 C3 均已完成且结论 `FAIL`；C3-A overall WAPE 0.55394517、signed bias +0.08273913。final holdout、embargo shadow 和 deferred 60-month labels 均未打开，所有结果保持 `not_for_formal_decision`。
- 当前 3053 部基础信息、分类标签、状态、238 条业务决定和 192872 条收入事实是后续 M2 最终上线算法的权威输入。不得退回旧补表、旧 3054 口径或较早 private candidate 覆盖该版本。
- M2 正式输出不再包含自动运营建议或资源投入动作；只允许风险和事实型复核提示。历史 fixture/prototype 建议字段不得进入当前正式结果、页面或导出。
- 146 个到期仍有收入样本和 92 个版权有效但收入稀疏样本已经完成中文 private 确认、校验和应用；不得依据旧报告重新生成这些人工待办。
- `data/private-output/**` 中的 private Excel/CSV/JSON 只供本地查看和用户填写，禁止提交。
- 当前 `main` 保留 M3 parallel planning 边界、实施方案摘要与非正式 fixture/prototype 测试能力；不代表 M3 formal execution 已开始，也不包含正式 M3 发布能力。
- 当前未进入 M3 formal execution；用户已明确暂缓 3 至 5 份代表性选题材料，待 M2 两类复核和正式链路彻底收口后再准备。M3 formal execution 仍需后续单独明确授权。

## M2 正式现金目标校正（2026-07-15）

- 用户已冻结 M2 正式预测对象为未来账单现金：未来实销现金，加 cutoff 时已签署/确认且可审计的未来买断应收或其他已确认现金。未承诺未来买断、历史周期推测、概率乘金额、已到账买断摊销和 `buyoutMonthlyEquivalent` 均不得进入正式现金预测。
- `buyoutMonthlyEquivalent` 只保留为历史价值和评级上下文，必须同时标记 `ratingContextOnly=true`、`historicalValueOnly=true`、`notCashForecast=true`、`notIncludedInFutureCashRevenue=true`。
- 当前 3053 部/192872 条权威输入和 replay adapter 没有独立、可审计的 `cash_commitment_snapshots` as-of 数据角色。因此历史后来发生的买断不得回填成 cutoff 已承诺；纯买断无 cutoff 承诺时必须 route abstain，raw/served/future cash forecast 均为 null，禁止用 0 或月均等效值冒充预测。
- formal-cash target correction 保持冻结的 18615/12223 development case universe、scoreability、business eligibility 和所有 seals 不变。scoreable 重叠 case-window 聚合为：`forecastableCashActual=82206415.70`、`uncommittedBuyoutSurpriseActual=5517115.15`、`totalLedgerCashActual=87723530.85`；466 个 case window 有正 surprise，占 total ledger cash 0.06289208。三套 actual 逐 case 和聚合守恒。
- 旧目标到新目标桥接确认：旧目标 actual 为 80351261.34；pure-buyout case 改用正式现金口径后加入 2571419.36 forecastable cash，并移除 716265.00 legacy pure-buyout target，新减旧为 1855154.36。legacy-target C2-R 已完成但结论为 `FAIL`；旧结果只能作为历史目标口径证据，不能改称 formal-cash 指标，也不能在新目标 replay 前与 C2-R.1 直接比较。
- `calibration-spec-c2r-v1.1-amendment`、正式现金内核、as-of 审计、三套 actual、桥接和自动测试已建立。formal-cash B0b/B1/B3/B4 replay 在共同 7851-case 模型人口上冻结 B4 为 primary；Gate B 在 Phase A checkpoint push 后 14/14 通过。C2-R.1、C2 与 C3 均已执行且 `FAIL`；全库/Top10 forecastable cash coverage 0.73964685/0.75941253，业务覆盖结论 `CONDITIONAL`。final holdout、embargo shadow、deferred 60-month labels 仍 sealed，状态保持 `not_for_formal_decision`，未 release，未进入 C4/M3。

证据文件：

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

## M2 后续补全信息提醒

任何 M3 设计、实现或评估前，必须先提醒用户：M2 隔离本地正式执行已完成，旧 v1.1 conditional 已被用户拒绝；C1、legacy C2-R、C2-R.1、C2 和 C3 development 均明确 FAIL，业务覆盖为 CONDITIONAL。legacy C2-R 不具备 formal-cash 指标资格；业务抽检、final holdout、正式验收和 release 均未完成，当前只授权 V2-B evidence pilot，不授权 M3。

| 数据项 | 当前缺口/状态 | 影响 |
|---|---:|---|
| 作者 | 缺口 0；已写入隔离本地 active 正式基础信息版本 | 不再生成作者补表 |
| 版权开始 | 缺口 0；已写入 active 正式基础信息版本与 input snapshot | 不再进入分类与标签核对表 |
| 版权到期 | 缺口 0；受控期限语义已由 `0071.020` 保真持久化 | 不得改回 date-only 或静默置空 |
| 一级分类 | 出版物 1195、网文 1858；人工缺口 0 | 已写入隔离本地 active 分类版本 |
| 二级分类 | 3053 部均已固定；人工缺口 0 | 已写入隔离本地 active 分类版本 |
| 三级分类 | 3053 部均已固定；新增科普、教辅、诗歌已进入受控词表 | 已写入隔离本地 active 分类版本 |
| 辅助标签 | 387 部作品、532 个标签赋值已固定；人工缺口 0 | 已写入隔离本地正式基础信息关联 |
| 特殊属性标签 | 当前 M1/M2 人工收口不启用独立字段；只有后续明确新增规则和版本时才单独治理 | 不阻断本轮分类与标签人工收口 |
| 作品状态 | 已上架 2298、已下架 755；已写入隔离本地 active 正式基础信息版本 | 可支撑 DB-backed M2 评估 |
| 音频版权状态 | 版权有效 2250、无限期 473、版权已到期 330；期限/状态冲突 0 | 已写入隔离本地 active 正式基础信息版本 |
| 到期但仍有收入样本 | 146 条已全部确认并应用，待确认 0 | 保留事实型审计/复核提示，不再构成人工数据阻断 |
| 版权有效但收入稀疏样本 | 92 条已全部确认并应用，待确认 0 | 状态决定已进入 private 输入候选，不再构成人工数据阻断 |

证据文件：

- `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
- `docs/analysis/m2-real-data/M2-classification-aux-tag-local-staging-summary-v1.md`
- `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
- `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
- `docs/analysis/m2-real-data/M2-formal-local-execution-summary-v1.md`
- `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`

早期 master-data/copyright gap 报告只用于历史追溯，不得据此重新生成当前人工任务。

## M3 当前门禁

- 本地和远端 M3 状态必须先确认 clean：`HEAD` 应等于 `origin/main`，工作区不能有非本轮变更。
- 当前允许准备 M3 开发计划、字段清单、接口依赖、fixture/prototype 方案和测试计划。
- M2 隔离本地正式执行与严格对账已完成；旧 export 仅为 `prepared` 且已被用户拒绝。C1、legacy C2-R、C2-R.1、C2、C3 development 均为 FAIL；业务抽检、final holdout、明确批准和 release 前禁止进入 M3 formal execution。
- 禁止把 M2 local candidate、v1.1 conditional、rating-standard-v3/v4/v4.2 或 private 任务包当作 formal M3 输入。
- 禁止开放 M3 正式 task/export/write API；M2 正式 task/export/release/audit 已获授权，但只能在前置门禁通过后实施。
- 禁止退回较早分类候选覆盖用户最终固定基础表；当前未启用独立特殊属性标签字段，不得在没有新规则的情况下重新制造人工阻断。

## 禁止事项

- 禁止连接远端生产、共享、staging-like 或未明确授权的数据库。
- 禁止提交原始账单、台账、私有 Excel/CSV、候选包、临时数据库文件、数据库 dump 或敏感明细。
- 禁止打印或提交 `.env`、`.pgpass`、密钥、连接串密码。
- 禁止 `git add .`。
- 禁止触碰 stash，包含清理、应用、删除或改写 stash。
- 禁止把本地真实数据开发候选、v1.1 conditional、rating-standard-v3 或 private 任务包表述为最终正式发布审批结果。

## 提交规则

- 所有提交必须显式路径，禁止使用隐式批量添加。
- 技术线与运营线产物不得混提交。
- 工作区有非本轮文件时，必须报告；提交前必须确认范围，不能混入无关文件。

## 验证规则

修改代码后必须运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
```

如只改文档，也至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
```

任何失败不得伪造通过，必须如实报告失败命令、失败原因和未验证项。
# M3 Private Completion Pack Recovery Rule

M3 private field completion packs are ignored local output and must not be committed. README/AGENTS must not record machine-specific absolute paths or promise that ignored private artifacts exist on every computer. To restore the workflow after cloning or pulling on a new machine, use:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

The bootstrap reads only from the Git-ignored private input role and writes only to the Git-ignored private output role. It requires 3 to 5 private materials. If the private input is missing or incomplete, it must stop and tell the user to provide materials; it must not fabricate private material or completion fields.

Do not commit private input, private output, completion packs, original Word/PDF/PPT/image/spreadsheet materials, true titles, authors, material text, webpage full text, database credentials, `.env`, `.pgpass`, dumps or temporary database files. Applying a filled pack with `npm run m3:field-completion-apply` requires separate user authorization and is not M3 formal execution.
