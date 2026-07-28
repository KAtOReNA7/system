# M2 评价合同 v2.1 验证

## 验证决定

评价合同 v2.1 的目标状态是
`ACTIVE_FOR_DEVELOPMENT_EVALUATION_ONLY`，且仅在本文件所在 exact Git HEAD 的
Linux/Windows CI 全部成功后生效。任一失败时，合同状态为
`DRAFT_V2_1_REVISION_INCOMPLETE`。

激活不打开模型执行、训练、拟合、调参、选择、晋升、预测生成、production、
final holdout、Canary 或 release。

## K0 Python 兼容环境

仓库公共 Python 合同保持 3.11–3.13，CI reference 为 3.13。本轮没有删除或覆盖
机器原有 Python 3.14；共享 resolver 按以下受控顺序选择并验证实际版本：

1. 显式绝对路径 `KATORENA7_PYTHON`；
2. 项目 `.venv`；
3. Codex bundled runtime；
4. Windows `py -3.13/-3.12/-3.11`；
5. POSIX `python3.13/.12/.11`，再验证通用 `python3/python`。

doctor 与 Python runner 共用同一 resolver，命令始终以 executable + args array、
`shell:false` 启动。K0 exact HEAD
`38c3a418f55caa7e21b936fab5d2c341176439f2` 已通过 Linux/Windows CI。

## K1 实现与精确 HEAD

canonical 实现位于：

- `src/domain/m2Current/evaluationV2.js`；
- `scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs`；
- `config/m2-evaluation-contract.v2.1.json`；
- `test/m2-evaluation-contract-v2-1.test.js`。

没有创建 production loader、route、API、runtime 或历史 runner 的平行实现。
旧 `--rescore` 语义保持不变；v2.1 使用同一 runner 的
`--rescore-v2-1` 模式。

K1 exact HEAD `f5677bcee52f76633ffaa3072b4b0e4005c8691f` 已通过 Linux `verify` 与
Windows `verify-windows`。

## 冻结工件与确定性

六份冻结 artifact 共 716,801 行：

- 全部在任务开始前存在；
- 全部由 Git ignore 覆盖；
- SHA-256 全部匹配预注册；
- 行数全部匹配预注册；
- 只读取冻结预测，没有生成或修改预测行。

相同输入连续执行两次，私有回执 SHA-256 与 byte length 完全一致。私有库存、行级
输入和私有回执继续位于 capability-scoped Git ignored output；公共报告只含聚合。

## 语义验证矩阵

| 项目 | 验证状态 |
|---|---|
| evaluation identity 与 artifact digest 绑定 | 通过 |
| target/cash/actual/as-of/grain/population/horizon/family 可比性 | 通过 |
| raw、pre-selection、selected、fallback identity 分离 | 通过 |
| 逐 horizon WAPE/bias/MAE/median/tail | 通过 |
| 严格 same-case paired FVA | 通过 |
| zero actual denominator 显式状态 | 通过 |
| MASE 缺少 pre-origin scale 时显式 gap | 通过 |
| case-cell 与 global-work top 1%/5%/10% | 通过，后验 only |
| occurrence 独立 `actualPositive` | 通过 |
| frozen training prevalence 缺失状态 | 通过 |
| 0.5 threshold 仅诊断 | 通过 |
| conditional amount 与 reversal 独立 | 通过 |
| 排序 candidate/fallback 配对与双 cluster 区间 | 通过 |
| 原生分位网格、coverage、width、WIS/CRPS | 通过 |
| 无 interval reference 时受限解释 | 通过 |
| portfolio 逐 horizon 与 origin 区间 | 通过 |
| 最大相邻 origin time block | 通过 |
| 30 cases / 20 works / 5 origins 隐私阈值 | 通过 |
| 公共 artifact 无行级身份/private path | 通过 |
| 连续两次输出逐字节一致 | 通过 |

## 本地公共门禁

K1 已通过：

- `npm run doctor:dev`
- `npm run check:no-real-data`
- `npm run lint`
- `npm run build`
- `npm test`（790/790）
- `npm run smoke`
- `npm run smoke:portable-start`
- `npm run test:e2e`（13/13）
- `npm run verify:m2:current`

K2 在提交前重新执行同一完整门禁。最终激活还要求 K2 exact HEAD 的 Linux 与
Windows CI 同时成功；CI 结果不能预写为成功。

K2 第一次 `npm test` 因本机 Windows 系统临时盘返回 `ENOSPC` 而中断；这不是测试
断言结论。将当前进程的临时目录和 npm cache 定向到 E 盘的临时/ignored 路径后，
完整默认测试 792/792 通过，没有跳过或降低门禁。其余 smoke、可移植启动、端到端
测试和 M2 当前公共验证随后全部通过。

## 历史、模型与授权保持

历史 v2 文件、冻结 raw result、digest 和失败结论没有改写。模型角色保持
`M2-WORK-OA03` / `M2-WORK-LG01` / `M2-PORT-ETS01`，活动候选与自动化批准均为空。

结论码：
`M2_EVALUATION_CONTRACT_V2_1_ACTIVE_FOR_DEVELOPMENT_ONLY`（仅当 exact-head
双平台 CI
成功）；否则
`M2_EVALUATION_CONTRACT_V2_1_REVISION_INCOMPLETE`。
