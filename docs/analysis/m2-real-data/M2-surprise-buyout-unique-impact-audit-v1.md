# M2 surprise buyout 非重叠业务影响审计 v1

## 技术结论

冻结 authority snapshot 内存在可复核自然键，unique audit 状态为 **available**。唯一并集只表示 statistically scoreable development windows 中出现过的 classifier-derived surprise facts，不表示全库所有未承诺买断，也不是合同承诺事实。

## 重叠 backtest-window exposure

| 指标 | 结果 |
|---|---:|
| forecastable cash | 82206415.70 |
| surprise cash | 5517115.15 |
| ledger cash | 87723530.85 |
| positive windows | 466 |
| overlap share | 6.2892% |

## 非重叠唯一账单并集

| 指标 | 结果 |
|---|---:|
| unique ledger facts | 168 |
| unique event cells | 154 |
| involved works | 114 |
| unique amount | 1442698.00 |
| complete-month ledger cash | 126794638.17 |
| unique exposure share | 1.1378% |
| unsafe dedup amount | 0.00 |

## 身份、方法与限制

自然键为源账单 SHA、sheet 与 source row 的组合；row hash 只作内容校验。该身份仅在当前冻结 authority revision 内稳定，不能跨源文件重排或替换自动继承。作品/月/金额没有被用作 identity。same-batch 仅为 classifier signal，不等于买断合同确认。
