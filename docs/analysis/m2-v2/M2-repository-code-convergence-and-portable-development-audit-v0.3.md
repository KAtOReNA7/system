# 全库代码收敛、效率与多电脑开发审计 v0.3

## 1. 收口结论

v0.2 提出的仓库级 P0/P1 修正和安全范围内的 P2 诊断基础已完成。项目的业务目标没有跑偏，但此前“审计能力重、产品闭环轻”和“历史 runner 持续扩张”的投入偏差已经被明确收敛：

- PR #7 的 B0–B8 与 10 项 finding 已经独立复审并合入 `main`。
- 公开核心开发不再依赖 `s1-source-evidence-authenticity-private-v0.1.json` 或其他 Git ignored private artifact。
- formal 与 fixture runtime 已拆分，正式 export 已变为 point-only。
- 工具链、测试入口、CI 和可证明完全重复文件已收敛。
- C1–C3 继续冻结为失败历史；B4 只作 comparator/fallback。
- 新建的 `m2-current` 只做 public aggregate 诊断，未训练模型、未打开 holdout、未改变任何业务 gate。

当前方向判断仍是：formal-cash target、as-of/no-leakage、null abstention、B4 comparator 和 seals 是正确边界；下一开发重点应是覆盖与失败切片，而不是继续复制 evidence runtime 或直接升级复杂模型。

## 2. v0.2 方案实施对照

| v0.2 修正项 | 实施结果 | 当前门禁 |
|---|---|---|
| 固定 Node/Python/npm | Node 24、npm 11.13.0、Python 3.13 reference/CI 和 CI requirements 已进入仓库；本地支持 3.11–3.13 | toolchain contract |
| 全量 JS/MJS 检查 | tracked inventory 覆盖全部 JS/MJS，exemption 必须显式登记 | lint/build + `test/toolchain-contract.test.js` |
| 拆分测试入口 | registry 统一 default/E2E/archive/private profiles | `tools/node/run-test-registry.mjs` |
| 收敛 CI | 一般 PR 只跑公共可移植门禁；PR #7 exact-branch preflight 不再污染未来 PR | Linux/Windows CI |
| formal/fixture 分离 | `src/server.js` 为 formal root，`src/fixtureServer.js` 为显式 fixture root | runtime composition contract |
| point-only serving | formal export repository 不再查询或返回 optimistic/pessimistic | runtime/export contract |
| 删除 80 对 migration 副本 | 仅保留 forward-only `db/migrations`；candidate config/runner 一并退役 | redundancy contract |
| 收敛 8 对文档副本 | `docs/prd` 为 canonical；archive 只保留短 redirect 和 Git 历史定位 | duplicate scan |
| 删除无语义 aliases | 删除 8 个命令别名；保留具备独立参数或治理语义的入口 | package script contract |
| 建立 current core | 新建 case/target/metrics/comparator/gate/report/loader 和 deterministic public snapshot | `verify:m2:current` |

本 PR 相对 PR #7 merge base 的规模约为 150 个变更文件、`+2.4k / -3.6k`；最终精确统计以 PR #8 的 exact-head API 为准。其中大量删除来自 80 份逐字节相同 migration 副本；正式 migrations、历史报告、seals、PR #7 immutable binding 和 private artifacts 均未删除或改写。

## 3. 可移植开发结论

新电脑公开开发路径是：

```bash
git pull --ff-only
npm ci
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run verify:m2:current
```

这些命令不读取 S1 receipt、M2 private authority、provider key 或数据库。`npm start` 使用 formal composition；只有合成数据开发才显式运行 `npm run start:fixture`。private 文件缺失只阻断其 capability，不再把整台新电脑判定为“项目无法启动”。

Python 统一由 repository launcher 解析；本地合同支持 3.11–3.13，`.python-version` 与 CI reference 固定 3.13。Node/npm 通过 `.nvmrc`、engines 和 package manager contract 固定。lint 负责完整语法和 package script 规则，build 负责 entrypoint/import 可运行性，两者不再是同一命令的两个名字。

## 4. runtime、输出与冗余

