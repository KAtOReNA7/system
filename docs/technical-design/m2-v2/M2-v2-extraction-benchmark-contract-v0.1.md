# M2 v2 Luna/Terra Extraction Benchmark Contract v0.1

## 固定样本与同源公平

Benchmark 在任何 provider 结果出现前，从原固定 10-work Canary 的预注册元数据中确定性选择四部作品，并固定其中两部做独立 Repeat Extraction。Luna 与 Terra 对每部作品消费完全相同、digest 相同的 Source Records；Repeat 不重新搜索，也不复用第一次模型输出。

两模型使用相同 prompt、strict schema、source order、max output tokens、timeout、retry、reasoning 参数和 adapter。每模型固定六个逻辑结果作为 schema 分母，缺失结果按失败计入。

## 硬安全门

private leak、fabricated sourceId、model-generated URL、historical backfill 必须为零；sourceId integrity、unresolved/conflicted exclusion 和 capturedAt/availableAt pipeline 必须为 100%；schema pass 至少 75%。两模型均失败时不得执行 Canary。

## 模型冻结

质量优先于速度。Luna 只有在硬门通过、resolved work 不落后超过一部、pilotUsable work coverage 与 repeat agreement 均不落后超过 10 个百分点、没有明显 claim 质量退化，且 p50 latency 或 total tokens 至少改善 30% 时才可成为 default。未通过硬门的模型不得作为 escalation。

无论最终路由如何，`full160Authorized=false`。
