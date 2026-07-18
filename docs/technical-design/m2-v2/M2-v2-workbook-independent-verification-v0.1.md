# M2 v2 Workbook Independent Verification 合同 v0.1

状态：`IMPLEMENTED_AND_SYNTHETICALLY_VERIFIED`；public sanitized；`not_for_formal_decision`。

实现范围：独立 ZIP/XML 结构解析、caller-assertion rejection 与 adversarial workbook fixtures 已由 synthetic tests 验证；视觉审查仍必须由独立 human attestation 给出。本合同不声称真实 private migration、exact-head CI、public restatement 或真实 workbook 视觉验收已完成；`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

Verifier 自行解析 XLSX ZIP 中的 workbook/sheet XML、relationships、shared strings、formulas/cached values、data validations、hyperlinks、styles、hidden sheets、external links、defined names 与 custom XML。

Sheet names、row/formula/error/hyperlink/validation counts，以及 forbidden/internal-id/income/secret/external-link counts 必须由 verifier 计算；caller assertion 不能作为事实。视觉审查是独立 human attestation，默认 false，结构 verifier 不得自动设为 true。

B8 private verification receipt v0.3 必须保留由独立 XLSX relationship 解析直接派生的 hyperlink lineage：仅包含 protocol、target mode、relationship type、不可逆 target digest 与 occurrence count，并绑定稳定 lineage digest。不得持久化原始 URL 或 host；lineage occurrence 总数必须等于独立解析的 hyperlink count。调用者 aggregate、generator assertion 或重签外层 receipt 都不能替代或修复缺失/被篡改的 lineage。

旧 workbook 保留为 historical。v0.4 只从既有 evidence 离线生成，使用 native XLSX hyperlink relationships，不使用 HYPERLINK 公式，`providerRequestDelta=0`。
