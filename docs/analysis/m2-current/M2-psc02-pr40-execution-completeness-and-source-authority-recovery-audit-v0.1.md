# PSC02 PR #40 执行完整性与源权威可恢复性审计 v0.1

截至 2026-08-02，本审计只检查出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
`M2-CHAN-PSC02`）的公共代码路径和既有私有来源谱系。没有执行第二次模型重放，
没有拟合、预测、打开 outer outcome、读取 LG01 成绩或计算任何模型指标。

## 结论

本次进入 D1。当前结论同时由三个互不替代的状态表达：

- 历史重放因没有可恢复的起点可见现金源权威而阻断
  （`PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY`）；
- 没有模型性能证据（`NO_MODEL_PERFORMANCE_EVIDENCE`）；
- 执行实现不完整且没有候选结果
  （`PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT`）。

公共数学核心和 synthetic 合同确实存在，但这不等于真实 runner 已完整实现。现有 runner
没有任何可达路径能从真实 component authority 形成完整的 P raw prediction、延后读取
比较器、计算指标与 bootstrap，并原子封存全部结果。

## 调用链与关键分支

真实入口依次是：

1. `npm run develop:m2:current:publishing-scale-cash-anchor`；
2. `scripts/m2-current/run_m2_human_anchored_development.mjs`；
3. `runM2Psc02ControlledDevelopmentReplay`；
4. `materialize_human_anchored_cases.py` 的 PSC02 权威预检；
5. `publishingScaleCashAnchorDevelopment.js` 中的公共数学函数。

历史代码在 `authority.readyForPrediction !== true` 时形成预测前阻断记录；若该值为
`true`，则无条件登记缺少兼容 component adapter 后抛错。两条分支都不能形成完整候选。
纠正后，开发命令在 Git preflight、私有目录访问和收据创建之前按“没有重放授权且执行
不完整”失败关闭，避免产生第二次 attempt。

## 16 阶段完整性矩阵

| # | 阶段 | 公共 primitive | 真实 runner |
|---:|---|---|---|
| 1 | component authority adapter | 不存在 | 缺失 |
| 2 | origin-visible component/revision snapshot | 只有合同 | 缺失 |
| 3 | 月度自然键聚合 | 存在 | 未连接真实权威 |
| 4 | anchor 与六层 fallback | 存在且 synthetic 验证 | 未编排 |
| 5 | 冻结 PSC01 occurrence 连接 | parity/coverage helper 存在 | 缺失 |
| 6 | 现金锚单独诊断（D0） | prediction primitive 存在 | 未编排 |
| 7 | 锚定对数比率诊断（D1）nested fit/prediction | primitive 存在 | 未编排 |
| 8 | 锚定准 Gamma 主设计（P）nested fit/prediction | primitive 存在 | 未编排 |
| 9 | occurrence binary64 parity | 存在且 synthetic 验证 | 未编排 |
| 10 | exact PSC01 case coverage | 存在且 synthetic 验证 | 未编排 |
| 11 | monthly-to-horizon aggregation | 存在 | 未编排 |
| 12 | P raw prediction 原子封存 | 只有输出名称 | 缺失 |
| 13 | PSC01/LG01 comparator 延后读取 | 只有可用性预检 | 缺失 |
| 14 | 完整指标与分组诊断 | 只有局部 scorer | 缺失 |
| 15 | 2,000 次 paired whole-work bootstrap | 只有合同 | 缺失 |
| 16 | private manifest、receipt、digest 与冻结输出 | 只有历史 attempt receipt 的部分实现 | 成功封存链缺失 |

机器可读矩阵见同名 JSON。单独存在的 domain 函数、配置或 synthetic 单测均未被当作
端到端真实实现。

## 四个字段的可恢复性

现有三个账本工作簿都只有一个可见 sheet 和当前八列业务数据；没有隐藏来源 sheet、
命名来源表、公式、外部连接、上游记录 identity、历史导出身份或到达元数据。现有
receipt、manifest 与 digest 绑定的是当前输入或派生缓存，不记录逐 component 的历史
修订与真实到达时间。

| 字段 | 判定 | 证据与失败原因 |
|---|---|---|
| `componentId` | 不可恢复（`NOT_RECOVERABLE`） | 没有原生 component identity；行 hash 或行号不能区分两次字段与金额完全相同但均合法的 posting |
| `revisionId` | 不可恢复（`NOT_RECOVERABLE`） | 没有同一 component 或月度自然键的修订谱系；当前工作簿 digest 只能标识当前快照 |
| `effectiveAt` | 不可恢复（`NOT_RECOVERABLE`） | 没有真实业务生效时间或既有上游合同；不得把 `cashMonth` 临时改称 `effectiveAt` |
| `availableAt` | 不可恢复（`NOT_RECOVERABLE`） | 没有历史导出、导入 receipt、不可变快照到达记录或等价权威；mtime、复制/Git/本次读取时间均无效 |

Primary 13 个起点和 strict 11 个起点共 24 个起点中，可真实重建当时 component revision
snapshot 的起点数为 0。当前只有合并后的账本快照，不能伪造 historical visibility。

## `missing=0, extra=3`

确定性 canonical multiset 差异确认：3 行均属于分成侧额外的金额变体，分类为
“分成侧独有、总账不存在的加性金额变体”
（`SALES_SHARE_ONLY_ADDITIVE_AMOUNT_VARIANTS_ABSENT_FROM_TOTAL_LEDGER`）。它们：

- 不是完全重复、合法拆分/替换、分类漂移、空值/格式差异或数值规范化差异；
- 不涉及买断、冲销或未分配残差，也不是比较键漏列造成；
- 各自与总账的一行共享全部非金额维度，但金额不同，且对应总账金额行也同时保留在拆分账本；
- 若删除会改变分成现金，并会恢复行多重集与金额守恒，因此不能在没有权威纠正依据时直接删除。

额外多重集的不可逆摘要为
`928d47ff67f6e7ef57a4c919dc3770baf4217797dde72e38137704349eecc9f2`。
本报告不公开任何行值、作品名、金额或本地路径。

## 历史状态与当前权威

唯一历史预测前 attempt 的原始结果继续保留为开发重放不支持
（`PSC02_DEVELOPMENT_NOT_SUPPORTED`）和私有源权威阻断而非模型失败
（`PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE`）。既有私有 receipt 保持逐字节
不变。它们是历史原始登记，不再代表“真实 runner 已完整实现”。

本审计及补充决策记录成为当前纠正权威。Model Registry 继续保持
`evaluations=[]`、`activeCandidate=null` 与 `approvedForAutomation=null`。

## 下一步边界

如果后续另行授权，研究方向应转向只使用已经冻结且已证明 origin-visible 的 PSC01
人口与训练信息的新金额模型，而不是再次尝试 PSC02。本轮没有设计或实现该模型。
独立评价、later-origin、final holdout、production、automation、release、API、数据库、
provider 和财务使用仍全部未授权。
