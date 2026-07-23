# 全库代码收敛、方向与多电脑开发复审 v0.4

## 1. 复审结论

v0.3 的核心代码修正有效，但再次验收发现三项未完全收口的问题：

1. README、AGENTS、NEXT 和 v0.4 状态索引仍混有 PR #7/#8 未合并、旧分支可继续使用等失效指令。
2. `package.json` 要求 Node 24/npm 11.13.0，但 capability doctor 会把 Node 20/npm 10 错报为 `READY`。
3. 双平台 CI 未直接执行 doctor、M2 public snapshot 和 formal/fixture 真实启动，仓库也没有统一 EOL 合同。

private 缺失导致核心项目不能启动的问题本身已经修复。复审从 GitHub 全新克隆 exact `main`，确认没有 private input/output 后完成安装、默认测试、E2E、公共诊断和两种 server 启动；S1 doctor 只局部阻断历史 S1 capability。

因此本轮不是重做 PR #7，而是完成 portable-development 和 current-governance 的最后收口。

## 2. 已实施修正

### 2.1 工具链 doctor

- Node contract 改为 24.x，不再接受 20–23 或 25+。
- npm contract 改为 exact 11.13.0。
- 新增 Node 20/npm 10 和错误 npm patch 必须 fail 的回归测试。
- toolchain contract 同时绑定 package、capability catalog 和 CI。

### 2.2 持续可移植门禁

- 新增 `npm run smoke:portable-start`。
- 该命令清空数据库、provider 和 credential 环境，真实启动 formal 与 fixture composition 并检查 `/health`。
- Linux/Windows CI 均固定 npm 11.13.0，并新增：
  - `npm run doctor:dev`
  - `npm run smoke:portable-start`
  - `npm run verify:m2:current`
- 新增 `.gitattributes`，统一 JS/MJS/JSON/Markdown/Python/YAML/PowerShell/SQL 为 LF，并显式标记二进制类型。

### 2.3 命令生命周期

顶层 package scripts 因历史审计绑定不能无证据批量删除。本轮增加 `config/command-lifecycle.v0.1.json` 和 lint gate，要求每个 script 唯一属于：

- `current-public`
- `archive-only`
- `restricted-local`
- `history-dispatcher`

当前 252 个 scripts 已全部分类：20/182/49/1。新开发只使用 current-public；历史重放通过带显式 acknowledgement 的统一 dispatcher，旧名字只保留为 audit compatibility。

### 2.4 当前入口

- `AGENTS.md` 重写为常驻协作、private 隔离、M2 当前方向、Git 和验证规则。
- `README.md` 重写为当前 onboarding，不再夹带旧 PR 执行指令。
- `NEXT-CODEX-INSTRUCTION.md` 删除已合并分支和 B0–B8 任务队列。
- 新建 current-state v0.5；不可变 PR #7 v0.3 cryptographic authority 保持不变。

## 3. 冗余复审

审计基线：

- tracked 文件：1,699
- 完全相同 tracked blob groups：0
- 完全相同 package command aliases：0
- formal/fixture composition：已分离
- formal export：point-only

剩余的高数量历史 runner 是语义/审计负担，不是逐字节重复。直接删除会破坏冻结测试和历史 verifier，因此采用“生命周期隔离 + 单一人工 dispatcher + 禁止新开发复制”的替代方案。

## 4. M2 方向判断

业务目标和治理边界没有跑偏：

- future bill cash
- as-of/no-leakage
- pure-buyout 无承诺时 null abstain
- B4 comparator/fallback
- final holdout sealed

历史工程顺序确实跑偏：在 model works 仅 824/3,053、全库覆盖率 73.96%、Top10 75.94%、最新候选仍 FAIL 时，投入过多工程量扩张 evidence runtime 和历史 runner。

当前修正方向是正确的，但 M2 尚未完成。下一步必须先做 coverage 和失败切片，再做受约束候选比较；不得把仓库治理完成解释为模型质量通过或发布授权。

## 5. Private 和多电脑开发

核心开发合同明确不读取 private。`s1-source-evidence-authenticity-private-v0.1.json` 继续保留在历史 capability catalog 中，仅供真实性审计；缺失时 doctor 必须同时说明：

- 该 capability 被阻断；
- core development unaffected；
- 不得伪造或提交 private receipt。

受控 private capability 的跨电脑恢复仍使用加密 capability bundle；GitHub 只同步公开代码、schema、脱敏 commitment、恢复合同和 doctor。

## 6. 授权边界

本轮只修改公开仓库工程治理，不调用 provider、数据库、Canary/full160、训练、holdout、release 或 M3 formal，不改变：

- `currentDecision=CANARY_FAIL`
- `nextDevelopmentReadiness=NOT_AUTHORIZED`
- `full160Authorized=false`
- `modelTrainingAuthorized=false`

## 7. 最终验证

当前工作树本地验证：

| 命令 | 结果 |
|---|---|
| `npm run doctor:dev` | `READY`；Node 24.16.0、npm 11.13.0、Python 3.11.4 |
| `npm run check:no-real-data` | 1,707 个 tracked/staged/nonignored-untracked paths 通过 |
| `npm run lint` | 360 个 JS/MJS、252 个 lifecycle-classified scripts 通过 |
| `npm run build` | 通过 |
| `npm test` | 1,327/1,327，0 fail、0 skip |
| `npm run smoke` | 通过；fixture、无真实数据、无 formal DB |
| `npm run smoke:portable-start` | formal/fixture 均通过；private-independent |
| `npm run test:e2e` | 13/13，0 fail、0 skip |
| `npm run verify:m2:current` | 确定性 public snapshot 通过 |

全量测试首次暴露历史 formal-cash synthetic preflight 只接受 `codex/m2-*`、旧命名分支或 CI，拒绝普通 `codex/*` 维护分支。修正后，只有 synthetic-only preflight 接受任意 Codex feature branch；Phase A、private、final-holdout 和正式写入入口没有放宽，final-holdout fail-closed 测试继续通过。

实现提交 `3c029a12bec44d79853675b4febde7de5213e9fd` 已在独立 clone 中重复完整公共基线。该 clone 在验证前后均不存在 `data/private-input` 或 `data/private-output`，并再次得到：

- doctor `READY`
- no-real-data、lint、build 通过
- 默认测试 1,327/1,327，0 fail、0 skip
- smoke 和 formal/fixture portable start 通过
- E2E 13/13，0 fail、0 skip
- M2 public diagnostic snapshot 通过

因此多电脑结论不再仅依赖原工作树或历史 CI，而有 exact committed tree 的无-private clone 证据。
