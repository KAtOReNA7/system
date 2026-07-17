# M2 v2 Canary 执行摘要 v0.1

## 结论

本轮严格执行 10 部 canary，不执行完整 160。Provider contract success rate 为 20.00%（relay 旧口径 81.67%），实体联合解析率为 0.00%；primary evidence candidate / accepted / rejected 为 109 / 0 / 109。

## 执行与质量

- canary：10 部，全部来自冻结 160 manifest，固定 seed，要求的覆盖维度均已满足；
- 真实作品 canary 请求：planned / dispatched / contract-success = 60 / 60 / 12（relay 旧口径 success 49），单作品最多 8；
- 本任务 provider 总调用：63（真实作品 60 + 独立 synthetic 3），总上限 100；
- citation：provider annotation observed 4；同一 output_text item 的 candidate alignment 0.00%；accepted alignment 不可评估；
- availableAt / eventTime 完整率：38.53% / 41.28%；
- token usage（已观测下界）：1404772；usage 已观测/缺失请求 54/9，完整性=false，完整总量=不可评估；relay 成本：provider_pricing_unavailable；
- latency p50 / p90：36165 / 60001 ms；
- repeat-5 raw-claim agreement：0.00%；admissible evaluable works=0。
- model assessment：本轮未中途换模型；Luna 的 3 次 synthetic 与真实 canary 负载不可比，不能据此作模型切换决定，且 citation pass=false。

## 边界

公开报告不含作品、作者、URL、域名、query 或内部标识。未执行 full 160，未训练模型，未修改 B4/PRD，未打开 final holdout，未进入 V2-C/V2-D/C4/M3，未 release；全部结果保持 `not_for_formal_decision`。
