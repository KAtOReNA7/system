# M2 出版行业渠道起点可见现金锚实现就绪 v0.1

对象：出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
`M2-CHAN-PSC02`；raw variant `M2-CHAN-PSC02-RAW`）。

状态：核心已实现，等待执行前 exact-head 双平台 CI 与唯一受控开发重放
（`M2_PSC02_IMPLEMENTED_AWAITING_EXACT_HEAD_CI_AND_CONTROLLED_DEVELOPMENT_REPLAY`）。

## 已实现

- 现金锚单独诊断（Anchor Only Diagnostic，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D0`）只做尺度归因；
- 锚定对数比率岭回归诊断（Anchored Log-Ratio Ridge Diagnostic，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D1`）只做 loss/link 归因；
- 锚定准 Gamma offset 主设计（Anchored Quasi-Gamma Offset Primary Design，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P`）是唯一 raw candidate 设计；
- 冻结 PSC01 occurrence 按完整月度 case key 原样传递，逐位一致性与 exact-case coverage
  在真实预测形成时失败关闭；
- 18 个 origin-visible 特征、时间 basis、机制与重点平台结构复制自 PSC01，使用作品平衡
  权重、primary 嵌套作品折和 strict 嵌套时间起点选择；
- Gamma objective、gradient 与 Hessian 不使用 clip，`[-30,30]` 只作用于最终 residual
  prediction；child 稀疏或数值失败只回退最近 residual parent，不能切换诊断估计器；
- taxonomy 仍为 `REPORT_ONLY`，LG01 prediction 不进入 feature、anchor、offset 或拟合。

公共 synthetic 验证状态为
`M2_PSC02_PUBLIC_SYNTHETIC_IMPLEMENTATION_VERIFIED`：尺度等变因子 10、occurrence 与 anchor
均只应用一次，未读取 private row 或真实 outcome。

## 执行边界

只有提交并推送后的 exact HEAD 在 Draft PR 上同时取得 Linux/Windows 成功，才允许进入
唯一一次 `DEVELOPMENT_REPLAY`。执行前只允许元数据预检。首个完整主设计 raw result 一旦
形成必须冻结，之后禁止重跑或按结果改设计。

当前仍保持 `activeCandidate=null`、`approvedForAutomation=null`、
`productionReady=false`、`finalHoldoutOpened=false`。本记录不授权独立评价、later-origin、
final holdout、production、automation、release、数据库、API、provider 或财务使用。
