# 全库代码收敛、效率与多电脑开发审计 v0.2

## 1. 决策结论

项目没有在业务目标上根本跑偏，但工程资源配置已经偏离最短交付路径：

- 正确部分：M1 权威输入、formal-cash 目标、as-of/no-leakage、null abstention、B4 comparator、seals 和 fail-closed 治理都应保留。
- 偏离部分：证据 runtime、版本化 runner、历史重放和报告层持续扩张，而当前产品入口、point-only serving、工具链复现和算法覆盖仍未收口。
- M2 算法方向没有“目标定义错误”；当前错误是把多个开发失败版本继续当作迭代主线。C1、C2-R、C2-R.1、C2、C3 应冻结为历史失败证据，B4 只保留为 comparator/fallback。
- 下一阶段不应直接升级复杂模型。应先建立唯一的 current algorithm core，修复权威输入/覆盖、产品 serving 合同和失败切片，再在同一 formal-cash universe 上比较受约束的 tabular residual 与 hierarchical benchmark。
- PR #7 当前仍是 Draft/open/unmerged，B3 为 `COMPLETE_CORRECTED_PENDING_B8`，`nextBatch=B4`。本轮审计和可移植性修改不是 B4 启动授权。

## 2. 审计基线

本轮在远端重新获取后冻结：

| 项目 | 状态 |
|---|---|
| 活动分支 / exact HEAD | `codex/m2-v2-evidence-pilot-v1` / `70399106fb1e778cc907b5bf612ecbfe2362d464` |
| upstream | 0 ahead / 0 behind |
| `origin/main` | `d81b952e37dd43365c0091cdd6665e69d8d39a7e` |
| 分支 / worktree | 本地与远端都仅 `main`、活动分支；1 个 worktree |
| PR #7 | Draft / open / unmerged / mergeable |
| PR 规模 | 74 commits，364 files，+82,670 / -581 |
| exact-head CI | run `30000891259`；Linux job `89185579474`、Windows job `89185579499` 均成功 |
| 禁止行为 | 未访问 provider、数据库、Canary/full160、训练、holdout、B8、merge、release 或 M3 formal |

PR #7 的 5 个 P1 和 5 个直接耦合 P2 仍为 `OPEN`；B0–B3 只能视为待独立审查的 candidate closure。`currentDecision=CANARY_FAIL`、`full160Authorized=false`、`modelTrainingAuthorized=false`、`mergeAuthorized=false`、`nextDevelopmentReadiness=NOT_AUTHORIZED` 不变。

## 3. 对 v0.1 的重要纠正

v0.1 是另一台电脑在旧 HEAD 和不同本地库存下形成的历史审计输入，不能作为当前运行状态。

1. v0.1 记录的 9 个未提交 B4 文件在当前 exact HEAD 工作树不存在；当前 B4 没有开始。
2. v0.1 关于 S1 authenticity validator “只信任 JSON 自我声明”的判断不成立。`check_m2_v2_pr7_s1_preflight.mjs` 会：
   - 解析 repository-relative `reportPath`、`receiptPath`；
   - 重新读取 report 字节并计算 SHA-256；
   - 重新读取 receipt 并计算 canonical receipt digest；
   - 将 actual/recomputed 值与冻结 expected binding 比较，失败即 fail-closed。
3. private role 在某台电脑上的存在/缺失是动态库存，不应写入 README/AGENTS 作为永久事实。本轮只确认 capability doctor 可盘点存在性；不读取、打印或提交 private 内容。
4. v0.1 的部分规模统计低估了当前范围。exact-head 基线有 1,714 个 tracked files；主要范围为：

| 范围 | 文件 | 文本行 |
|---|---:|---:|
| `scripts/m2-real-data/**` | 68 | 87,720 |
| `src/domain/m2V2EvidencePilot/**` | 38 | 33,931 |
| `scripts/m2-v2-evidence-pilot/**` | 31 | 12,473 |
| `docs/analysis/m2-real-data/**` | 364 | 102,443 |
| `docs/analysis/m2-v2/**` | 134 | 10,183 |
| `docs/technical-design/m2-v2/**` | 75 | 6,746 |

## 4. 全库失效、冗余和替代方案

### 4.1 可在 PR #7 后独立清理

| 对象 | 证据 | 处理 |
|---|---|---|
| 80 对 candidate/formal migration | `experiments/m1-flyway-candidate/migrations` 与 `db/migrations` 逐字节重复；当前运行引用为 0 | 保留 forward-only `db/migrations`，删除 candidate 副本和专用 runner/config；历史晋升报告保留 |
| 8 对 archive/PRD 文档 | 完全相同且 archive 副本无入站引用 | 保留 `docs/prd` canonical 文件，archive README 记录 Git 历史定位 |
| package aliases | 6 组无独立语义的完全重复命令 | 选择一个 canonical script；历史文档标记旧命令，不让 alias 长期参与默认入口 |
| `lint` / `build` | 当前完全相同 | 保留两个契约名，但 lint 承担静态规则，build 验证可运行入口/产物 |

