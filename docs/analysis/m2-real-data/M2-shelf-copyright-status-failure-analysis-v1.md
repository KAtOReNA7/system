# M2 货架/版权状态失败原因分析 v1

生成日期：2026-06-27

本报告只做 M2 readiness 诊断，不进入 M3，不写正式主数据，不修改收入模式、评级规则或运营建议输出。报告只包含聚合统计和证据路径，不包含真实作品名、作者名、渠道名或原始账单明细。

## 结论

当前货架/版权状态还不能支撑进入 M3。主要原因不是收入模式或评级层，而是版权到期、作品状态、音频版权状态和显式货架状态缺口仍未闭环。

| 项目 | 当前状态 | 结论 |
|---|---:|---|
| 全库作品数 | 3054 | M2 本地候选基线范围 |
| unknown_shelf_status | 630 | 仍偏高 |
| 其中版权到期缺失导致 | 538 | 主阻断 |
| 版权仍有效但收入信号稀疏/陈旧导致 unknown | 92 | 规则缺少复核桶 |
| explicit confident shelf status | 0 | 缺少正式 shelf/work status 输入 |
| 版权到期且近 12 月仍有收入 | 142 | 应作为复核提示，不应直接覆盖版权状态 |

## 当前状态分布

| 状态 | 数量 | 说明 |
|---|---:|---|
| active_on_shelf_confident | 0 | 当前没有正式显式货架状态来源，无法 confident |
| active_or_available_inferred | 2125 | 由版权有效和收入信号推断 |
| likely_off_shelf | 72 | 版权状态未知且长期无收入的弱推断 |
| rights_expired_likely_off_shelf | 227 | 版权到期优先按台账信任处理 |
| off_shelf_but_tail_revenue | 0 | 当前候选规则不再用尾部收入覆盖版权状态 |
| unknown_shelf_status | 630 | readiness 主问题 |

## unknown_shelf_status 来源

| 来源 | 数量 | 判断 |
|---|---:|---|
| 缺版权到期，版权状态未知 | 538 | 数据 readiness 阻断 |
| 版权仍有效但近期收入信号不足 | 92 | 可通过新增复核状态改善 |

538 个 unknown 直接受版权到期缺失影响。剩余 92 个不是版权缺失，而是“版权仍有效，但当前收入信号不足以满足 active inference 阈值”。这类样本不适合直接判定下架，更适合进入人工复核桶。

## 零收入是否被错误当成下架

当前规则没有简单使用“零收入 = 下架”。

| 检查项 | 数量 | 结论 |
|---|---:|---|
| 版权仍有效的样本 | 2217 | 基准 |
| 版权有效且近 12 月实销为 0 | 408 | 不应自动下架 |
| 其中仍归为 active_or_available_inferred | 404 | 边界基本正确 |
| 其中归为 unknown_shelf_status | 4 | 需复核，但不是大面积错误 |
| likely_off_shelf 且零收入 | 72 | 主要还伴随版权状态未知/长期无收入 |

## 到期仍有尾部收入

当前发现 142 个“版权到期但近 12 月仍有收入”的聚合样本。按照现行口径，版权台账优先可信，尾部收入不应直接推翻到期状态；但这些样本应在后续报告中显式标记为“到期后收入复核提示”。

现有 `off_shelf_but_tail_revenue` 状态为 0，是因为当前候选规则不再用该桶覆盖版权状态。后续可以把它改为复核提示字段，避免误解为“没有到期后收入风险”。

## 算法可修项

| 项目 | 优先级 | 建议 |
|---|---|---|
| active rights sparse/old revenue 进入 unknown | 中 | 新增 `active_rights_sparse_revenue_review` 之类的复核桶 |
| 到期仍有收入只在聚合里可见 | 中 | 输出 `expired_with_tail_revenue_review` 提示，不覆盖版权状态 |
| `off_shelf_but_tail_revenue` 旧状态名易误解 | 低 | 后续改为 review note 或废弃 |
| confident shelf status 为 0 | 高 | 需要正式 workStatus/shelfStatus 来源，不是纯算法可解决 |

## 非算法数据缺口

| 缺口 | 数量 | 是否阻断 formal readiness |
|---|---:|---|
| 版权到期 | 610 | 是 |
| 作品状态 | 3054 | 是 |
| 音频版权状态 | 3054 | 是 |
| 一级分类 | 3054 | 是 |
| 二级分类 | 3054 | 是 |
| 必要标签 | 3054 | 是 |

## 证据路径

- `docs/analysis/m2-real-data/M2-shelf-status-inference-v1.json`
- `docs/analysis/m2-real-data/M2-business-readiness-after-dual-source-staging-v1.json`
- `docs/analysis/m2-real-data/M2-forecast-output-type-after-dual-source-staging-v2.json`
- `docs/analysis/m2-real-data/M2-revenue-model-classification-v2.json`
- `src/domain/oldProductEvaluation/shelfStatusInference.js`

