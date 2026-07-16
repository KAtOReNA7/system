# M2 C2 其他或新增渠道残差审计 v1

通用 residual 预测现金合计为 0.00；已知渠道 matched actual coverage 为 83.7738%。原始浮点最大 work point 对账差为 0.0000001100 元，仅作为诊断保留。

货币对账现将差额以 Decimal 按 0.01 元、ROUND_HALF_UP 量化为整数分，并要求分值精确等于 0；最大差异为 0 分，逐 case 不一致数为 0。这不是扩大金额容差，任何 1 分差异仍会失败。

residual 参数只来自 strictly-earlier origins，不读取当前 outer truth，不记忆作品未来渠道，不伪造真实渠道名称，也不与已知渠道现金重复。公开报告不含渠道标识或区间端点。
