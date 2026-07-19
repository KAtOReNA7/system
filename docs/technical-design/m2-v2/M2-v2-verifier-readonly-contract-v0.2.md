# M2 v2 Verifier Read-only Contract v0.2

状态：`PROPOSED_NOT_CURRENT`；public sanitized；`not_for_formal_decision`。本合同 supersede v0.1 的不完整 scope 设计，但不修改 v0.1 或历史 proof。它只冻结 B1 的目标行为，不声明实现、private proof、远端 CI 或独立审查已经通过。

## 精确声明

允许的声明仅为 `persistent content/metadata/path/ref invariance`。Before/after snapshot 不能排除一次完全恢复的 transient write，因此不得声称 `zero transient write`。若未来 threat model 要求该强声明，必须另行采用 OS-level audit/enforcement。

Verify 只可读文件、使用内存、输出 stdout/stderr 并设置 exit code。它不得创建、修改、删除、rename 或 retimestamp 文件，不得改变 cache、receipt、ledger、counter、manifest、current pointer，不得调用 provider、连接数据库或调用 run/resume/report。Report 与 runtime mutation 必须是独立显式命令。

## Graph-derived exact scope

Scope 必须从 `m2.v2.canonical-authority-graph.v0.3` 派生，禁止由调用者手写一个较小集合。它覆盖 transaction roots、current pointer、所有 graph-bound public reports、current index/restatement、合同要求的 v0.2/vNext paths、tracked verifier sources、private derived members、user repository refs 与 provider counter。

Authority role 到 scope member classes 的映射是 machine contract 中的 15 条 exact record，role set 必须与 authority graph 的 15 个 node ID 完全相等，禁止名称相近的手工 alias。Immutable inputs 同时覆盖 transaction roots 与 user repository refs；execution contract 覆盖 required v0.2/vNext paths 与 tracked verifier sources；ledger、receipt envelopes/index、safe cache、effective index 与 derived evaluation 覆盖 private derived members；counter projection 覆盖 provider counter；三个独立 public authority node（remediation summary、merge readiness、tracked core commitment）以及 current restatement/index 覆盖各自 public/current 集合，current index 还承担 current pointer。每个映射 record 只允许 authority role、非空唯一 known scope-member-class array 与 cardinality 三个字段，且十个 required role class 必须全部被覆盖。

每个 scope member 使用 exact record，记录 authority role/class、member kind、NFC repository-relative forward-slash path、content SHA-256、byte length、directory exact member-set digest、metadata、object identity、link/reparse type 与 reference-target digest。Directory member set 是排序后的 no-follow child name/kind/identity tuple exact set；Git ref 绑定 ref name、object type、target OID 与存在时的 symbolic target。

Windows 必须用 native observation 记录 attributes、FILETIME、每级 ancestor 与 final object 的 reparse tag、volume serial、FileId128 与 final-path digest。POSIX 必须以 no-follow `lstat` 记录 device、inode、mode、uid/gid、size、纳秒 mtime/ctime、mount ID 与 resolved-path digest。未知 platform metadata、无法观测字段、未声明 alias 或 link 一律 `FAIL_WITH_EVIDENCE_GAP`，不能静默通过。

## Self-exclusion 与 proof sequence

Proof output 及其 descendants 必须在首次 snapshot 前用 exact exclusion record 声明，不能进入自己的 scope。Exclusion 只允许 proof output self、descendant 或创建全新 output child 导致的 parent-directory mtime；后者只可忽略 `mtime`，不得忽略其他 metadata，也不得排除任何 governed member。

Verifier 总调用次数明确为 2。证明顺序为：从 graph 派生 exact scope、声明 self-exclusions、`before` snapshot、调用 1、`after_invocation_1` snapshot、调用 2、`after_invocation_2` snapshot，然后比较 exact scope、content、metadata、directory members、path、refs、identity 与 provider counter。任何 scope omission、path/metadata drift、link alias、自引用、provider delta 或 database connection 都不通过。

本合同固定 `currentDecision=CANARY_FAIL`，不授权 provider、数据库、Canary、full160、模型训练、holdout、B8、mark ready、PR merge 或 release；`nextDevelopmentReadiness=NOT_AUTHORIZED`。本文件仍只冻结设计，不声明实现、current promotion、CI、finding closure 或 independent review 已通过。
