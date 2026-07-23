# M2 v2 Package-complete Workbook Independent Verification 合同 v0.2

状态：`PROPOSED_NOT_CURRENT`；public sanitized；`not_for_formal_decision`。本文件冻结 B5 的 strict profile，不修改旧 workbook/receipt 或 v0.1 合同，也不声明 implementation、真实 workbook reverify、远端 CI 或 independent review 已通过。

## Package-complete OPC graph

Verifier 必须枚举 every ZIP member、`[Content_Types].xml` defaults/overrides、所有 relationship part/edge、reachable/orphan set、normalized path、compressed/uncompressed size、encryption 与 duplicate/collision。Content-type 与 relationship graph 必须覆盖 exact member set；禁止只检查 worksheet/sharedStrings。

Candidate binding 是 public-sanitized exact record：authority role 固定为 `current_governed_private_review_workbook`，NFC repository-relative forward-slash path 仅以 SHA-256 `13b6dffdc6d8b116f6fe062d38c5bc2edbc5b36a525441ee75b36607152816be` 绑定，不公开 raw private path 或真实文件名；当前 candidate content SHA-256 固定为 `c5e15ef291fa9f498c6b597c4ad00e89182edc850a6eda6fb90b9e50b5f0b521`。Role、path digest 与 content digest 必须在 verification time 匹配 canonical authority graph 的同一个 graph member；caller 不得 override。Content digest 是不可逆完整性标识，不包含 workbook 内容。

OPC registry 精确冻结 package relationships/current-profile workbook XML default，以及 workbook、worksheet、shared strings、styles、theme、table、core/app properties 的 part-name rule、content-type URI 与 cardinality。Current workbook 的 `xml` default 只允许解析未被 override 的 `/xl/workbook.xml`；其他 XML part 必须有 exact override。Relationship registry 精确冻结 office document、core/app properties、worksheet、shared strings、styles、theme、table 与 hyperlink URI、source/target class、target mode 和 cardinality。`[Content_Types].xml`、`_rels/.rels`、`xl/workbook.xml` 与 package-root office-document edge 都必须 exactly one；worksheet edge 与 sheet ID map 必须 exact one-or-more；core/app properties 为 zero-or-one。Feature property bag 在本版没有 exact namespace/semantic handler，明确 `REJECTED`。

Internal target 允许相对 source part directory，或单个 leading slash 表示 package-absolute part；随后执行 OPC pack-URI 解析与 NFC POSIX normalization。拒绝 filesystem drive/UNC/scheme absolute target、percent-encoded slash/backslash/dot segment、fragment、duplicate semantic edge 与 unresolved/multi-resolved target。Relationship ID 在每个 part 内唯一；所有 internal target 恰好解析到一个 registered part，orphan 一律拒绝。

每个 part/content type/relation 只能是 `HANDLED_AND_SCANNED`、`HANDLED_METADATA_ONLY_WITH_JUSTIFICATION` 或 `REJECTED`，default 为 reject，不存在 `UNKNOWN_BUT_ALLOWED`。Workbook/worksheet/shared strings/styles/theme/tables 以及存在时的 core/app properties 必须由明确 handler 全面扫描。Feature property bag、custom properties/XML、comments、drawings/charts/VML/media、pivots/slicers/connections、external data/links、embeddings/OLE/ActiveX、printer settings、VBA/XLM/binary、unknown 与 orphan 全部拒绝。未由 handler 处理的 header/footer 等 worksheet channel 也拒绝。

## Static hyperlink 与 bounded parsing

唯一允许的 external relation 是 ordinary hyperlink：type=hyperlink、TargetMode=External、scheme 为 http/https/mailto、无 credentials，并满足 count/length budget。只做静态解析与 digest lineage；禁止 fetch、DNS、redirect、external content load，receipt 不保存 raw target 或 host。

ZIP 与 XML 必须执行冻结的 entry/size/ratio/path、total compressed/uncompressed、XML bytes/depth/elements/attributes/text、relationship 与 hyperlink budgets。ZIP 只允许单一 EOCD、无 prefix/trailing bytes/comment/multi-disk；central/local header 必须 exact agreement，data ranges 不重叠，filename 必须 UTF-8 且 Unicode path extra field 必须一致，member path 必须是 NFC POSIX relative 并拒绝 absolute/drive/UNC/backslash/dot segment/NUL/case-fold/NFC collision，同时拒绝 legacy code page、duplicate raw name、unsupported method、非法 ZIP64/data descriptor、CRC mismatch、special external attributes 与 encryption。

XML 只允许 UTF-8/UTF-16LE/UTF-16BE，BOM 与 declaration 必须一致；拒绝 DTD/entity、processing instruction、XInclude、namespace undeclaration、duplicate expanded attribute 与 network resolver。Machine contract 冻结 namespace URI→alias registry，并为 workbook、worksheet、shared strings、styles、table、properties/theme 列出 exact root、allowed element local names、allowed attribute local names 与 per-part element/attribute namespace alias set；root alias 必须精确解析，已知但属于错误 part class 的 namespace 与 unknown namespace/element/attribute 同样拒绝。所有 text、tail 与 attribute value 都必须扫描，bounds 在 parse 前或 streaming 中先 enforce。

## Current workbook 与 receipt

先 strict reverify 现有 workbook。PASS 时只生成新 versioned receipt，不重建 workbook；FAIL 时输出 exact safe reason，不降低 policy、不手工编辑。只有存在从 immutable inputs 确定性重建的 generator 才能生成 vNext，否则状态为 `BLOCKED_WORKBOOK_REGENERATOR_REQUIRED`。

Receipt 的 package/member/content-type/relation/part-decision digest 与 derived facts 必须由 verifier 自算，caller/generator assertion 不可替代。Derived fact 是排序 exact record array，绑定 fact ID/type/value type/value/source-part-set digest，value 必须按 BOOLEAN/integer/bounded safe string/digest 的 exact variant 约束；issue 是排序 exact record array，绑定 severity/reason/part/relation digest 与 bounded safe detail。Per-part decision record 绑定 part digest/class/content type/decision/justification/handler/content digest；metadata-only 必须有 justification，handled 必须有 registered handler，全部 record 进入 part-decision digest。Hyperlink lineage 是按 target digest 排序的 bounded exact record array。Visual review 默认 false，结构 verifier 不得设为 true；`providerRequestDelta=0`、`actualExternalFetchCount=0`。

## Required artifacts 与 zero skip

Default/public profile 对 missing tracked artifact、missing required JSON pointer、hidden early return 或 required skip 一律 nonzero；`totalSkips=0`、`unknownSkips=0`。四个 optional-private ID 只存在于显式 separate profile，absence 不能让 default test skip。

本合同固定 `currentDecision=CANARY_FAIL`，不授权 provider、数据库、Canary、full160、模型训练、holdout、B8、mark ready、PR merge 或 release；`nextDevelopmentReadiness=NOT_AUTHORIZED`。本文件仍只冻结设计，不声明 implementation、真实 workbook reverify/new receipt/current promotion、CI、finding closure 或 independent review 已通过。
