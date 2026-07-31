# M2 HPSR01 回溯开发评价 v0.1

## 首页结论

- K1 是否完成：是，canonical implementation 与公开合成验证均已完成。
- 回溯评价是否真正执行：是；已冻结首个且唯一的完整回溯开发结果。
- 纳入 origin：2025-11。
- 回溯判断：`M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2`（回溯开发证据不支持，按合同在独立 K2 前停止）。
- 是否为独立证据：否；这是此前已打开 outcome 的回溯开发证据。
- 独立 K2 数据是否成熟：否。
- 独立 K2 是否执行：否。
- prospective final holdout 是否仍未打开：是。
- 是否值得继续等待：否；按合同在独立 K2 前停止。
- activeCandidate：否；approvedForAutomation：否。

## 身份与边界

- 中文模型名：LG01 头部保护分段路由模型 v0.1
- 英文原名：LG01 Head-Protected Segmented Router Model v0.1
- 稳定模型 ID：`M2-WORK-HPSR01`
- 稳定实验 ID：`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01`
- 评价类型：回溯开发评价（非独立 later-origin、非 final holdout）
- horizon：3 个月；主人口：origin 动态 Core80 成熟老品既有成熟业务范围

## 回溯人口

| origin | 决定 | 原因 | 预先打开证据行数 |
| --- | --- | --- | ---: |
| 2025-10 | 排除 | 本任务前没有 actual 已打开证据（`ACTUAL_NOT_OPENED_BEFORE_TASK`） | 0 |
| 2025-11 | 纳入 | 满足全部动态门禁 | 5306 |
| 2025-12 | 排除 | 历史隔离 outcome（`HISTORICAL_ISOLATED_OUTCOME`）、本任务前没有 actual 已打开证据（`ACTUAL_NOT_OPENED_BEFORE_TASK`） | 0 |
| 2026-01 | 排除 | 本任务前没有 actual 已打开证据（`ACTUAL_NOT_OPENED_BEFORE_TASK`） | 0 |
| 2026-02 | 排除 | 三个月权威账单窗口不完整（`INCOMPLETE_THREE_MONTH_AUTHORITY_WINDOW`） | 2685 |

| 纳入 origin | 全部成熟可评价作品 | case 数 | Core80 作品 | Core80 actual cash coverage | H50 作品 | H50 actual share | M30 作品 | M30 actual share | L20 作品 | L20 actual share | cutoff tie |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025-11 | 2653 | 57 | 57 | 81.7104% | 5 | 55.5497% | 19 | 26.1260% | 33 | 18.3243% | 1 |

- 最终唯一 case-key：57
- Core80 actual cash coverage：81.7104%
- H50 逐行严格等于 R0：通过
- final prediction 全部有限：通过

## 主要同案例成绩

| 对象 | WAPE | signed bias | absolute bias | MAE | median AE |
| --- | ---: | ---: | ---: | ---: | ---: |
| R0 冻结 LG01 基线 | 14.3234% | -6.6974% | 6.6974% | 7811.9921 | 2266.8395 |
| D1 冻结 CHAM01 B3 原始诊断（有限同案例） | 28.6024% | -17.1296% | 17.1296% | 15599.8346 | 2558.8837 |
| R1 HPSR01 raw candidate | 14.2019% | -8.7333% | 8.7333% | 7745.7689 | 2319.9414 |

- R1 相对 R0 paired FVA：0.8477%
- D1 相对 R0 paired FVA：-99.6909%
- R1 作品 cluster bootstrap 95% 区间：[-18.3441%, 20.0303%]
- R1 absolute bias 相对 R0 恶化：2.0358%；预冻结 unsupported 门限为超过 2.0000%，本次已触发。
- 改善时间块：1/1；单时间块不足以形成 supported 判断。

## 现金带诊断

每个模型单元依次为 WAPE / signed bias / MAE / 对总体 absolute error 的贡献。

| 现金带 | 作品数 | actual cash share | R0 | D1 | R1 | clip 数/比例 | D1 nonfinite 数/比例 | numeric fallback 数/比例 | R1 raw coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| H50 | 5 | 55.5497% | 9.2724% / -6.9041% / 32025.3826 / 35.9607% | 31.4383% / -19.0333% / 108583.1490 / 61.0573% | 9.2724% / -6.9041% / 32025.3826 / 36.2681% | 0 / 0.0000% | 0 / 0.0000% | 0 / 0.0000% | 100.0000% |
| M30 | 19 | 26.1260% | 21.9169% / -8.4475% / 9368.9283 / 39.9767% | 27.7447% / -17.3561% / 11860.1451 / 25.3425% | 24.6987% / -14.3102% / 10558.0815 / 45.4359% | 2 / 10.5263% | 0 / 0.0000% | 0 / 0.0000% | 100.0000% |
| L20 | 33 | 18.3243% | 18.8088% / -3.5758% / 3246.8788 / 24.0626% | 21.2287% / -11.0359% / 3664.6082 / 13.6002% | 14.1800% / -6.3271% / 2447.8293 / 18.2960% | 5 / 15.1515% | 0 / 0.0000% | 0 / 0.0000% | 100.0000% |

- D1 nonfinite：0；本次没有触发 numeric fallback。
- R1 raw coverage：100.0000%
- 最大单作品误差集中度（R0/R1）：28.7559% / 29.0017%
- top 5 误差集中度（R0/R1）：52.4423% / 59.1245%
- top 10 误差集中度（R0/R1）：69.4890% / 75.8581%

## K2 与 final holdout

- first independent later-origin：2026-03
- 所需完整至：2026-06
- 当前权威完整至：2026-04
- 缺失或不完整月份：2026-05、2026-06
- prospective final holdout：2026-06，仍未打开。

## 执行计数与治理

- 新模型训练：0；冻结公式 origin-faithful refit：1。
- 模型选择、调参、alpha 搜索、residual bound 重估：均为 0。
- 完整回溯评价：1；独立 K2：0；final holdout：0。
- activeCandidate：false；approvedForAutomation：false；productionReady：false。
- Draft PR #35 保持 Open / Draft / Unmerged。
