# 出版行业渠道直接现金尺度条件金额模型 v0.1：唯一开发重放

对象：出版行业渠道直接现金尺度条件金额模型 v0.1（Publishing-Scale Channel Direct-Cash Conditional Amount Model v0.1，`M2-CHAN-PSC03`），原始候选（raw candidate，`M2-CHAN-PSC03-RAW`）。

状态：`PSC03_DEVELOPMENT_NOT_SUPPORTED`。本报告属于开发重放（`DEVELOPMENT_REPLAY`），不是独立评价、later-origin、final holdout、production 或财务使用证据。

## 核心结果

| 对象 | primary WAPE | strict WAPE | primary 预测/实际比 | strict 预测/实际比 |
|---|---:|---:|---:|---:|
| 算术层级诊断（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D0`） | 178.1610% | 265.5676% | 1.2647 | 2.2873 |
| 准 Gamma 方差族诊断（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D1`） | 93.7931% | 86.8537% | 0.9144 | 0.8833 |
| 准 Poisson 唯一原始候选（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P`；`M2-CHAN-PSC03-RAW`） | 54.2647% | 297.0822% | 0.8265 | 3.3527 |
| 冻结出版行业规模适配渠道核心（`M2-CHAN-PSC01-RAW`） | 92.4087% | 91.5333% | 0.1107 | 0.1459 |
| 冻结人工锚定可学习全局模型（`M2-WORK-LG01`） | 44.3100% | 41.2813% | 0.8783 | 0.9621 |

尺度假设：未通过（`DIRECT_CASH_SCALE_HYPOTHESIS_NOT_SUPPORTED`）。候选竞争力：`CANDIDATE_SUPERIORITY_CONTRACT_NOT_PASSED`。

尺度轴只通过了 primary 相对 PSC01 FVA、primary 预测/实际比和统一总额后的渠道构成检查；strict 相对 PSC01 FVA 与逐 horizon 预测/实际比未通过。strict H3 预测/实际比为 25.4492，WAPE 为 2488.7672%，是短周期严重放大的直接证据。候选竞争力的九项 AND 要求全部未通过；相对 LG01 的 primary FVA 为 -22.4658%，Core80 全要求周期作品级 bootstrap 95% 区间为 [-14.4218%, 1.8034%]。

## 关键分层诊断

- strict advertising 机制预测/实际比为 22.9942、WAPE 为 2284.8217%，而 strict membership 机制预测/实际比为 0.9664；短周期放大并非所有机制共同发生。
- primary 五个重点平台中，喜马拉雅（`ximalaya`）预测/实际比为 0.8206，番茄畅听（`fanqie_audio`）为 1.1117，猫耳（`missevan`）为 1.1749，微信读书（`wechat_reading`）为 0；漫播（`manbo`）因不足 30 个 case / 20 部作品而抑制。
- primary 父层回退（`POOLED_PARENT`）聚合预测为 0；有支持的收缩拟合层（`SHRUNK_FIT`）预测/实际比为 0.9337、WAPE 为 55.5407%。
- primary 13 个起点 WAPE 范围为 41.6669%–61.4106%；strict 11 个起点范围为 38.8683%–26591.5300%，最差起点为 2025-09。
- 未来实际现金前 5% / 10% 作品的 WAPE 分别为 43.4730% / 45.2441%；这是事后实际归因，不是候选选择证据。全部 horizon、起点、机制、平台、支持层级、头部作品与 Core80/Core90 聚合见同名机器 JSON。

## 完整性与边界

- 冻结 occurrence 与 3,318,819 行人口逐位一致，完整人口 exact coverage 通过；occurrence、层级 offset 与 horizon 汇总均只应用一次。
- 主候选原始预测先原子封存，随后才读取冻结 PSC01 与 LG01 比较器；fallback 与两个诊断臂均未覆盖原始候选。
- Core80 是硬门禁，Core90 仅为完整披露的敏感性人口；平台、机制、支持层、起点与 horizon 聚合不足隐私门槛的单元均标记 `SUPPRESSED_PRIVACY_THRESHOLD`。
- 统一作品实际总额后的渠道构成仅为 `POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE`。
- `activeCandidate=null`、`approvedForAutomation=null`、`productionReady=false`、`finalHoldoutOpened=false`。
