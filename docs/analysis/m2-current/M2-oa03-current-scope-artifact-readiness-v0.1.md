# M2 OA03 当前范围复现 artifact 就绪审计 v0.1

## 总体评估：证据可分享，但模型结论必须带限制

父实验 `M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01` 的首个完整结果已经冻结。
公开 artifact 可用于 Draft PR 审阅、方法复核和后续决策输入；它不支持模型晋升、
自动化、production 或第二次实验运行。

## Artifact 清单

| Artifact | 分类 | 状态 |
|---|---|---|
| OA03 预注册 MD/JSON | 公共冻结合同 | 已提交，结果形成前冻结 |
| OA03 实验 config | 公共执行合同 | 已提交；公式、参数、fold、窗口和门禁未在结果后修改 |
| 当前范围复现开发 JSON | 公共脱敏机器结果 | UTF-8 JSON 可解析，schema 与公共诊断通过 |
| 当前范围复现开发 MD | 公共中文解释层 | 已形成；技术与性能结论分开 |
| trailing-12 渠道分配 JSON | 公共脱敏机器结果 | UTF-8 JSON 可解析，逐分守恒验证通过 |
| trailing-12 渠道分配 MD | 公共中文解释层 | 已形成；作品与渠道结论分开 |
| private prediction/evaluation/bootstrap rows | 私有派生缓存 | 已生成，Git ignored，未进入公共报告 |
| private manifest / receipt / authorization | 私有运行溯源 | 已生成并保留，Git ignored，digest 未公开 |

## 方法与计算复核

- actual 固定为
  `M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`。
- Core80 与 Core90 分开评价，没有合并人口。
- Primary 与 Strict 独立训练、选择和评价。
- 只执行 3/6/12 月，没有从短周期推导 36 月。
- 所有配对比较使用相同 target、actual、人口、origin、horizon、grain 和 case key。
- 每个可评价比较使用 2,000 次完整作品聚类配对 bootstrap。
- 技术完成与模型性能通过使用不同机器状态。
- 作品总额和渠道分配使用不同结论，不把分配结果回写模型角色。

## 数据质量与可比性

| 检查 | 证据 | 评估 |
|---|---|---|
| 权威来源 | 5/5 source authority 存在并读取 | 通过 |
| 缓存 | 本实验缺失缓存从权威来源重建；另一个 capability 的 1 项可重建缓存仍缺失 | 不阻断本实验 |
| manifest/receipt | complete receipt 与 manifest SHA-256 本地一致 | 通过 |
| 预测起点泄漏 | Strict 标签只读取更早已成熟起点；未来冲销不进入更早特征 | 通过 |
| 人口选择 | 使用起点可见收入；未用未来 actual TopN | 通过 |
| 右截尾 | 未成熟 12 月标签排除，未按 0 回填 | 通过 |
| 主要参考 | Primary 的 `M2-WORK-LG01` 3/6/12 月合同不可重建 | 必须标记不可评价 |
| 原冻结重放 | actual 与训练支持合同不同 | 必须标记不可比，不得算复现误差 |
| 分币守恒 | 12 个公开 allocation cell 最大差均为 0 分 | 通过 |
| 弃权 | 未来首次和未成熟渠道均为 null | 通过 |

## 隐私与发布检查

- `npm run check:no-real-data` 通过。
- `npm run diagnose:m2:oa03-current-scope-replication` 返回
  `OA03_PUBLIC_AGGREGATES_VALID`。
- `npm run verify:m2:current` 通过。
- 公开聚合没有 `standardWorkId`、`channelUid`、作品名、渠道名、private 路径、
  row-level actual 或 row-level prediction。
- case 少于 30 或 works 少于 20 的指标按
  `SUPPRESSED_PRIVACY_THRESHOLD` 抑制。
- 主要渠道只发布匿名排名。

## 恢复尝试审计

第一次 attempt 在完整结果形成前遇到公开摘要空值序列化错误。失败收据状态为
`INFRASTRUCTURE_FAILURE_BEFORE_RESULT_RETRY_ALLOWED`，明确记录：

- 未产生完整可解释结果；
- 允许技术恢复；
- 不允许改变公式或参数。

修复仅使不存在的 bootstrap 在公开结果中保持 `null`，并增加失败授权的可审计轮换。
修复提交通过 Linux/Windows exact-head CI 后才运行第二次 attempt。第二次 attempt
形成首个完整结果并把 `retryAllowed` 置为 `false`。没有结果后调参或第三次运行。

## 剩余限制

- Primary 主要研究参考不可合法重建，因此作品总额主人口的三个 horizon 都不能形成
  “支持”结论。
- Strict 作品总额和渠道分配相对主要参考均退化。
- Core80 Primary occurrence 没有负例，ROC-AUC 不可定义。
- conditional positive amount prediction 没有原生存储，不能评价该子能力。
- 所有证据仍是复用开发窗口，不是独立 later-origin 或 final holdout。
- 最终文档 HEAD 只能在包含本报告、Model Registry、中文目录和状态索引的普通提交
  推送后由 PR head 动态解析；不在 artifact 内写死自引用提交。

## 发布边界

当前就绪状态是“可在 Draft PR 中审阅的公开证据”，不是“模型可发布”。
`activeCandidate=null`，`approvedForAutomation=null`，production、provider、数据库、
later/final holdout、Canary/full160、release 和 M3 formal 均未触碰。