formal root 不再导入 fixture repository 或测试目录。四个运行所需的合成 fixture 已移动到 `src/fixtures`，测试与显式 fixture server 共享这些非真实数据。正式路由若访问 fixture-only 能力会 fail-closed，不会静默回落到 fixture。

正式 M2 export 只暴露 `forecastPointEstimate` 和 `pointEstimateOnly=true`。历史三情景 schema/fixture 可继续用于历史测试与追溯，但不再由 formal repository 查询或输出。

冗余删除遵循“引用为零、successor 明确、Git 可追溯、专项测试锁定”的门禁。没有证据支持的近似重复文件未批量删除；C1–C3、V2-B 历史报告、PR #7 authority graph 和 formal migrations 均保留。

## 5. M2 当前诊断与方向

`m2-current` 从已审阅的公开聚合证据构建确定性诊断，不访问 private、数据库或 provider：

| 指标 | 当前值 |
|---|---:|
| 作品人口 / model works | 3,053 / 824 |
| formal-cash cases | 7,851 |
| model work share | 26.99% |
| full-library / Top10 coverage | 0.7396468495 / 0.7594125280 |
| coverage gate | 0.90 |
| B4 WAPE / bias | 0.55648454 / 0.08911106 |
| C3-A WAPE / bias | 0.553945169 / 0.08273913 |
| C3-A decision | `FAIL` |
| business coverage | `CONDITIONAL` |

切片显示 dense、intermittent、dormant 的误差性质不同；其中 intermittent 与 dormant 不应再被一个整体 WAPE 掩盖。当前输出为 `BASELINE_ONLY_BLOCKED`，因为 coverage 未达标、现有候选质量失败、没有获批 current candidate、final holdout sealed 且业务抽检未完成。

因此 M2 的后续修改方向是：

1. 先提高可审计的 as-of 输入覆盖，并解释 824/3,053 works 的缺口；
2. 在同一 7,851 case formal-cash universe 上按 dense/intermittent/dormant、horizon、TopK 做稳定性诊断；
3. 只比较可解释、受约束的 tabular residual 与 hierarchical benchmark；
4. 候选必须同时通过 B4 parity、paired CI、bias、coverage 和业务抽检后，才申请 final holdout；
5. 不重复进入 C1–C3，不用未来买断反填 cutoff commitment，不把 abstention 填成 0。

## 6. 验证与授权边界

首次一般化 CI 在两个旧 HEAD 暴露了两项真实可移植性缺口：Windows checkout 的 CRLF 使确定性 JSON 字节比较误报漂移；historical formal-cash synthetic preflight 只认识旧命名分支或 GitHub merge ref，不认识 CI 明确 checkout 的 exact PR head。修正后，前者只归一化 CRLF/LF 而不放宽 JSON 内容，后者新增 `trusted_pr_head`，但必须证明本地 HEAD 等于 `refs/remotes/origin/<GITHUB_HEAD_REF>`，仍保持 fail-closed。聚焦回归 17/17 通过。

最终治理工作树验证结果：

| 命令 | 结果 |
|---|---|
| `npm run doctor:dev` | `READY`；Node 24.16.0、npm 11.13.0、Python 3.11.4 |
| `npm run check:no-real-data` | 通过；1,699 个 tracked/staged/nonignored-untracked paths 无违规 |
| `npm run lint` | 通过；357 个 JS/MJS 与 250 个 package scripts |
| `npm run build` | 通过；357 个 JS/MJS，全部声明 entrypoint 可导入 |
| `npm test` | 1,324/1,324 通过，0 fail、0 skip |
| `npm run smoke` | 通过；fixture mode，未导入真实数据、未连接 formal DB |
| `npm run test:e2e` | 13/13 通过，0 fail、0 skip |
| `npm run verify:m2:current` | 确定性 public diagnostic snapshot 通过 |

PR #8 只有在当前 exact-head 本地验证、Linux/Windows CI 与 review 反馈均收口后才可 ordinary merge。用户已授权该仓库维护 PR ready/merge；这不等于授权 provider、数据库、Canary/full160、模型训练、final holdout、release 或 M3 formal。`currentDecision=CANARY_FAIL`、`nextDevelopmentReadiness=NOT_AUTHORIZED` 保持不变。
