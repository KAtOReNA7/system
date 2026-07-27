# M2 评价合同第二版验证（M2 Evaluation Contract v2 validation）

## 决定

评价合同第二版保持草案，验证状态为
`DRAFT_VALIDATED_REVISION_REQUIRED`，不是 `ACTIVE`。

冻结预测证明下列设计可以可靠实现：

- 同一可比组、同案例的 WAPE、signed/absolute bias、MAE、中位数和误差分位；
- raw candidate、selected pipeline、operational fallback 分离；
- 配对绝对误差、绝对/相对 FVA 和作品聚类 bootstrap；
- origin、horizon、连续时间块、生命周期/间歇状态、后验 top-revenue 归因；
- 已保存概率时的 Brier、log loss、reliability、PR-AUC、辅助 ROC-AUC 和阈值矩阵；
- 已保存条件金额与独立 reversal 时的条件金额评价；
- 已保存真实分位时的 WIS、CRPS 近似与覆盖率；
- 组合 origin×horizon 评价，以及作品级与组合级结果的并列展示。

## 激活前必须修订

1. 合同必须明确 occurrence actual 使用独立正发生事实；存在 reversal 时不得用最终
   net actual 的正负替代。
2. conditional amount 必须绑定 `actualPositive`、独立
   `conditionalPositiveAmount` 和独立 reversal；通用最终 point 子集继续禁止
   冒名。
3. 分位网格必须来自冻结 artifact schema。本次真实网格为
   `0.05/0.10/0.20/0.50/0.80/0.90/0.95`，不能套用默认 0.25/0.75。
4. MASE 只有具备严格 origin 前 scale 才可报告；全零分母 cell 必须返回
   `UNDEFINED_ZERO_ACTUAL_DENOMINATOR`，不得造数。
5. 作品级 bootstrap 以作品为 cluster；组合级 bootstrap 以 origin 为 cluster。
6. 连续时间块定义为相邻 calendar origin 的最大连通块；相邻月份不能冒充独立
   时间证据。
7. origin 时收入规模带必须是冻结输入字段。未来 actual 只能定义后验 top-revenue
   归因，不能进入选模分层。
8. Model Registry 绑定必须显式区分 stable model、experiment arm 和 selected
   pipeline variant，不能为 selected pipeline 伪造 stable model ID。
9. 排序和业务损失敏感性保持 diagnostic；未授权业务 horizon/cost 权重前不进入
   晋升 gate。
10. 公共 cell 必须同时满足至少 30 案例、20 作品；组合 cell 至少 5 origins，
    否则使用 `SUPPRESSED_PRIVACY_THRESHOLD`。

## 验证发现

第二版相对第一版的实质增量是“解释失败结构”，不是“把失败模型改判成功”：

- MAE 与中位绝对误差的数量级差异显示重尾风险；
- top actual 归因显示池化 WAPE 对长尾作品的遮蔽；
- TSB/生命周期发生指标显示高 base-rate 条件下 PR-AUC 很高但 specificity 较低；
- 渠道倍率专家存在有限排序信号，但现金点预测严重失准；
- 人工锚定原始分位的覆盖率接近 nominal，构成可保留的风险能力证据；
- 组合 ETS 的相对收益随 horizon 反转。

这些发现支持继续迭代合同，不支持模型角色变更、自动化批准或 release。

## 实现状态

可复用评价代码位于 `src/domain/m2Current/evaluationV2.js`，受控 runner 位于
`scripts/m2-current/run_m2_evaluation_v2_frozen_rescore.mjs`。它们没有接入现有
production loader、route、API 或 gate。命令被登记为 restricted-local，必须依赖
所属 private capability 与明确授权。

结论码：`EVALUATION_CONTRACT_V2_DRAFT_VALIDATED_REVISION_REQUIRED`
