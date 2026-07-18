# M2 v2 Luna/Terra Extraction Benchmark v0.1

## 结论

同一批 Source Records 的公平 Extraction Benchmark 判定为 **FAIL**。默认模型为 `none`，升级模型为 `none`。

| 模型 | schema | resolved | pilotUsable coverage | repeat agreement | p50 ms | tokens | hard gate |
|---|---:|---:|---:|---:|---:|---:|---|
| gpt-5.6-luna | 0/6 | 0/4 | 0.00% | 0.00% | 25001 | n/a | false |
| gpt-5.6-terra | 1/6 | 0/4 | 0.00% | 0.00% | 25000 | 29646 | false |

- benchmark works: 4
- repeat works: 2
- same Source Records verified: false
- quality before speed: true
- Luna status: fairness_gate_failed
- full160Authorized: false
- status: `not_for_formal_decision`
- 模型证据质量: EVALUATED
