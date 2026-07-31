# M2 HPSR01 residual bound 来源证明 v0.1

## 结论

HPSR01 的三个 residual 参数已经冻结在 Git ignored 的
`PRIVATE_DERIVED_CACHE` 中：

- `frozenDevelopmentPositiveBaseFloor`；
- `frozenDevelopmentQ05`；
- `frozenDevelopmentQ95`。

公开文件不披露三个私有数值，也不把 private digest、旧目录或本机路径作为跨电脑
门禁。

## 推导人口

推导只使用此前已打开的开发证据：

- 评价族：Strict rolling；
- 人口：动态 Core80；
- horizon：3 个月；
- raw：冻结 CHAM01 B3；
- base：冻结 LG01；
- origin 范围：`2023-03` 至 `2025-09`；
- 最大允许已打开开发起点：`2026-02`；
- 输入 577 行，有限支持 577 行，非有限排除 0 行，正 base 支持 577 行。

推导代码只访问 origin、作品连接键、horizon、LG01 point 和 CHAM01 B3 point；
没有消费 actual 字段。任何 origin 晚于 `2026-02` 的行都会 fail-closed。

## 固定公式

- 正 base floor：有限正 LG01 base 的 q10；
- scale：`max(abs(base), frozenDevelopmentPositiveBaseFloor)`；
- normalized residual：`(raw-base)/scale`；
- lower/upper：normalized residual 的 q05/q95；
- 分位数：`LINEAR_INTERPOLATION_N_MINUS_ONE`。

语义与 HCRC01 预注册的 q10/q05/q95 保持一致，但 HPSR01 不执行 alpha 搜索，也不
读取 HCRC01 的 outer outcome 做新选择。

## 缓存与权限

HPSR01 参数文件是可再生缓存。缓存缺失时从冻结开发缓存角色重建；历史 receipt
缺失只告警。若无法证明来源仍严格位于旧 opened development window，必须进入
`M2_HEAD_PROTECTED_SEGMENTED_ROUTER_IMPLEMENTATION_BLOCKED_UNPROVEN_BOUND_PROVENANCE`，
不得用 later-origin 或 prospective final holdout 补算。

本次重建没有读取新的 later-origin future actual 金额，没有运行模型评价或
bootstrap，也没有打开 prospective final holdout。
