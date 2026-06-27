# M2 shelf status review bucket update v1

生成日期：2026-06-27

本报告为公开脱敏 summary，不包含真实作品名、作者名、渠道名、原始账单行或原始台账行。本轮只做货架/版权状态 review bucket 小修，不改收入模式、不改评级、不恢复自动运营建议、不进入 M3。

## 小修结论

| 项目 | 结果 |
|---|---|
| 新增 `active_rights_sparse_revenue_review` | 是 |
| 新增 `expired_with_tail_revenue_review` prompt | 是 |
| 是否扩大自动下架判断 | 否 |
| 是否改收入模式 | 否 |
| 是否改评级规则 | 否 |
| 是否恢复自动运营建议 | 否 |
| 是否进入 M3 | 否 |

## 状态变化

| 指标 | 小修前 | 小修后 |
|---|---:|---:|
| unknown_shelf_status | 630 | 538 |
| active_rights_sparse_revenue_review | 0 | 92 |
| expired_with_tail_revenue_review prompt | 0 | 142 |

`active_rights_sparse_revenue_review` 只表示版权有效但收入信号稀疏/陈旧，需要复核货架或可运营状态；它不等于 confident on-shelf，也不等于 formal ready。

`expired_with_tail_revenue_review` 只作为复核提示：版权台账仍优先可信，到期状态不因尾部收入被覆盖。

## 保持不变的边界

- 收入为 0 不能单独判断下架。
- 版权到期仍优先作为权利到期信号。
- 没有 explicit shelf/work status 时，不伪造 `active_on_shelf_confident`。
- 货架/版权状态不改写历史评级。
- 收入模式和评级模块不受本轮小修影响。

## 测试覆盖

- 版权有效但收入稀疏/陈旧 -> `active_rights_sparse_revenue_review`
- 版权到期但近 12 月仍有收入 -> `rights_expired_likely_off_shelf` + `expired_with_tail_revenue_review`
- 收入为 0 不单独判下架
- 没有 explicit shelf/work status 时不输出 `active_on_shelf_confident`
- 收入模式和评级模块不受影响

## formal readiness

formal readiness 仍 blocked。主要阻断仍是 610 个版权到期缺口、分类/标签缺口、作品状态缺口和音频版权状态缺口。当前小修只降低误导性的 unknown，不代表可以进入 M3。

