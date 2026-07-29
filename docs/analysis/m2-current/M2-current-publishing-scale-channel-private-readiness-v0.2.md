# 出版行业适配渠道核心：R1 私有执行前就绪记录

对象是出版行业适配的渠道月度发生—条件金额核心
（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，
`M2-CHAN-PSC01`），所属实验臂为出版行业规模适配渠道核心实验的核心臂
（`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`）。

## 当前结论

R0 接线提交 `075d4654d414447d3a5293b3825913dd3b2136b5` 已从远端 exact
head 在无 private、无凭据的全新克隆中通过安装和完整公共基线；Draft PR #31
同一 exact head 的 Linux 检查（`verify`）与 Windows 检查
（`verify-windows`）均为成功（`SUCCESS`）。

当前仍是“等待 R1 新提交自身的双平台 exact-head CI”
（`READY_PENDING_R1_EXACT_HEAD_LINUX_WINDOWS_CI`），不是已开始 private
执行。到本记录写入时：

- private 行读取：0；
- private 输出写入：0；
- 候选拟合开始：否；
- 预测行：0；
- 评价行：0；
- 单一逻辑执行窗口消耗：否。

## 授权准备

本轮追加授权策略是
`M2-PSC01-CONTROLLED-RETRY-20260728-01`。它只授权出版行业适配渠道核心
（`M2-CHAN-PSC01`）和其核心实验臂
（`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`），并在正式命令启动时动态绑定
当前 Draft PR 的 exact HEAD。

历史一次性授权、执行闭环和失败收据保持原样；没有把历史
`CONSUMED_WITH_IMPLEMENTATION_BLOCK_BEFORE_CANDIDATE_FIT` 改写为未消耗。
本轮 runtime authorization、receipt、monthly rows、raw predictions 和 evaluation
都将在 Git ignored 的专属目录中以不可覆盖的新文件追加。

## 进入 private 前仍须满足

1. 本 R1 提交完成本地完整公共门禁；
2. 普通 push 后，Draft PR #31 的本地、tracking、远端和 PR head 完全一致；
3. 本 R1 exact HEAD 的 Linux `verify` 与 Windows `verify-windows` 均为
   `SUCCESS`；
4. 工作区干净；
5. capability doctor 只读确认本模型必需的私有来源工件齐全。

任何一项失败都停止，不执行 private 命令。final/later-origin holdout、provider、
数据库、production、现行运行回退 `M2-WORK-OA03`、exact v0.3、release 和 PR
合并继续关闭。
