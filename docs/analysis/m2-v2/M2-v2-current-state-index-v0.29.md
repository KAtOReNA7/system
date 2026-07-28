# M2 当前状态索引 v0.29

截至 2026-07-28，本轮从固定 main
`623d9c2a41a90ddfd3263bf49a30c5b8e10f0a07` 完成：

1. Python 3.11–3.13 普通开发能力与项目级可移植解析修复；
2. M2 评价合同 v2.1 修订、冻结确定性重评分和按条件激活。

最终状态为
`M2_EVALUATION_CONTRACT_V2_1_ACTIVE_FOR_DEVELOPMENT_ONLY`，仅在本索引所在 exact
Git HEAD 同时通过 Linux 与 Windows CI 后生效。

## Git 与历史快照

- 固定起点：local main、`origin/main` 和 PR #28 merge commit 均为
  `623d9c2a41a90ddfd3263bf49a30c5b8e10f0a07`，behind/ahead 为 0/0。
- PR #28 的 GitHub 实时状态是已合并（MERGED）。
- v0.28 是 PR #28 合并前生成的不可变历史快照；其中
  “Draft/Open/Unmerged”只描述当时状态，不回写。
- 当前分支：`codex/m2-evaluation-contract-v2-1`。
- 当前新 Draft PR：#29，base 为 `main`，未合并。
- K0 exact HEAD：
  `38c3a418f55caa7e21b936fab5d2c341176439f2`。
- K1 exact HEAD：
  `f5677bcee52f76633ffaa3072b4b0e4005c8691f`。
- K2 最终 exact HEAD 以 PR #29 的 `headRefOid` 和本地
  `git rev-parse HEAD` 一致性为权威；文档不尝试写入包含自身的 commit hash。

本机旧分支 `codex/m2-v2-evidence-pilot-v1` 原样保留，没有 checkout、reset、
merge、rebase、cherry-pick 或删除，也没有被用作本任务证据或起点。

## Python 开发能力

本机以当前用户范围并排安装官方 Python 3.13.14；原 Python 3.14.5 保留，未卸载、
覆盖或加入仓库允许版本。

仓库新增共享 compatible Python resolver，使 doctor 与 Python runner 使用相同
语义。实际默认选择为 Codex bundled Python 3.12.13；显式
`KATORENA7_PYTHON` 验证可选择官方 Python 3.13.14。resolver 只接受 3.11–3.13，
拒绝 3.14，以 executable + args array、`shell:false` 启动，并支持 Windows、
Linux/macOS、项目 `.venv` 与 Codex bundled runtime。

K0 本地公共门禁、无 private fresh clone 公共基线和 exact-head Linux/Windows CI
均通过。

## v2.1 权威入口

- 机器合同：`config/m2-evaluation-contract.v2.1.json`
- 中文合同：
  `docs/analysis/m2-current/M2-evaluation-contract-v2.1.md`
- 合同验证：
  `docs/analysis/m2-current/M2-evaluation-contract-v2.1-validation.md`
- 诊断复核：
  `docs/analysis/m2-current/M2-evaluation-v2.1-diagnostic-recheck.md`
- 机器可读复核：
  `docs/analysis/m2-current/M2-evaluation-v2.1-diagnostic-recheck.json`

历史 v2 提案、v2 冻结重评分、digest 与 raw failure 文件没有改写。

## 冻结工件与确定性

六份冻结 artifact 共 716,801 行：

- 全部在任务开始前存在且保持 Git ignored；
- digest、schema、行数与唯一 case key 均通过；
- 相同冻结输入连续执行的聚合结果逐字节一致；
- private 行、作品/渠道 ID、actual、prediction 和私有回执均未提交。

模型执行、训练、拟合、调参、选择、预测生成、预测修改和 production 变更次数全部
为 0。

## 诊断解释修订

- 生命周期感知收入预测实验
  （Lifecycle-Aware Revenue Forecast，`M2-EXP-LIFECYCLE-AWARE-01`）：
  occurrence 必须使用独立 `actualPositive`；strict population 有发生区分证据，
  但 0.5 阈值只作诊断。
- TSB 收入发生实验
  （TSB Occurrence，`M2-EXP-TSB-OCCURRENCE-01`）：
  PR-AUC 必须与 prevalence 并列；缺少 frozen training prevalence，所以 baseline
  skill 为 `NOT_COMPUTABLE_FROZEN_TRAINING_BASE_RATE_MISSING`。
- 渠道倍率专家实验
  （Channel Experts，`M2-EXP-CHANNEL-EXPERTS-01`）A6 消融臂：
  对研究 fallback 有小幅配对排序信号，但 raw 现金点预测仍失败；不授权资源分配。
- 人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）历史原始分位：
  coverage 接近 nominal，但无同人口冻结 interval reference，只登记
  `PROMISING_DEVELOPMENT_INTERVAL_EVIDENCE`。
- 组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）：
  3 月 origin-cluster 区间保持正向；6/12 月跨 0，12 月只有 6 origins，仍是小样本
  开发证据，不创建 horizon router。
- top 1%/5%/10% 同时按 origin×horizon case 与全局聚合作品口径输出，使用未来
  actual 的视图固定为 `POSTHOC_FUTURE_ACTUAL_ATTRIBUTION_ONLY`。

这些变化只收窄诊断解释，不改变历史 raw 点预测失败。

## 模型角色保持

- 现行运行 fallback：作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

## 保持 sealed

v2.1 不是 production 或 automation gate。production、exact v0.3 预测路径、
provider、数据库、final holdout、Canary/full160、release 与 M3 formal 均未修改、
授权或打开。完成本轮后不得自动开始新模型、渠道时间生成、later-origin、holdout
或 release。
