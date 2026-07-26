# M2 v1.0 later-origin 全代码审计 v0.1

日期：2026-07-26  
范围：later-origin readiness、预注册、public diagnostic 和既有 v1.0 接口

## 结论

审计未发现新的平行模型、重复 runner、public/private 边界反转或通过资格结果
继续调参的入口。later-origin 路线保持 fail-closed：资格不成立时不调用
`fitM2HumanAnchoredModel`、`crossFitM2HumanAnchored`、
`strictRollingM2HumanAnchored`、`predictM2HumanAnchored` 或评分函数。

唯一开放的受控写入口是
`check:m2:current:later-origin-readiness`，它只生成 private 摘要绑定和 public
聚合资格结果。公共入口
`diagnose:m2:later-origin-readiness` 只读取 tracked public 预注册并验证输出漂移。

## 检查结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 重复 runner | 通过 | later-origin 只有一个 Node orchestration runner 和一个只做数据 profile 的 Python adapter；没有复制旧 development runner |
| 失效入口 | 通过 | 265/265 package scripts 均被 command lifecycle 分类；public diagnose/verify 与 restricted check 均有明确角色 |
| v1.0 冻结 | 通过 | development commit `19cf18aa4224849b06d69479de3c575bccf9804f` 后，v1.0 config、core、materializer 和 development runner 无差异 |
| 指标前预注册 | 通过 | public/private 预注册记录 `metricsRead=false`、`laterOriginConsumed=false` |
| 时间泄漏 | 阻断并安全停止 | 2023-03 已进入既有辅助证据，且选择/比较标签边界到 2025-12；2023 连续块不执行评分 |
| 不完整月份 | 通过 | 2026-05 的 3 条事实即使缓存标记 calibration-valid，也被完整月上限显式排除 |
| 未成熟标签 | 通过 | 零填充数为 0；最早独立 2026-01 origin 等待标签完整到 2029-01 |
| private 依赖 | 通过 | public command 不读取 `data/real-bills` 或 `data/private-*`；private adapter 只由 restricted command 调用 |
| public 泄漏 | 通过 | public validator 拒绝 private 路径、作品字段和渠道字段；private 摘要值只保留在 ignored 文件 |
| 文档状态 | 通过 | current 导航更新为 v0.18 / public diagnostic v0.12；v0.17、v0.11 及旧 later-origin next step 只保留为历史证据 |

## 剩余阻断

原 v1.0 运行没有完整 frozen model state。当前授权禁止重新拟合人工参数、专家权重、
occurrence/reversal 或残差池来重建，因此无法执行一次性表现验证。该缺失只阻断
later-origin private capability，不阻断公共 clone、安装、lint、build、测试、
smoke、readiness diagnostic 或启动。

final holdout、provider、远程/共享数据库、Canary、full160、release 和 M3 formal
均未打开；代码合并不等于模型发布。
