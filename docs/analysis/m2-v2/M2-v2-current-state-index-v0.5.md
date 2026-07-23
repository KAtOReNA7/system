# M2 v2 当前状态索引 v0.5

## 当前结论

这是 PR #7、PR #8、PR #9 合并后的唯一仓库治理入口。v0.4 中“PR #8 等待 CI/review/merge”的状态已经失效；旧 PR 分支均已删除，不得继续作为开发入口。

PR #7 cryptographic current-authority 仍由不可变的 `M2-v2-current-state-index-v0.3.json` 提供。本索引只更新仓库生命周期、跨电脑开发能力和 M2 当前方向，不改写其摘要绑定。

当前业务状态保持：

- `currentDecision=CANARY_FAIL`
- `nextDevelopmentReadiness=NOT_AUTHORIZED`
- `full160Authorized=false`
- `modelTrainingAuthorized=false`
- provider、数据库、Canary/full160、训练、final holdout、release、M3 formal 均未授权

## 仓库生命周期

| PR | 状态 | merge commit |
|---|---|---|
| #7 | `MERGED`，分支已删除 | `91dee993058d80ab36085ec0d3176b7ad154527e` |
| #8 | `MERGED`，分支已删除 | `3b47cf583a4e737f45500d405cb4e7380f6a747d` |
| #9 | `MERGED`，分支已删除 | `b5b9b6f6737b83c59a9e5c5ba53a02fe96833b80` |

本轮跨电脑收口审计开始时，`HEAD == origin/main == b5b9b6f6737b83c59a9e5c5ba53a02fe96833b80`，开放 PR 为 0，仅有 `main` 长期分支。

## 无 private 的跨电脑开发

全新 GitHub 克隆在不存在 `data/private-input`、`data/private-output`、S1 authenticity receipt、provider key 和数据库的条件下，通过了安装、doctor、lint、build、1324 项默认测试、smoke、13 项 E2E、M2 public diagnostics，以及 formal/fixture 两种服务器启动。

portable closeout exact commit `3c029a12bec44d79853675b4febde7de5213e9fd` 又在独立 clone 中重复通过更新后的 1,327 项默认测试和 13 项 E2E；private input/output 在验收前后均不存在。

持续基线为：

```bash
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

工具链合同已统一为 Node 24.x、npm 11.13.0、Python 3.11–3.13。doctor 不再把 Node 20–23 或 npm 10/其他 patch 错报为 `READY`。Linux/Windows CI 同时执行 doctor、公共门禁、双 runtime 启动和 M2 public snapshot 验证。

缺少 `s1-source-evidence-authenticity-private-v0.1.json` 只会阻断已退役 PR #7 的历史 capability；核心开发继续可用。

## 代码和命令收敛

审计基线的 1,699 个 tracked 文件没有完全相同的 blob group，package scripts 没有完全相同的命令 alias。formal/fixture composition 已分离，formal M2 export 保持 point-only。

为降低 250+ 历史入口的认知成本，`config/command-lifecycle.v0.1.json` 现在把命令分为：

| 生命周期 | 数量 | 语义 |
|---|---:|---|
| `current-public` | 20 | 当前开发和 CI |
| `archive-only` | 182 | 历史审计重放，不授予权限 |
| `restricted-local` | 49 | 需要所属 capability/授权 |
| `history-dispatcher` | 1 | 统一人工历史入口 |

历史 package entries 因不可变审计兼容继续保留；新开发不得复制这些 runner。需要人工历史重放时使用 `npm run history:m2 -- --acknowledge-archive-only <archive-script>`。

`.gitattributes` 已建立跨平台文本 EOL 合同，避免依赖每台电脑不同的 `core.autocrlf`。

## M2 当前诊断

| 指标 | 当前值 |
|---|---:|
| 权威作品 | 3,053 |
| model works / formal-cash cases | 824 / 7,851 |
| model work share | 26.99% |
| 全库 / Top10 cash coverage | 0.7396468495 / 0.759412528 |
| coverage 门槛 | 0.90 |
| B4 WAPE / bias | 0.55648454 / 0.08911106 |
| C3-A WAPE / bias | 0.553945169 / 0.08273913 |
| C3-A decision | `FAIL` |

业务问题、formal-cash target、as-of/no-leakage、null abstention、B4 comparator 和 seals 没有跑偏。历史偏差是工程顺序：在覆盖率和产品闭环不足时，过度扩张 evidence runtime 和历史 runner。

当前方向固定为：

1. 先解释并缩小 824/3,053 model works 的覆盖缺口；
2. 在同一 7,851-case universe 上按 dense/intermittent/dormant、horizon、TopK 诊断；
3. 再比较受约束、可解释的新候选；
4. coverage、质量、paired CI 和业务抽检全部通过后，才申请 final holdout。

## 当前入口

- 人员 onboarding：`README.md`
- Codex 常驻规则：`AGENTS.md`
- 下一任务交接：`NEXT-CODEX-INSTRUCTION.md`
- 机器可读状态：同名 v0.5 JSON
- 本轮复审与修正：`M2-repository-code-convergence-and-portable-development-audit-v0.4.md`

任何把 PR #7/#8 描述为 open、要求进入已删除分支或把旧 B0–B8 状态当作当前授权的内容，均为历史证据，不是执行入口。
