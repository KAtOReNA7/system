# M2 最终基础表接入后的 readiness 重算 v1

## 结论

- 最终分类与标签基础表已接入本地 M2 评估集合，账单、基础表和评估结果均统一为 `3053` 部。
- 旧 `3054` 部口径的净差不是丢弃收入，而是一个历史分册身份在内存中归并到已确认标准作品；账单行数和收入金额均守恒。
- 收入模式和前台评级相对旧 checkpoint 只各减少一条被归并的 `纯实销 / E` 旧身份，其余档位不变；未发现模型规则回归。
- 分类与辅助标签可以进入本地分层统计；当前结果仍不是正式主数据或 M2 formal completion，M3 formal execution 仍未授权。

## 范围对账

| 项目 | 结果 |
|---|---:|
| 旧账单标准作品口径 | 3054 |
| 历史分册归并后口径 | 3053 |
| 最终基础表口径 | 3053 |
| 账单行数守恒 | 是 |
| 收入金额守恒 | 是 |

## 候选层重算

- 收入模式：`{"pure_sales_share": 2578, "pure_buyout": 287, "buyout_plus_sales": 183, "unknown_revenue_model": 5}`
- 前台评级：`{"E": 1948, "B": 358, "D": 356, "S": 117, "C": 152, "A": 84, "S+": 38}`
- 货架/版权推断：`{"confirmed_off_shelf": 755, "confirmed_on_shelf": 2298}`
- 复核桶：`{}`
- 相对旧 3054 checkpoint 的复核桶变化：`{"expired_with_tail_revenue_review": -142, "active_rights_sparse_revenue_review": -92}`。到期尾部收入增加 4 条源于按 PRD 恢复 Excel 底层完整金额精度，不将有效非零微额收入舍入为 0。
- 收入模式意外回归：`False`；前台评级意外回归：`False`。

## 当前工程边界

- 本次运行是否获得通过内容契约的逐作品 private 输入：`True`。文件存在本身不构成通过。
- 本次评估输入模式：`post_foundation_contract_verified_private_input`；版权到期不可用记录 `0` 个。
- private 输入契约问题：`[]`。这属于跨机器可重复性/正式输入快照缺口，不重新定义已经收口的业务基础字段决策。
- 两类复核已应用：`True`；已确认 `238` 条；仍待确认 `0` 条。
- 正式主数据尚未写入，mapping_version 未激活，formal input snapshot 与 task/export/release/audit 闭环尚未建立。

## PRD / M3 门禁

- M2 本地工程 checkpoint：`pass_with_contract_verified_private_input`。
- M2 formal complete：`False`。
- M3 本地 prototype 可继续：`True`。
- M3 formal execution：`False`。
- 用户已授权 M2 formal 操作；两类复核和逐作品 private 输入内容契约通过后，按正式基础信息版本/输入快照、mapping、formal evaluation、task/export/release/audit 的顺序推进。
- M3 formal execution 未获授权，代表性选题材料准备暂缓至 M2 收口后。

## 安全边界

- 公共报告仅包含聚合统计，不包含作品名、作者名、渠道名、账单行或逐作品收入。
- 逐作品 private 输入/输出只允许留在 Git 忽略的 private 区域，不得提交；公开仓库只保存恢复脚本、内容契约和脱敏聚合证据。
- 本轮未连接数据库、未写正式主数据、未激活 mapping_version、未进入 M3 formal execution。
