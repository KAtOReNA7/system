# M2 当前状态索引 v0.18

日期：2026-07-26
状态：current repository governance entry

## 唯一当前结论

M2 只预测未来分成收入现金。买断、其他非分成现金和 commitment 均在模型外；
pure-buyout 必须 `null abstain`。人工拆分的分成账单继续是特征、标签和 actual
的唯一现金权威，exact v0.3 继续是作品级 fallback。

v1.0 独立 later-origin 资格审计已完成，但没有合格验证块，因此没有读取新的
later-origin 预测指标，也没有训练、调参、更新专家权重或打开 final holdout：

- 账单最新完整月为 2026-04，故 2023-01 至 2023-04 的 36 个月标签按时间成熟；
- 四个相邻月份只能视为 1 个连续时间块，不能冒充 4 份独立证据；
- v1.0 的短周期辅助评估已经使用 2023-03，选择/比较证据的标签边界到
  2025-12，因此 2023-01 至 2023-04 整块不具备严格时间独立性；
- 原 v1.0 执行未留下可复用的完整冻结模型状态；本轮禁止重新拟合来补造；
- 最早可能时间独立的 origin 为 2026-01，其 36 个月标签要求账单完整到
  2029-01；当前仍缺 2026-05 至 2029-01 共 33 个完整月；
- 2026-05 的 3 条不完整分成事实虽然在现有缓存中仍标记为 calibration-valid，
  later-origin 审计按完整月上限全部显式排除，且未把未成熟标签填 0。

资格判定为：

- `decision=NO_QUALIFIED_INDEPENDENT_MATURE_LATER_ORIGIN`
- `metricsRead=false`
- `laterOriginConsumed=false`
- `trainingPerformed=false`
- `currentDecision=CANARY_FAIL`
- `automationDecision=AUTOMATION_BLOCKED`
- `nextDevelopmentReadiness=LATER_ORIGIN_NOT_QUALIFIED_2029_01_COMPLETE_LABELS_AND_ORIGINAL_FROZEN_STATE_REQUIRED`

代码合入不等于模型发布。v1.0 的代码、人工阈值、参数空间、四专家结构和既有失败
结论继续冻结，不得用本次资格结论开发 v1.1。

## 预注册与数据边界

预注册在读取任何新 later-origin 指标前固化：

- v1.0 development commit：`19cf18aa4224849b06d69479de3c575bccf9804f`；
- readiness audit implementation commit：
  `d208d84` 所在提交（完整值见公开预注册）；
- 模型、窗口、排除规则、三种报告分辨率、指标、分群、作品聚类 bootstrap、
  时间块敏感性和门槛均已预先声明；
- private 文件完整摘要只写入 Git ignored 预注册；公开文件不含账单行、作品 ID、
  渠道 ID 或 private 摘要值；
- 三账单 192,370 = 190,663 + 1,707 行继续逐行、逐月和金额守恒；
- 3,053 部权威作品中 3,052 部有任一账单观察，2,718 部有分成账单观察；
  2021—2025 有分成事实的作品为 2,682 部。

## 既有 v1.0 结论保持

v1.0 development 仍是
`HUMAN_ANCHORED_DEVELOPMENT_FAIL / M2_NOT_MATURE`：

- 36 个月主评估：1,125 部独立作品、12,039 个成熟 case；
- 人工原式 WAPE/bias：0.53141021 / -0.40552340；
- v1.0 WAPE/bias：0.44022707 / -0.12366598；
- active/intermittent/dormant WAPE：0.36837319 / 0.82752420 /
  1.00000000；
- 相对人工 WAPE 改善的作品聚类 bootstrap 95% 区间：
  [-38.40%, 5.36%]。

这些是既有 development 证据，不是独立 later-origin。

## 当前入口

- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-readiness-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-later-origin-code-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.12.json`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-research-and-decision-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

v0.17 及更早 current-state 文件保留作历史审计，不是新的执行入口。PR #7 的
cryptographic authority 仍由不可变的
`docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json` 提供，本索引不改写其
绑定。

## 命令

公共、无 private：

```bash
npm run diagnose:m2:later-origin-readiness
npm run diagnose:m2:current
npm run verify:m2:current
```

本机受控资格审计：

```bash
npm run doctor:capability -- m2-current-human-anchored-later-origin
npm run check:m2:current:later-origin-readiness
```

capability doctor 当前应因缺少原始 frozen v1 model state 而阻断模型验证；这不阻断
公共 clone、安装、测试、诊断或启动。final holdout、provider、远程/共享数据库、
Canary、full160、release 和 M3 formal 均未授权。
