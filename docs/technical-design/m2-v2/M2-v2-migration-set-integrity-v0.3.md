# M2 v2 Migration Exact-set 与 Native Identity 合同 v0.3

状态：`PROPOSED_NOT_CURRENT`；public sanitized；`not_for_formal_decision`。本文件冻结 B2 的设计，不修改 v0.1/v0.2 package 或 v0.2 合同，也不声明实现、真实迁移、native platform CI 或 independent review 已通过。

## Compatibility policy

v0.1 与 v0.2 只允许 inspect，并可从已验证内容重新 package 成 v0.3；它们不得 direct restore 或 auto-promote。v0.3 是唯一可 restore/promote 的格式。不得保留旧弱 schema 的兼容 promotion 后门。

## Whole-archive exact set

v0.3 manifest 声明 archive 的完整 payload、control 与实际存在的 directory member set，实际 ZIP member set 必须精确相等。每个 member record 只允许 canonical path、regular-file/directory kind、payload role、STORE/DEFLATE method、CRC32、compressed/uncompressed bytes、content SHA-256 与受控 Unix mode；每个 payload role record 绑定 required flag、min/max cardinality 与排序唯一的 exact member-path subset。拒绝 extra control file、missing member、temp residue、duplicate normalized path、case/NFC collision、backslash/absolute/drive/UNC/`..`/NUL/ADS/device alias、special/link member、encrypted member与超出冻结 budget 的 archive。

ZIP 必须只有一个 EOCD，不允许 prefix、trailing bytes、archive comment 或 multi-disk；central-directory 与 local header 的 filename/flags/method/CRC/size 必须精确一致，local data ranges 不得重叠。Filename 必须设置 UTF-8 flag，拒绝 legacy code page；Unicode path extra field 若存在必须与 UTF-8 name 一致。只允许 STORE/DEFLATE；ZIP64 与 data descriptor 仅在 canonical、flag 一致且 budget 内时允许。Inflated bytes 必须同时匹配 CRC32 与 content SHA-256，external attributes 必须匹配 regular/directory kind 和冻结 mode。

Manifest digest 使用递归排序 object key、保留 array order 的 compact UTF-8 canonical JSON，并排除 `manifestDigestSha256` 本身。Archive 内 manifest member 的 content digest 以该字段置空后的 canonical manifest 为基准；禁止任何递归 self-reference。

验证不得只比较 payload count，也不得在验证后复制整棵未约束 tree。只有 complete package validation 成功后，才可逐项 extract 至全新 staging。

## Native filesystem identity

所有 root、ancestor 与 final object 都必须 no-follow 检查，并在 enumeration 前固定 identity，在 copy、archive、key write、receipt 与 operation 后重新验证。Windows evidence exact record 包含 stage、endpoint role、ancestor index、attributes、reparse tag、volume serial、FileId128 与 final-path digest；accepted object 的 reparse tag 必须为零。POSIX evidence exact record 包含 stage、endpoint role、ancestor index、mount ID、device、inode、mode、resolved-path digest 与 `noFollowVerified=true`。Pre/post identity tuple 必须精确相等，所有 endpoint physical identity set 必须互斥。

Native matrix 强制两行：Windows native PowerShell 5.1 必须执行 reparse/junction/ancestor/short-name/case/UNC/TOCTOU 与 positive control；Linux native 必须执行 symlink/ancestor/bind-mount/mount-ID drift/TOCTOU/no-follow 与 positive control。任一 native case 缺失即 `FAIL`，不能用文本检查或另一平台替代。

Repository、source、output、key 与 staging endpoint 必须物理分离；任何 endpoint 等于另一个 endpoint/ancestor、共享同一 physical target 或 replace-after-enumeration 都必须 rollback 并失败。Receipt platform 仅允许 `WINDOWS_POWERSHELL_5_1_NATIVE` 或 `LINUX_NATIVE`，result 仅允许 `PASS`、`FAIL`、`VERIFIED_NO_OP`、`ROLLED_BACK`；它必须内嵌与 platform 匹配的非空 exact `platformEvidence` record array，并绑定 canonical evidence-set digest，同时保存 policy、identity/ancestor/member/manifest digest 与 platform/result，不保存 absolute path、key 或 secret。

## Atomic builder/restorer

PowerShell 只能是薄 wrapper，native policy engine 拥有验证语义。完整 validation 必须先于 extract；promotion 使用全新 staging、atomic swap 与全失败 rollback。故障不得生成 success receipt，partial state 永不成为 current；相同输入第二次运行只能得到 `VERIFIED_NO_OP`。

本合同固定 `currentDecision=CANARY_FAIL`，不授权 provider、数据库、Canary、full160、模型训练、holdout、B8、mark ready、PR merge 或 release；`nextDevelopmentReadiness=NOT_AUTHORIZED`。本文件仍只冻结设计，不声明实现、真实 migration/current promotion、native CI、finding closure 或 independent review 已通过。
