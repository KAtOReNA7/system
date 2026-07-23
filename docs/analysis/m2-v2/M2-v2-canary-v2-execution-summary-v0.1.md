# M2 v2 Canary v2 Execution Summary

## 结论

固定 10-work canary 已按 V2-B.3 两阶段合同执行；失败样本未替换，seed 与 manifest 未修改。Terra/Luna 使用相同 works、queries、prompt templates、token limits、timeout 与 extraction schema。

| Model | Search success | Resolved | Evidence coverage | High-value | Citation | availableAt | Repeat agreement | Tokens observed | p50/p90 ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 119826 | 28018/41721 |
| gpt-5.6-terra | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 0.00% | 122357 | 21762/23900 |

## Stage execution

| Model | Primary Search dispatched | Provider response | Web search observed | Search contract | Source records | Repeat provider errors | Extraction dispatched | Extraction blocked |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| gpt-5.6-luna | 10/10 | 10/10 | 10/10 | 0/10 | 0 | 1 | 0/10 | 10 |
| gpt-5.6-terra | 10/10 | 10/10 | 10/10 | 0/10 | 0 | 0 | 0/10 | 10 |

- provider dispatched requests: 30/60; 30 个 Extraction 计划因缺少 source records fail-closed blocked，未调用 provider
- private query logs / receipts / evidence / review workbook: generated, Git ignored, not committed
- full160: not executed
- model training: not performed
- V2-C/V2-D/C4/M3: not started
- final holdout: sealed
- status: `not_for_formal_decision`
