# M2 业务验收合同 v1 与 H36 冻结基线验证

## 1. 身份与授权边界

本文件解释机器合同
`config/m2-business-acceptance-contract.v1.json`。该 JSON 是 M2 开发业务验收
数值的唯一权威；本文只提供中文解释和验证记录。

本合同只适用于开发评价（`DEVELOPMENT_EVALUATION_ONLY`），不授权生产、
自动化、发布、财务承诺、HPSR02 独立评价、HPSR03 开发或 M3 正式执行。本轮
不训练、不拟合、不调参、不选择或晋升模型。

## 2. 当前 M2 范围

评价对象仍是预测起点时至少已有 3 个完整账单月的成熟老作品，以及该作品在起点时
已经成熟的已有 canonical 渠道；目标是未来分成收入现金，并使用当前开发可建模冲销
重述 actual（`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。

动态 Core80 是硬门禁人口，动态 Core90 是必须完整披露但通常不否决 Core80 的敏感性
人口。Core90 的非有限值、负预测、数值爆炸或其他合同非法输出仍单独构成数值/合同
失败。未来新作品、未来首次渠道、Core80 外长尾、买断、其他非分成现金和公司收入
补差均不属于当前 M2。

## 3. 业务可用性门限

| 周期 | Core80 WAPE 上限 | Core80 绝对 signed bias 上限 | 当前合同状态 |
|---|---:|---:|---|
| H3 | 0.30 | 0.10 | 仅开发评价已激活 |
| H6 | 0.32 | 0.10 | 仅开发评价已激活 |
| H12 | 0.35 | 0.12 | 仅开发评价已激活 |
| H36 | 0.40 | 0.12 | 等待首次合法精确重建 |

H60 只保留为未来 M3 新品预测的低置信成熟目录情景参考，不参加当前 M2 门禁或排名，
本合同也不实现 H60 模型或预测未来具体新作品。

## 4. 业务可用性与候选优越性

业务可用性只回答绝对误差是否落入业务可接受范围。候选优越性必须在相同 actual、
人口、周期、评价家族和精确同案例上，同时满足机器合同列出的全部九项要求；组合规则
已经固定为 `AND`，不是 `OR`。

其中包括至少 1% paired actual 归一化绝对误差减少、2,000 次整作品聚类 bootstrap
改善区间下界大于 0、对应周期偏差门限、Core80 H50 不恶化、最大作品与 Top10
误差占比不恶化、L20 不得掩盖 H50 损失、每起点误差减少中位数大于 0，以及不重叠
时间证据要求。relative FVA 仅作诊断；人民币减少必须报告，但没有武断固定人民币
门槛。

滚动起点的人民币量只允许称为“滚动预测决策误差减少（aggregated
forecast-decision error reduction）”，不得解释成公司实际节省、唯一现金收益、
财务利润或未重复业务价值。

## 5. 时间证据与现金带

相邻滚动起点的 future-actual 窗口重叠时不算独立证据。稳定支持至少需要 2 个
不重叠窗口、不重叠窗口 actual-cash-weighted 通过率至少三分之二，并且每起点
absolute-error reduction 中位数大于 0。证据不足时使用
`INDEPENDENT_TIME_EVIDENCE_INSUFFICIENT`，不得写成通过或失败。

H36 可以把多历史起点用于仅开发硬门禁，但永久携带
`HISTORICAL_MULTI_ORIGIN_NOT_PROSPECTIVE_VALIDATION`。

H50/M30/L20 只在每个起点的动态 Core80 内，用该起点可见的 trailing-12 分成现金
划分。跨越边界的整部作品留在较高现金带；不得读取未来 actual；Core90 不定义第二套
现金带。

## 6. H36 可移植重建设计

可移植入口是：

```text
npm run recover:m2:current:business-acceptance-h36
```

入口从运行时仓库根、当前分支、当前 HEAD 和当前 Draft PR 动态解析环境，并要求该
HEAD 已通过 Linux/Windows CI。它从不可替代源权威重建冲销权威、LG01 历史特征和
原始 H36 案例，使用公开冻结的 LG01 五折参数和确定性作品折分生成基线；不会读取旧
human evaluation、frozen rescore 或历史 receipt 缓存，也不会拟合模型。

H36 精确行和 manifest 只写入 Git ignored 的
`data/private-output/m2-business-acceptance-contract-v1/`。公开合同和本文只保留
脱敏聚合。缺少派生缓存时自动重建；缺少历史 provenance 只告警；只有
`PRIVATE_SOURCE_AUTHORITY` 缺失才阻断。

## 7. 当前验证状态

合同字段、四周期门限、人口角色、候选优越性 `AND` 语义、时间独立性、现金带、
private artifact 分类和授权边界已进入实现与合成测试。首次合法 H36 私有重建尚未
执行，因此当前 H36 状态仍为 `PROVISIONAL_NOT_ACTIVE`。首次完整结果形成后，本节
将冻结记录 Core80/Core90 聚合复现、H50/M30/L20 证据和 exact-head CI。

当前机器状态码：
`M2_BUSINESS_ACCEPTANCE_CONTRACT_V1_H36_RECONSTRUCTION_PENDING`。
