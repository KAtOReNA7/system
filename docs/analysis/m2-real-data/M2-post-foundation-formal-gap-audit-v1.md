# M2 最终基础表接入后的 formal gap 审计 v1

## 结论

- 当前约定范围内的业务基础数据决定已经收口，人工数据缺口计为 `0`。
- M2 本地工程候选完成最终基础表重算且无收入模式/前台评级意外回归。
- M2 仍未 formal complete；剩余问题是 private 逐作品 staging 可重复性、正式版本/输入快照、mapping 激活、正式任务/导出/发布/审计和授权，不应重新包装成业务补表任务。
- M3 本地 prototype 可以保留，M3 formal execution 仍不可开始。

## PRD 对齐

| PRD 条目 | 当前状态 | 阻断 M2 formal | 需要重新人工补数据 |
|---|---|---:|---:|
| M1 standard work and required basic information | local_candidate_closed_formal_version_missing | 是 | 否 |
| historical income and stable local candidate rules | post_foundation_rerun_pass | 否 | 否 |
| mapping version reference and activation | not_active | 是 | 否 |
| formal basic-info version and input snapshot | not_created | 是 | 否 |
| formal task/export/release/audit workflow | prototype_only_not_formal | 是 | 否 |
| M3 formal execution authorization | not_granted | 否 | 否 |

## 跨机器可重复性缺口

- 公开仓库只保存脱敏聚合 checkpoint；本次运行没有获得通过内容契约的逐作品 private 输入。即使本地存在恢复候选，也不能仅凭文件存在解除 formal blocker。
- 最小处理是从批准的 private 存储恢复，或用已确认来源重新生成并通过 schema、范围、字段完整性、状态分布和来源确认校验；不得依据聚合计数伪造逐作品字段。

## 后续授权门槛

- 正式主数据写入、mapping activation、formal evaluation、正式 task/export/release/audit 和 M3 formal execution 均需用户分别明确授权。
- 在取得授权前，本地结果继续标记为 candidate/non-formal。
