# M2 OA03 与 LG01 核心老品误差归因报告 v0.1

本报告在相同 actual、origin、horizon、人口和 case key 下比较作品发生—金额校准
模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）与人工锚定
可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）。Strict
rolling 是主要证据；Primary rolling 的 canonical LG01 仍是 36 个月跨作品合同，
因此 3/6/12 月主要参考保持不可评价，没有伪造。

## Strict 同案例摘要

| 人口 | 周期 | OA03 WAPE / bias | LG01 WAPE / bias | OA03 相对 FVA | 同案例数 |
|---|---:|---:|---:|---:|---:|
| CORE80 | 3 月 | 0.374801 / -0.151588 | 0.258167 / -0.026902 | -45.18% | 577 |
| CORE80 | 6 月 | 0.381191 / -0.119813 | 0.275076 / 0.009543 | -38.58% | 577 |
| CORE80 | 12 月 | 0.435475 / -0.066970 | 0.315749 / 0.064270 | -37.92% | 472 |
| CORE90 | 3 月 | 0.396707 / -0.137717 | 0.280318 / -0.042439 | -41.52% | 1288 |
| CORE90 | 6 月 | 0.403069 / -0.099350 | 0.295041 / 0.000169 | -36.61% | 1288 |
| CORE90 | 12 月 | 0.460315 / -0.035216 | 0.337889 / 0.064165 | -36.23% | 1053 |

## 九个归因问题

1. OA03 相对 LG01 的损失是否主要来自统一金额 scale：`JOINT_SCALE_IS_A_CONFIRMED_STRUCTURAL_LIMITATION_AND_AMOUNT_ERROR_DOMINATES`。
2. 3/6/12 共用拟合结构是否造成周期错配：`HORIZON_MISMATCH_SUPPORTED_BY_SEPARATE_HORIZON_ERROR`。
3. 哪些 origin-visible 收入带贡献主要绝对误差：`SEE_FIXED_ORIGIN_VISIBLE_DIMENSION_GROUPS`。
4. 是否主要为系统性低估：`YES_STRICT_CORE80_ALL_HORIZONS_UNDERPREDICT`。
5. 是否存在少数极端作品主导：`YES_TOP10_PERCENT_WORKS_EXCEED_HALF_ABSOLUTE_ERROR`。
6. 起点趋势、同比和峰值距离是否形成可重复误差分层：`REPEATABLE_ORIGIN_VISIBLE_STRATIFICATION_PRESENT`。
7. Core80 与 Core90 方向是否一致：`YES_OA03_WORSE_THAN_LG01_IN_BOTH_POPULATIONS`。
8. 是否有合法充足训练行拟合分周期金额模型：`YES_LEGAL_ROWS_AVAILABLE`。
9. LG01 是否能在所有合法 Strict cell 同案例重建：`YES_ALL_LEGAL_STRICT_CELLS_RECONSTRUCTED`。

所有误差带均由 forecast origin 已知信息固定生成；未来真实排名、未来渠道、评价期
收入、结果后阈值、三级分类和公司缺口均未参与分组、训练、选择或路由。

Primary 的缺失比较保持 `null`，没有写成 0。公开文件只含达到隐私阈值的聚合，
不含作品身份、渠道身份、私有路径、缓存或凭据。
