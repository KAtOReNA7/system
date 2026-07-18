# M2 v2 Source Record Schema v0.2

## 语义

Source Record v0.2 是 Search 与 Extraction 之间唯一的 provider-neutral 输入。`sourceId` 由 canonical HTTPS URL 的稳定摘要生成，不由模型生成，也不绑定 query 或 provider。

## URL 与文本

- 只接受 HTTPS，拒绝 userinfo 和明确短链域名
- 移除 `utm_*` 及少量明确安全的广告 tracking 参数
- 默认保留 `spm`、`from`、`source`、`ref` 和业务参数
- fragment 不参与资源身份
- snippet 直接来自 provider `content`，清除控制字符并最多保留 500 个 Unicode 字符
- 不保存网页全文，也不允许模型改写后冒充 provider snippet

## 时间与资格

本轮固定 `capturedAt=availableAt`，`availableAtBasis=first_observed_by_system`。这只表示系统本次首次可审计观察时间，不证明历史 cutoff 时可用。`eventTime` 未由 snippet 明确支持时为 `null`。所有记录均为 `researchOnly=true`、`modelEligible=false`。

旧 v0.1 annotation records 继续通过显式 adapter 转为 v0.2；历史合同和 digest 不被重写。
