# M2 出版行业渠道现金锚设计决策记录 v0.1

对象：出版行业渠道起点可见现金锚金额设计 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Design v0.1，
`M2-DESIGN-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01`）。

状态：预注册设计决策已冻结、实现未授权
（`M2_PSC02_ORIGIN_VISIBLE_CASH_ANCHOR_PREREGISTERED_IMPLEMENTATION_NOT_AUTHORIZED`）。

## 决策

1. **锚使用算术正现金尺度。** 采用 origin 前最近 12 个完整账单月的严格正分成现金
   月金额算术均值。PSC01 的失败首先来自 work-balanced `log1p` absolute center；继续
   使用几何或 log1p center 会把已确认的尺度错位带入新设计。
2. **不做时间衰减。** 当前没有 outcome-free 证据能在多个 decay rate 中作唯一选择。
   固定等权比在打开结果后选择半衰期更可审计；趋势由预注册 residual 特征承担。
3. **作品尺度先于 pool。** fallback 固定为作品×渠道、作品×机制、作品整体、渠道池、
   机制池、全局池。前三层保留作品自身量级；pool 的 8/6 works 门槛直接沿用
   `M2-PUBLISHING-SCALE-SUPPORT-01`，不根据候选结果调整。
4. **主 loss 采用 quasi-Gamma log-link。** 条件金额严格为正、方差随均值尺度变化；
   固定 `log(A)` offset 后，Gamma unit-deviance 对人民币尺度等变，并以算术 ratio 而非
   log ratio 的几何中心决定均值。只需要 conditional mean，因此不假装指定完整 Gamma
   likelihood 或 shape parameter。
5. **不允许运行时切换。** 锚定准 Gamma offset 主设计
   （Anchored Quasi-Gamma Offset Primary Design，
   `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P`）全局求解失败即没有候选输出；
   现金锚单独诊断和锚定对数比率岭回归诊断只能归因，不能接管候选身份。
6. **occurrence 使用 frozen pass-through。** development replay 直接按 case key 连接
   PSC01 frozen occurrence probability，并要求 IEEE-754 bit-for-bit 一致。这样唯一科学
   变化是 conditional positive amount。
7. **LG01 门禁使用现行强标准。** LG01 是健康冻结 same-case baseline，所以采用
   `config/m2-business-acceptance-contract.v1.json#/candidateSuperiority` 的九项 `AND`
   规则；不使用较弱的“WAPE 最多恶化 2%”备用条件。

## 明确拒绝的替代方案

- 从评价 actual 估计全局或逐作品 scalar；
- 把冲销、buyout、其他现金或公司补差并入正金额 anchor；
- 把 taxonomy 作为 prior、feature、fallback 或金额 multiplier；
- 读取 LG01 prediction 作为 anchor、offset、feature 或 calibration target；
- 对未来新增作品或首次出现渠道输出 0；
- 在 outer outcome 后修改窗口、fallback、estimator 或 regularization grid；
- 修改、覆盖、重命名或重新生成冻结 PSC01 artifact。

## 影响

公共代码只是一套纯函数 reference harness 和 contract validator，用于证明公式可实现、
尺度等变、as-of 安全且无重复乘法。它不连接 production/private runtime，也不是 PSC02
真实实现。模型 ID、真实拟合、评价和任何发布权限都必须等待另一项明确授权。
