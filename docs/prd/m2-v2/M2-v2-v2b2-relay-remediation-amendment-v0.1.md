# M2 v2 V2-B.2 Relay Adapter Remediation Amendment v0.1

## 决策

本 amendment 只授权 V2-B.2 relay 兼容修复、Terra/Luna 公平 benchmark，以及在全部前置 gate 通过后的固定 10-work canary 重跑。它不授权 full 160、V2-C/V2-D、收入模型训练、B4 变更、final holdout、C4/M3 或 release。

上一轮 60 次 Terra 调用重新分类为：provider connectivity `PASS`（49/60）、provider contract compatibility `FAIL`（本地严格合同仅 12/60）、model evidence quality `NOT_EVALUATED`、full pilot authorized `false`。37 次 relay-success/local-failure 全部属于判别联合非活动字段未置空，不能据此判定 Terra 搜索能力失败；0 accepted evidence 也不得解释为 0 external signal。

## 两阶段合同

Stage 1 只执行 web search，输出有界事实摘要和 provider citation；不请求严格 JSON。Citation Adapter 在内存中从可信 carrier 生成 citation registry，并在丢弃 raw body 前只保存脱敏 shape fingerprint。

Stage 2 不启用 web search，只接收有界 search artifact 和 citation registry，输出严格 JSON。模型只能引用 `citationId`；URL、title 与 domain 由本地 registry 注入，模型不得重新声明或发明 URL。每条 candidate 还必须给出不超过 240 字符、可在该 citation 的 Stage 1 span 周边逐字定位的 `claimText`，且 structured value 必须能在 claimText 中核对。旧的“URL 必须逐字出现在 output text”规则被 provider annotation/span、局部 claim-support 与跨阶段 lineage 合同取代。

## 公平 benchmark

benchmark 严格复用既有 immutable 10-work canary 样本，不重抽 160、不改 seed、不替换失败作品。每部作品使用同一个预冻结合并 intent；Luna 与 Terra 使用相同 prompt、schema、token cap、timeout 和零自动重试，并按逻辑任务 hash 交错先后顺序，首发顺序严格 5/5 平衡。request key 与 cache 同时绑定 relay endpoint digest、模型、stage、prompt/schema/adapter version 和 immutable manifest；配置变化不得命中旧 cache。每臂 10 个逻辑任务、每任务两阶段，合计最多 40 次物理请求。

模型选择质量优先：先最小化本地 claim-support、citation-lineage、entity-identity 和 schema 错误，再比较 valid evidence work、已解析作品、citation-bound evidence、时间完整性与端到端合同成功；只有质量等价且 telemetry 完整时才用 token 与 p90 latency 破平，缺失值不得按 0 获益。升级模型只有在默认模型失败的至少两个固定作品上提供无新增错误的互补增量时才冻结，否则为 `null`。这里评估的是 pre-governance 的本地 citation/span 与精确实体支持，不声称已独立核实网页事实真伪，也不替代 source governance 或正式决策。

## Gate 与预算

每臂 connectivity、search contract、extraction contract、citation-bound work rate 均至少 80%，requested/returned model binding 必须 100%，且至少 8/10 paired works 可评估。任一条件失败即停止，不运行 canary。

全部前置 gate 通过后，才允许用单一冻结 default model 重跑原 10-work/60 logical-task canary；两阶段最多 120 次物理请求，零自动重试，不复用旧 v0.1 cache。V2-B.2 全任务最多 160 次物理请求。

无论技术结果如何，`fullPilotAuthorized=false`、`full160ExecutionAuthorizedByThisRun=false`、`full160Executed=false`。PR #7 必须保持 Draft/open，不自动合并。
