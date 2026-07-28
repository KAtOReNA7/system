# 出版行业适配的渠道月度发生—条件金额核心：K7D 一次性执行闭环

- 最终状态：出版行业规模适配实现阻断（`M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED`）
- 模型：出版行业适配的渠道月度发生—条件金额核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`）
- 实验臂：出版行业规模适配渠道核心开发的核心臂
  （`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`）

K7C 的精确提交、Draft PR #29 与 Linux/Windows CI 前置核验均通过。K7D 唯一一次
私有命令随后启动 capability-scoped 物化；由于新 runner 误调用历史渠道时间生成模型
v0.2 的物化模式，历史已消耗授权的边界校验正确 fail-closed。失败发生在候选拟合前。

因此没有生成 raw candidate、primary/strict 结果、分 horizon/time block/top revenue
结果、bias/MAE/median AE、occurrence/conditional amount/ranking、2,000 次作品聚类
bootstrap 或 forecastability/oracle 诊断。不能把本次结果解释为模型通过或模型失败。

实现已修复为独立的 publishing-scale 物化入口，并补齐物化阶段自动失败收据；历史
物化入口未改写。修复后只运行公开 synthetic 验证。本次私有授权已消耗且未授权重试；
未来若要再次执行，必须由用户提供新的明确授权，并重新经过新提交的精确
Linux/Windows CI。

作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，
`M2-WORK-OA03`）继续是现行运行回退模型；活动候选和自动化批准均为空。final
holdout、production、provider、database、later-origin、release 与 PR 合并均未打开。
