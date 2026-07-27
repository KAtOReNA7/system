# M2 channel/mechanism hierarchical challenger v0.1

## 结论先行

本轮按预注册完成 work-channel 物化、learnedGlobal 逐渠道守恒分解、三类机制专家、
五个平台模型、平台专属作品分类 taxonomy、hierarchical shrinkage 和 A0–A6
全量评估。结论为 **CHANNEL_EXPERT_DEVELOPMENT_FAIL_KEEP_LEARNEDGLOBAL_AND_EXACT_V0_3**；完整成熟度仍为
**M2_NOT_MATURE**，exact v0.3 fallback、CANARY_FAIL 和
AUTOMATION_BLOCKED 均未改变。

## 数据与防泄漏

- 作品级 primary case：12039；
  strict 辅助 case：97490。
- work-channel 标签：387175；
  三项守恒差均为 0。
- 99261
  个未来首次出现渠道标签只用于误差归因，预测为 0，渠道身份没有进入特征。
- 买断、2021 年前现金、2025 年后现金、未成熟标签补 0、later-origin、
  final holdout、provider 和数据库均未使用。

## A0–A6 完整结果

| Ablation | 定义 | primary WAPE | primary bias | 相对 A0 | strict WAPE | strict bias | 相对 A0 |
|---|---|---:|---:|---:|---:|---:|---:|
| A0 | learnedGlobal_work_baseline | 0.44022495 | -0.12377106 | 0.00% | 0.41191878 | -0.03847401 | 0.00% |
| A1 | exact_learnedGlobal_channel_decomposition_recomposition | 0.44022495 | -0.12377106 | 0.00% | 0.41191878 | -0.03847401 | 0.00% |
| A2 | raw_membership_advertising_transactional_experts | 0.44893186 | -0.04262673 | 1.98% | 0.41847102 | -0.01612311 | 1.59% |
| A3 | mechanism_calibrated_experts | 0.45885403 | -0.08161723 | 4.23% | 0.54680086 | 0.24602743 | 32.74% |
| A4 | five_platform_partial_pooling | 0.45901148 | -0.07957886 | 4.27% | 0.59230448 | 0.30641822 | 43.79% |
| A5 | platform_specific_intrinsic_category_taxonomy | 0.58080898 | -0.14853127 | 31.93% | 0.66353355 | 0.35974293 | 61.08% |
| A6 | nested_selected_hierarchical_shrinkage | 0.53776683 | -0.12709804 | 22.16% | 0.65865324 | 0.35717601 | 59.90% |

A0 与 A1 的最大绝对差为
0（strict 为
0），证明 learnedGlobal 的渠道分解
与重组严格守恒。A6 的 shrinkage strength 只由每个 outer training 内的确定性
inner work holdout 选择；outer validation、exact v0.3 和 sealed 数据未参与。

## 五个平台 × 三类机制覆盖与回退

| 平台 | 机制 | primary channel case | strict channel case | primary A6 路由 | strict A6 路由 |
|---|---|---:|---:|---|---|
| ximalaya | membership | 10577 | 67891 | {"hierarchically_shrunk_taxonomy":10577} | {"hierarchically_shrunk_taxonomy":67891} |
| ximalaya | advertising | 0 | 0 | {} | {} |
| ximalaya | transactional | 0 | 0 | {} | {} |
| ximalaya | learnedGlobal | 0 | 0 | {} | {} |
| wechat_reading | membership | 0 | 10001 | {} | {"hierarchically_shrunk_mechanism":1125,"hierarchically_shrunk_platform_x_mechanism":961,"hierarchically_shrunk_taxonomy":7915} |
| wechat_reading | advertising | 0 | 0 | {} | {} |
| wechat_reading | transactional | 0 | 0 | {} | {} |
| wechat_reading | learnedGlobal | 0 | 0 | {} | {} |
| fanqie_audio | membership | 0 | 0 | {} | {} |
| fanqie_audio | advertising | 3540 | 22204 | {"hierarchically_shrunk_taxonomy":3456,"hierarchically_shrunk_platform_x_mechanism":84} | {"hierarchically_shrunk_taxonomy":20924,"hierarchically_shrunk_platform_x_mechanism":1280} |
| fanqie_audio | transactional | 0 | 0 | {} | {} |
| fanqie_audio | learnedGlobal | 0 | 0 | {} | {} |
| missevan | membership | 0 | 0 | {} | {} |
| missevan | advertising | 0 | 0 | {} | {} |
| missevan | transactional | 379 | 2162 | {"hierarchically_shrunk_platform_x_mechanism":189,"hierarchically_shrunk_taxonomy":190} | {"hierarchically_shrunk_platform_x_mechanism":231,"hierarchically_shrunk_taxonomy":1931} |
| missevan | learnedGlobal | 0 | 0 | {} | {} |
| manbo | membership | 0 | 0 | {} | {} |
| manbo | advertising | 0 | 0 | {} | {} |
| manbo | transactional | 43 | 562 | {"hierarchically_shrunk_mechanism":43} | {"hierarchically_shrunk_mechanism":195,"hierarchically_shrunk_taxonomy":367} |
| manbo | learnedGlobal | 0 | 0 | {} | {} |

细分类样本不足时按
taxonomy → platform×mechanism → platform → mechanism → learnedGlobal
自动回退，所有 A0–A6 仍继续运行；公开产物不包含作品分类值、作品 ID 或渠道 UID。

## Top-revenue

| 收入层 | primary 作品 | primary A0 | primary A6 | primary 相对 | strict 作品 | strict A0 | strict A6 | strict 相对 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| top 1% | 12 | 0.21139493 | 0.38885953 | 83.95% | 27 | 0.16492920 | 0.35584053 | 115.75% |
| top 5% | 57 | 0.28610442 | 0.42039498 | 46.94% | 133 | 0.25168161 | 0.50564311 | 100.91% |
| top 10% | 113 | 0.31951057 | 0.44417879 | 39.02% | 265 | 0.25829057 | 0.50598434 | 95.90% |

## 门禁

- workChannelConservation: PASS
- A0A1DecompositionConservation: PASS
- primaryMaterialRelativeWape: FAIL
- strictMaterialRelativeWape: FAIL
- primaryAbsoluteWape: FAIL
- primaryAbsoluteBias: FAIL
- laterOriginIndependent: FAIL

本报告只陈述 raw preregistered development 结果。即使某层回退或 A6 被选择，
A0–A6 原始指标仍全部保留；没有用 post-hoc fallback 覆盖失败候选。
