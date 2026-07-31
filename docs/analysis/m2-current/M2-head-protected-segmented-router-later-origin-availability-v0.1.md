# M2 头部保护分段路由 later-origin 可用性盘点 v0.1

## 首页结论

1. **是否存在真正未被历史实验读取的成熟 later-origin：否。**
   当前状态为
   `M2_HEAD_PROTECTED_SEGMENTED_ROUTER_WAITING_FOR_NEW_BILLS`，这不是模型失败。
2. **本轮使用了几个非重叠预测起点：0 个。** 没有读取新的未来金额或模型指标。
3. **H50 是否逐行保持 LG01：未执行 K1/K2；合同已在 K0B 预注册为必须逐行完全相等。**
4. **M30、L20 是否分别改善：未评价，结果为 `null`。**
5. **Core80 总现金、WAPE、FVA：均未读取，结果为 `null`。**
6. **Core90 是否支持同方向：未评价，结果为 `null`。**
7. **是否出现 B3 数值外推、R1 是否隔离：未执行，结果为 `null`。**
8. **最终判定：等待新账单，不是通过、单窗口方向性、不确定或 cash-only 失败。**
9. **final holdout：本轮没有打开新的 final holdout；但历史三个月 final holdout
   起点已被其他 M2 派生缓存预先暴露，不能再表示为本实验的 untouched holdout。**

## opened-origin ledger

日期级不可变 private ledger 已写入 Git ignored 的能力目录。它只保存 origin、
horizon、标签日期键、既有 actual 是否为空，以及 billMonth；不保存或汇总金额。
该 ledger 属于 `PRIVATE_DERIVED_CACHE`，换电脑后可由权威账单与冻结代码重建，
缺失不能报告为 `MISSING_SOURCE_AUTHORITY`。

盘点结果：

- 历史 feature cache 共 53 个 origin，范围为 `2017-08` 至 `2026-02`。
- 冻结 LG01 same-case cache 共 45 个 origin，范围为 `2019-08` 至 `2026-02`。
- `maxPreviouslyOpenedOrigin = 2026-02`。
- 已有缓存的标签日期键及非空状态表明，未来事实边界已经延伸到 `2026-05`。

“打开”在这里按附件的严格定义处理：只要历史报告、receipt、evaluation row 或
cache 已经物化 future actual，即使没有形成公开评分，该 origin 也不能改名为新的
later-origin。

## 账单月份完整性

权威分成账单目前可见到 `2026-05`，但该月只有 3 条事实，按现有冻结
readiness 权威属于不完整月份。最新完整月份为 `2026-04`。三个月评价要求
origin 后连续三个完整 future billMonth，且不得把未成熟或不完整月份补 0。

严格晚于 `2026-02` 的第一个候选 origin 是 `2026-03`，但其未来窗口需要
`2026-04` 至 `2026-06`，当前并不完整。因此目前：

- 可用 later-origin：0；
- 非重叠 later-origin：0；
- later-origin outcome 消耗：否；
- final holdout 消耗：否。

## final holdout 隔离冲突

历史不可变合同
`src/domain/oldProductEvaluation/calibrationSpec.v1.json` 为三个月 horizon 登记了
`2025-06`、`2025-12` final holdout。现有派生缓存的 opened-origin 边界已经越过
两者，并物化到 `2026-02` origin；因此这两个起点对本实验不再满足“从未读取”
条件。

本次没有改写历史合同，也没有把冲突解释成新模型可用的 holdout。机器状态登记为
`HISTORICAL_FINAL_HOLDOUT_ISOLATION_CONFLICT`，并从未来未读月份重新保留空间：

- 若先形成一个 later-origin：最早可考虑 `2026-05`（预测 `2026-06` 至
  `2026-08`），同时保留非重叠 `2026-08` final holdout（预测 `2026-09` 至
  `2026-11`）；至少需要完整账单到 `2026-11`。
- 若要求两个非重叠 later-origin 再加一个 final holdout：可考虑 `2026-05`、
  `2026-08`，保留 `2026-11` holdout；至少需要完整账单到 `2027-02`。

这些月份只是日期级保留，不是执行授权，后续也必须重新核验它们仍未被其他任务打开。

## 停止点

K0A 日期盘点与 K0B 公开预注册、合同测试已经完成。因没有合格 later-origin，
本轮在 Draft PR 停止，不实施 HPSR01、不拟合 LG01/CHAM01、不执行 later-origin
评分或 bootstrap，也不打开 final holdout。
