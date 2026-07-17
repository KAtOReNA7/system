# M2 v2 Source Allowlist v0.1

## 当前状态

Allowlist 已冻结为“空列表、fail-closed、待条款与法律评审”。这不是认为外部来源不可用，而是拒绝由实现者自行批准实际域名。任何真实采集前，域名条目必须记录 source tier、source class、terms class、允许的 evidence type、许可保存范围、批准人/时间和版本。

四级来源为 authoritative、reliable secondary、weak secondary 和 prohibited。只有显式 allowlisted 且已批准的 authoritative/reliable secondary，配合合法 terms、正确实体、known availableAt 和已解决冲突，才可能成为未来模型候选。

Search index 只作发现，不能单独形成事实或解决冲突。无来源生成内容、SEO 垃圾、未经授权个人敏感信息、登录后私有数据、不可审计摘要、未知条款和需绕过访问控制的页面全部 fail-closed。

当前 `approvedDomainEntries=[]`，所以本轮真实 provider acquisition 被阻断；不得用通用“官方/主流”标签绕过逐域名批准。
