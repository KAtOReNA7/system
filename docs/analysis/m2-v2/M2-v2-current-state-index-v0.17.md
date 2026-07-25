# M2 当前状态索引 v0.17

日期：2026-07-26
状态：current repository governance entry

## 唯一当前结论

M2 只预测未来分成收入现金。买断现金、其他非分成现金和 commitment 均在模型外；
pure-buyout 必须 `null abstain`。用户人工拆分的分成账单是特征、标签和 actual
的唯一现金权威，canonical 渠道治理已完成。

本轮人工锚定层级概率模型 v1.0 已完成开发和冻结。它从全部 3,053 部权威作品建立
资格账本，没有固定抽取 300 本；2021—2025 有分成事实的作品为 2,682 部。36 个月
主评估覆盖 1,125 部独立作品、12,039 个成熟 case。

## v1.0 结果

| 视图 | WAPE | bias | 结论 |
|---|---:|---:|---|
| 人工规则原式 | 0.53141021 | -0.40552340 | comparator |
| v1.0 作品外 36 个月 | 0.44022707 | -0.12366598 | FAIL |
| 严格 as-of 短周期辅助 | 0.45423206 | 0.10475884 | FAIL |
| v0.3 精确重叠 5,203 case | 0.37610234 | 0.09727286 | fallback comparator |
| v1.0 精确重叠 5,203 case | 0.27683274 | -0.12150511 | 同窗改善，不能晋级 |

v1.0 相对人工原式 WAPE 改善 17.16%，相对 v0.3 精确重叠 case 改善 26.39%。
中央 80% 区间覆盖率为 0.80089708。按作品聚类 bootstrap 的相对人工 WAPE 改善
95% 区间为 `[-38.40%, 5.36%]`，仍跨 0。

四专家原始层 WAPE 为 0.45540455，发生/冲销原始层为 0.44126080，均劣于
已学习人工参数层 0.44022707，因此两个新增层都被拒绝并安全回退。公开 FVA 的 0
表示回退后没有继续恶化，不表示这些层成功。

| 分群 | WAPE | bias |
|---|---:|---:|
| active | 0.36837319 | -0.00758659 |
| intermittent | 0.82752420 | -0.74935216 |
| dormant | 1.00000000 | -1.00000000 |

正式判定：

- `developmentDecision=HUMAN_ANCHORED_DEVELOPMENT_FAIL`
- `maturityDecision=M2_NOT_MATURE`
- `currentDecision=CANARY_FAIL`
- `automationDecision=AUTOMATION_BLOCKED`
- `promotionEligible=false`
- `nextDevelopmentReadiness=HUMAN_ANCHORED_DEVELOPMENT_FAILED_LATER_ORIGIN_OR_AUDITABLE_WORK_SIGNALS_REQUIRED`

exact v0.3 继续是作品级 fallback。v1.0 的参数空间、失败试验和失败结论已冻结，
不得在同一 2021—2025 development 窗口继续调参。代码合入 main 不等于模型发布。

## 数据质量与时序边界

- 2021—2025 分成事实 167,972 行；渠道映射覆盖 100%，金额差为 0。
- 正向收入和负数冲销分别建账，最终精确回到分成净现金。
- 未成熟 36 个月标签排除，零填充数为 0。
- 2021 年前、2025 年后和买断现金均未进入本轮特征、标签或指标。
- 主评估是五折按作品隔离的 development 比较，不是独立 later-origin。
- 2021—2025 窗口内，36 个月标签只成熟到 2022-12 起点，因此当前不能形成未参与
  选择的 later-origin。
- 渠道角色/收入模式的历史生效年月覆盖仍为 0，只能作 development 属性；三级
  分类只作报告分组。
- private 行、作品/渠道标识未公开；provider、数据库、final holdout、Canary、
  release 和 M3 formal 均未打开。

## 当前入口

- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.11.json`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-human-anchored-research-and-decision-v0.1.md`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `AGENTS.md`

v0.16 及更早 current-state 文件继续保留作历史审计，不是新的执行入口。

## 下一开发方向

1. 保持 exact v0.3 fallback，冻结 v1.0。
2. 优先取得未参与本轮选择且 36 个月标签已成熟的 later-origin；尚未成熟时保持
   阻断，不得填 0 或打开 final holdout 替代。
3. 只有在明确公式/误差目标需要时，才接收可审计历史 as-of 信号：渠道/合同可售
   状态、真实上线月、单购净收入到销量换算，并要求 `effectiveAt/availableAt`。
4. 新信号先做覆盖、唯一性、守恒、泄漏与作品级缺口 ledger，再做成熟短周期
   rolling-origin 和按作品隔离的 nested 评价。
5. 只有绝对 WAPE/bias、segment、作品聚类 bootstrap、风险覆盖与业务损失全部
   通过，才申请 final holdout。
6. 120 部人工评估继续跳过。人工不填写预测金额，只做账单/渠道治理和技术门禁
   通过后的 QA。

## 命令

公开、无 private：

```bash
npm run diagnose:m2:current
npm run verify:m2:current
```

本机受控 capability：

```bash
npm run doctor:capability -- m2-current-human-anchored
npm run develop:m2:current:human-anchored
```

缺少 private 只允许阻断第二组命令，不得阻断 clone、`npm ci`、lint、build、公共
测试、smoke、公共 M2 诊断或本地服务启动。