哈希扫描合计 88 个完全重复组、176 个文件，恰好是上述 80 对 migration 和 8 对文档；没有证据支持现在删除其他非完全重复文件。

### 4.2 先建 successor，再退役

| 重复族 | 当前风险 | 更优方案 |
|---|---|---|
| 8 代 evidence runtimes，合计约 15,103 行 | provider/cache/state/report 边界按批次复制 | 一个 current runtime + route registry；历史版本变为 non-routable 薄 replay adapter |
| S0/S1 preflight/validation | 相同骨架继续复制 | 一个声明式 capability/preflight engine，S0/S1 只保留参数 wrapper |
| C1–C3 算法 runner | 装载、case、score、seal、report 重复；大文件最高 4,643 行 | 新建 `m2-current` loader/case/target/comparator/metrics/gate/report 模块；旧 runner archive-only |
| 产品 fixture repository | `src/server.js` 的 import graph 最终触达 `test/fixtures` | fixture adapter 移入明确 dev/test composition root；formal router 不导入测试目录 |
| 根状态文档 | AGENTS、README、current index、NEXT 手工复写 | AGENTS 只放稳定规则；machine-readable current state 生成导航摘要 |

不可直接删除：正式 migrations、PR #7 immutable bindings、C1–C3 公开失败结论和 seals、formal-cash target/B4 comparator、未迁移验证的 private artifacts。

## 5. 工具链、测试与运行路径

### 5.1 新发现的静态检查缺口

仓库有 328 个 tracked `.js`/`.mjs`，当前 `tools/node/check-syntax.mjs` 固定根目录只覆盖 283 个，遗漏 45 个，其中 42 个位于 `scripts/**`。这意味着 `lint` 和 `build` 同时成功仍不能证明关键 S1/B4–B8 CLI 通过语法检查。

建议在 PR #7 后的 toolchain PR 中：

1. 用 tracked-file manifest 或明确 include/exclude 扫描全部 JS/MJS；
2. lint 增加静态规则，build 增加 import/entrypoint 验证；
3. 增加一个测试锁定“tracked JS/MJS = checked + explicit exemption”。

本轮新增 capability doctor 由独立测试 import，并额外执行 `node --check`，没有把 toolchain 大改混入 PR #7。

### 5.2 测试入口

- `package.json` 有 237 个 scripts，`npm test` 是约 5.3k 字符的显式路径清单。
- 146 个 `.test.js` 中，默认 `test` 直接列出 133 个；`pretest` 扩展后覆盖 141 个。
- 5 个没有进入默认链：admin E2E、migration archive、migration path identity、public verifier request integrity、workbook lineage。它们可能属于 E2E/专项合同，但应由 registry 明确，而不是靠人工记忆。
- PR CI 只运行一条完整 default chain；其前后仍重复运行约 21 个 focused tests。不要误称为“两次完整测试”，但应减少已包含测试的重复。

建议拆为 `test:unit`、`test:current-contract`、`test:archive`、`test:e2e`、`test:private`，由一个 registry 生成平台矩阵，避免长字符串和漏测。

### 5.3 工具链复现

- package 仅声明 Node `>=20`，CI 实际是 Node 24。
- CI Python 是 3.13；本轮机器的 `python` 是 3.11.4，另一个 launcher 默认可指向 3.14。
- 仓库没有 `.python-version`、`pyproject.toml`、requirements 或 lock。
- 13 个 npm scripts 直接调用 `python`，99 个通过统一 launcher。

应单独固定 Node 24、Python 3.13 和依赖 lock，并让所有 Python 命令走统一 launcher。为避免扩大当前修复面，本轮 doctor 接受合同范围 Python 3.11–3.13，并报告实际版本；不安装新依赖。

## 6. 产品与 M2 方向判断

### 6.1 产品方向

从 `src/server.js` 的静态 import graph 看，111 个 `src` JavaScript 模块中 48 个可达、63 个不可达；38 个 `m2V2EvidencePilot` 模块全部不在产品入口图中。它们是离线研究/审计系统，不是当前 serving。

产品入口还会经三个 repository 触达四个 `test/fixtures` 文件。现有路由和 formal-mode guard 降低了误用风险，但架构上仍应把 fixture composition 与 formal serving 分离。正式 export repository 仍有三情景字段，而冻结方向是 point-only，这也是后续 serving contract 必须收口的证据。

结论：产品开发没有选错业务问题，但当前“审计能力重、产品闭环轻”。下一轮优先级应从继续复制 evidence runner 转向 runtime boundary、point-only API/DB/export 和可复现工具链。

### 6.2 M2 算法方向

| 指标 | 当前开发结果 |
|---|---:|
| B4 formal-cash WAPE / signed bias | 0.55648454 / 0.08911106 |
| C3-A formal-cash WAPE / signed bias | 0.55394517 / 0.08273913 |
| full-library forecastable cash coverage | 0.73964685 |
| Top10 coverage | 0.75941253 |
| 目标覆盖门槛 | 0.90 |
| formal-cash case / works | 7,851 / 824 |

