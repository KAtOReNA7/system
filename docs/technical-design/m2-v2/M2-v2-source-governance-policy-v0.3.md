# M2 v2 Source Governance Policy v0.3

## 三层资格

`pilotUsable` 只允许 V2-B 质量评估和 private 中文人工抽检。terms/legal 可以保持 pending，但来源必须来自批准的 Tavily provider、为 HTTPS、非 prohibited，且 entity、sourceId、time、conflict、private leak 和 historical backfill 检查全部通过。

`researchApproved` 预留给未来 prospective shadow，本轮全部为 `false`。`modelEligible` 预留给未来训练，本轮全部为 `false`。Pilot 可用不构成任何自动提升。

## Candidate Registry

实际观察到的 domain 仅进入 Git-ignored private Research Candidate Registry，记录首次观察时间、provider、候选来源类型、结果数、pilotUsable 数和 pending 审核状态。Public 报告只输出类别与数量，不输出 domain 列表。

## Prohibited

自动拒绝非 HTTPS、短链、文件分享/网盘、登录后私有页、绕过付费墙或验证码、个人私密信息、不可解析域名、无 URL、明显恶意/赌博/色情/诈骗/垃圾域名、无来源 AI 摘要和模型自行生成 URL。

本政策仅为 prospective pilot，`full160Authorized=false`。
