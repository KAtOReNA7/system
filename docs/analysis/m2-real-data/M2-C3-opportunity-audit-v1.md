# M2 C3 机会审计 v1

本审计仅使用冻结 development 人口中的 B4 聚合误差结构，覆盖 7851 个模型人口 case、824 部作品。分组结果只作描述，不使用 outer actual 创建规则。

审计维度完整覆盖 origin、horizon、route、activity segment、cutoff 历史长度、正值/零值月份、正值/零值比例、趋势、波动、已知渠道数、渠道集中度、B4 收入规模和 Top1/5/10 高价值带；source、lifecycle、rights/shelf 仅作 post-hoc 审计。

- 强制保持 B4：无 cutoff 销售历史、历史不足 12 个完整月、严格更早 inner-origin 支持不足、特征或拟合非有限、修正超过冻结 cap。
- 可修正机会：销售现金路由、历史至少 12 个完整月、有严格更早 inner-origin 支持、仅使用白名单 cutoff 特征且修正在 cap 内。
- 无安全信号：身份、真实渠道、当前评级/生命周期/版权/货架、无历史快照的 source/rights/shelf、未来或 outer outcome、小样本受抑制分组。

结果为 `not_for_formal_decision`。final holdout、embargo shadow、deferred 60-month labels 均未打开。
