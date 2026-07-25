# M2 当前状态索引 v0.15

日期：2026-07-25

## 唯一当前结论

M2 只预测未来分成现金。用户人工复核的总账、分成账单和买断账单已经替代机器
现金分类：

- 总账只用于守恒；
- 分成账单是预测链路唯一现金来源；
- 买断账单只用于评级历史背景；
- pure-buyout 必须 null abstain。

三账单 192,370 = 190,663 + 1,707 行，逐行多重集、逐月行数和逐月金额全部
守恒。人工权威把旧 7,851 case 中 768 个纠正为 pure-buyout；当前 served 为
758 works / 7,083 cases。

## 当前质量

| 视图 | WAPE | bias | 结论 |
|---|---:|---:|---|
| 作品级 | 0.49075894 | 0.07378107 | FAIL |
| dense | 0.45873171 | 0.08587016 | FAIL |
| intermittent | 0.96321675 | -0.10112028 | FAIL |
| dormant | 1.01854144 | -0.97173129 | FAIL |
| portfolio | 0.12794956 | 0.10048252 | FAIL（bias/区间） |
| 人工渠道 comparator | 0.70444680 | -0.29098286 | REJECT |

公共诊断为 `CANDIDATE_DEVELOPMENT_FAIL_BLOCKED`。旧 v0.5 portfolio PASS 只
适用于旧机器现金路由，已被人工分区复验推翻。final holdout、provider、数据库、
自动化、Canary、release 和 M3 formal 均未授权。

## 当前入口

- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-sales-share-candidate-v0.6.json`
- `docs/analysis/m2-current/M2-current-manual-channel-backtest-v0.1.md`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.9.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/analysis/m2-current/M2-current-signal-input-portable-intake-v0.1.md`
- `AGENTS.md`

## 下一开发方向

1. 账单更新时运行 `npm run develop:m2:current:ledger-partition`；不再运行机器
   买断判定。
2. 建立版本化 canonical 渠道与平台类型主表。
3. 按作品×canonical 平台×会员/单购×三级分类×级别×上线月龄建模。
4. 补充能够证明 historical `availableAt` 的分成状态 snapshot；不得事后回填。
5. 新信号先过 25-origin 诊断，再在 7,083 个当前 served case 做 nested
   challenger，同时保留 7,851 个旧机器路由 case 的差异审计。
6. 未获单独授权前不打开 later-origin/final holdout。

## 本地受控命令

```bash
npm run develop:m2:current:ledger-partition
npm run prepare:m2:formal-local
npm run develop:m2:current:candidate
npm run develop:m2:current:manual-channel
```

这些命令需要所属 private capability。公共开发仍只使用 README 的无 private
基线；缺少三份账单不得阻断其他电脑开发。