C3-A 相对 B4 的 WAPE 绝对改善约 0.00254，且整体结论仍是 model `FAIL`、business coverage `CONDITIONAL`。这不足以证明继续沿 C1–C3 复杂化能产生发布级收益。

正确路线：

1. 冻结 C1–C3 为 archive-only，不改写失败结论。
2. 保持 formal-cash、as-of、null abstention、同一 7,851 case universe 和 B4 parity。
3. 建立一个 current algorithm core，先诊断 824/3,053 works 的覆盖、18/24 月、高价值和 intermittent/dormant 切片。
4. 优先补 prospectively captured、cutoff-as-of 可审计信息；禁止用事后买断反填承诺。
5. 只比较可解释、受约束的 tabular residual 和 hierarchy benchmark；跨 origin/horizon/TopK 与 paired CI 稳定通过后，才申请下一步。
6. final holdout、embargo shadow、deferred labels 继续 sealed；不启动 M3 formal。

因此，“M2 阶段开发方向出错”的准确回答是：目标和治理没有错，工程投入顺序与算法迭代方式已偏，需要收敛；当前不应继续加 evidence 版本或直接训练更复杂模型。

## 7. 多电脑与 private-independent 方案

### 7.1 已实施的公开基线

新增：

- `config/development-capability-catalog.v0.1.json`：声明 core 与各 private capability；
- `scripts/check-development-capability.mjs`：只盘点工具和 repository-relative role 是否存在，不读取 private 内容；
- `npm run doctor:dev`：核心开发检查，private requirements 恒为 0；
- `npm run doctor:capability -- <id>`：缺失只阻断指定能力；
- `test/development-capability-doctor.test.js`：锁定 core/private 隔离、路径边界和默认命令不依赖 private。

状态语义：

- `READY`：core 工具链满足；
- `BLOCKED_MISSING_PRIVATE_ARTIFACT`：只阻断该 capability；
- `AVAILABLE_FOR_CANONICAL_VALIDATION`：库存存在，但必须继续运行原 authoritative verifier；
- availability 永远不等于授权。

### 7.2 新电脑流程

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

以上流程不得读取 S1 receipt、M2 原始数据、provider key 或数据库。需要 S1 时另行运行：

```bash
npm run doctor:capability -- m2-pr7-s1
npm run m2:v2:pr7:s1:doctor -- --expected-head=<exact-head> --batch-id=<explicitly-authorized-batch>
```

若 private role 缺失，只报告对应能力被阻断。不得通过提交、手工拼装、放宽 digest 或把 private 内容改名为 public 来解决。

### 7.3 仍待实施

doctor 解决的是“核心开发不被 private 阻断”和“明确缺什么”，不是 private 分发本身。后续独立 portability PR 应：

1. 扩展现有 AES-256/header-encrypted 迁移工具为 capability-scoped bundle；
2. bundle 内逐文件记录 repository-relative path、size、SHA-256、schema 和 source commit；
3. archive 与 recovery key 分开传输，restore 使用 staging + verify + atomic promote；
4. provider key、数据库凭据、原始业务数据和 dump 永不进入 Git 或普通 bundle；
5. Git 只保存 schema、公开 commitment、bundle ID/外层 digest 和验证合同；
6. 先覆盖 `m2-pr7-s1`，再按授权覆盖 current-state 和 algorithm-input；M3 独立处理。

## 8. 建议执行顺序

| 优先级 | 工作 | 边界 |
|---|---|---|
| P0 已完成 | public capability catalog + doctor + tests + 协作文档 | 不读取/提交 private，不启动 B4 |
| P0 待授权 | PR #7 B4–B7 最小收口 | 每批需明确授权；不新增平行 runtime |
| P1 | toolchain lock、全量 JS/MJS 检查、测试 registry | 独立 cleanup/toolchain PR |
| P1 | fixture/formal composition 分离、point-only serving | 不改变模型结论或 release 状态 |
| P1 | 删除 80+8 完全重复副本和无语义 aliases | 引用为 0、successor 明确、全套验证 |
| P2 | `m2-current` algorithm core 与覆盖诊断 | 新授权；同一 case/comparator/seals |
| P2 | capability encrypted bundle/restore | 不迁移 secrets，不把 private 放 Git |

## 9. 删除与替代门禁

任何删除必须满足：

- 引用扫描为 0，或调用方已迁移；
- canonical successor、兼容边界和退役时间已写明；
- 历史 replay 可由 Git commit/公开聚合证据追溯；
- private state 如涉及迁移，已完成加密备份和恢复演练；
- `check:no-real-data`、lint、build、test、smoke 及专项验证按范围通过；
- PR #7 immutable artifacts 不在范围；
- cleanup、算法、运营/真实数据产物不混提交。

本审计不授权删除、B4、provider、数据库、Canary/full160、训练、holdout、B8、mark ready、merge、release 或 M3 formal。
