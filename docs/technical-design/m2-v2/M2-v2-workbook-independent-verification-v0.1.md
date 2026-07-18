# M2 v2 Workbook Independent Verification 合同 v0.1

状态：`frozen_before_implementation`；public sanitized；`not_for_formal_decision`。

Verifier 自行解析 XLSX ZIP 中的 workbook/sheet XML、relationships、shared strings、formulas/cached values、data validations、hyperlinks、styles、hidden sheets、external links、defined names 与 custom XML。

Sheet names、row/formula/error/hyperlink/validation counts，以及 forbidden/internal-id/income/secret/external-link counts 必须由 verifier 计算；caller assertion 不能作为事实。视觉审查是独立 human attestation，默认 false，结构 verifier 不得自动设为 true。

旧 workbook 保留为 historical。v0.4 只从既有 evidence 离线生成，使用 native XLSX hyperlink relationships，不使用 HYPERLINK 公式，`providerRequestDelta=0`。
