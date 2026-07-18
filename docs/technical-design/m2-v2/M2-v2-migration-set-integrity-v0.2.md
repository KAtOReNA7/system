# M2 v2 Migration Set Integrity 与 Rollback 合同 v0.2

状态：`frozen_before_implementation`；public sanitized；`not_for_formal_decision`。

Manifest normalized paths 必须平台大小写语义明确且唯一；拒绝空路径、绝对路径、`..`、drive/UNC 逃逸。解压后 `actual file set == manifest file set`，不得只比较 count；只逐个复制已验证 manifest 成员，不复制整棵 payload tree。

文件、任一父目录、目标祖先的 reparse/junction/symlink 与 hardlink 异常均拒绝。Manifest/hash/path/reparse/Git ignore/env template/secret exclusion/destination conflict 必须全部在 promotion 前完成。

Private state 与 env 作为统一可回滚事务提升。在 private rename、env write、Git check 和 receipt write 前后注入失败时，都必须恢复原 current，partial state 永不成为 current。
