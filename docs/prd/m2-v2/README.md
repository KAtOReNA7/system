# M2 分成收入预测 PRD 文档集

## 当前状态

- 当前产品合同：`M2-forecast-intelligence-v2-prd-v0.2.md`
- 当前预测目标：未来分成收入现金
- 当前作品级 fallback：`M2-current-occurrence-amount-calibration-v0.3`
- 当前人工锚定候选：v1.0，development `FAIL`，不得替换 v0.3
- 当前业务状态：`CANARY_FAIL` / `AUTOMATION_BLOCKED`
- final holdout、provider、数据库、Canary/full160、release、M3 formal：未授权

本目录同时保留 V2-A、V2-B 和 PR #7 的历史合同。历史文件中的 provider、
human baseline、未来买断、resume、Canary、full160、next step 或授权语句均只作
审计追溯，不能覆盖用户后续业务决定与 current-state index。

当前治理入口：

- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.17.md`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.11.json`
- `docs/analysis/m2-current/M2-current-human-anchored-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-human-anchored-research-and-decision-v0.1.md`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`

## 权威边界

M2 只预测未来分成现金。全部买断现金（包括 cutoff 时已确认的买断应收）进入
模型外账单/审计层；pure-buyout 必须 null abstain。120 部人工预测样本已退出
current 流程。人工只负责账单分区、渠道主数据和技术门禁后的结果验收。

canonical 渠道主表只存在于 Git ignored private capability。公开仓库保留 schema、
synthetic fixture、加载器、模型核心和聚合报告，因此没有 private 文件的新电脑仍可
安装、测试、运行公共诊断和启动服务。

## 文档索引

| 文档 | 生命周期 | 作用 |
|---|---|---|
| `M2-forecast-intelligence-v2-prd-v0.2.md` | current | 分成收入目标、渠道主数据、平台分层模型与门禁 |
| `M2-forecast-intelligence-v2-prd-v0.1.md` | historical | 旧五 head 与 formal-cash 合同；冲突处已被 v0.2 取代 |
| `M2-v2-data-policy-v0.1.md` | historical/reference | evidence 与数据使用边界 |
| `M2-v2-human-baseline-prd-v0.1.md` | retired-current-dependency | 旧人工基线设计；不得重建 120 部样本 |
| `M2-v2-v2a-traceability-v0.1.md` | historical | V2-A 追踪矩阵 |
| `M2-v2-evidence-pilot-prd-v0.1.md/json` | historical | V2-B evidence pilot 审计合同 |

技术设计位于 `docs/technical-design/m2-v2/`。任何 historical 文档只有在 current
PRD、current-state index 与用户最新授权共同允许时，才能作为新执行依据。
