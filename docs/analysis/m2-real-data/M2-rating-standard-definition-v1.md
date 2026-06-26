# M2 Rating Standard Definition v1

- Candidate version: `m2-realdata-dev-rating-standard-v1.0`
- Purpose: define rating as a layered business assessment, not a single copyright-expiry flag

| Rating | Definition |
|---|---|
| S+ | 历史收入或预测价值处于顶级，收入模式可信且权利可运营或有明确续约价值；必须人工确认。 |
| S | 高历史价值或高预测价值，收入模式可信，预测置信度中高，无严重数据阻断。 |
| A | 明显有业务价值，稳定收入、增长或买断后仍有实销尾部，可作为重点复核对象。 |
| B | 中等价值，可维持运营或观察，历史或预测至少有一项支撑。 |
| C | 低至中等价值，建议保守处理，需要结合权利、收入模式和风险判断。 |
| D | 低价值或明显衰退，但不等于必须下架，可降低投入或观察。 |
| E | 历史和预测均极低、长期无收入、且无买断保留价值或续约价值；不得仅因版权到期触发。 |

- Expired handling: copyright expiry affects currentRightsStatus and operationalDecisionRating, but never directly rewrites historicalPerformanceRating to E
- Buyout handling: pure_buyout is evaluated by historical amount concentration and retained rights/value evidence; it is not automatically high-rated without amount support
- Unknown revenue model handling: unknown revenue model lowers automatic operating action strength but does not erase historical revenue value

M3 remains blocked until user/business acceptance of this M2 candidate.