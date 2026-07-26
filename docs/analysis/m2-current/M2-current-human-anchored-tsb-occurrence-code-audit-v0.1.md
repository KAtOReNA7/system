# M2 learnedGlobal + TSB occurrence 代码审计 v0.1

日期：2026-07-26

## 审计结论

实现审计：`PASS`

模型 development 决策：`TSB_OCCURRENCE_DEVELOPMENT_FAIL`

代码满足单变量、无平行 runtime、public/private 解耦、冲销一致性和安全 fallback
合同；模型失败来自预注册质量门禁，不是通过复制 runner、泄漏标签、读取 holdout
或改变冻结 v1.0 得到的结果。

## canonical 复用

| 范围 | 审计结果 |
|---|---|
| TSB | `src/domain/m2Current/baselines.js` 的既有实现提升为共享 `fitM2CurrentTsbProcess`；独立 TSB baseline 与新候选调用同一函数 |
| learnedGlobal | 复用 `forecastM2HumanAnchoredBase` 与原参数学习函数；公式、参数名和原网格未改 |
| reversal | 复用 human-anchored canonical fit/predict helper；comparator 与 candidate 使用同一训练折状态 |
| residual/quantile | 复用 human-anchored residual pool 与 quantile calibration helper |
| 三粒度 | 复用 `evaluateM2CurrentResolution` |
| business loss / risk–coverage | 从既有 automation core 提升共享函数，原调用路径保持不变 |

没有复制 Croston/SBA/TSB/ADIDA 算法，没有复制历史 runner、旧 adapter 或旧
real-data runtime。

## runner 与命令

private development 和 public synthetic 都复用
`scripts/m2-current/run_m2_human_anchored_development.mjs`：

- 默认无参数路径仍执行冻结 v1.0 development replay；
- `--tsb-occurrence-public` 只读取公开 fixture；
- `--tsb-occurrence` 复用同一 materializer、manifest 校验和 case join。

新增 package scripts 只是同一 runner 的受控模式，不是平行 runtime：

- `diagnose:m2:human-anchored-tsb-occurrence`
- `develop:m2:current:human-anchored-tsb-occurrence`

公共命令进入 command lifecycle 的 `current-public` 列表；private development
继续由既有 `develop:m2:` restricted prefix 管理。

## 数据边界

`materialize_human_anchored_cases.py` 在既有 ignored private history 中增加：

- 从不早于 2021-01 的首个真实分成观察月开始；
- 截止 case origin；
- observed positive series；
- separate reversal series；
- 首次观察后的零发生月份；
- `unobservedMonthsZeroFilled=false`。

验证器要求 positive/reversal 数组长度一致、非负、非空、截止月等于 origin，
并继续验证：

- `actualPositive - actualReversal = actual`；
- 分成账单 mapping coverage 为 1；
- 金额守恒差为 0；
- 未成熟标签零填充为 0；
- buyout/pre-2021/post-2025 均未进入候选。

## nested 选择与泄漏审计

- work-level 主评估使用确定性 5-fold；训练折不读取验证作品；
- TSB 只在预注册 27 组合内选择；
- inner fit 只读更早 origin 且 `labelAvailableAsOf <= inner origin` 的训练行；
- strict outer training 只读 `origin < outer` 且
  `labelAvailableAsOf <= outer` 的行；
- outer 指标没有改变网格、公式或 tie-break；
- exact-v0.3 overlap 复用相同 work fold 的已选参数，没有根据 overlap 指标重选；
- 2023-01 至 2023-04 later-origin 块和 final holdout 均未进入执行。

## FVA 与 fallback 审计

公开结果同时保留：

- pure raw TSB；
- pre-fallback inner-selected blend；
- post-gate selected pipeline。

失败后 selected pipeline 精确恢复 `lambda=0`，但 raw/blend FVA 继续保留负值。
单测验证 `lambda=0` 与 learnedGlobal common-reversal 数值相等。

## public/private 与隐私

public synthetic fixture 不读取任何 private 文件。公开 development JSON、Markdown
和公共 M2 diagnostic 只包含聚合数值，不包含：

- private 账单行；
- 作品 ID；
- 渠道 ID；
- 连接串、密钥或环境变量；
- private 文件 digest；
- 本机绝对 private 路径。

逐 case 评估只写入 Git ignored 的
`data/private-output/m2-current-human-anchored/`。

## 查重结果

全库 `rg` 审计确认：

- canonical core 只有一个 `fitM2CurrentTsbProcess`；
- 当前候选只有一个 domain module
  `src/domain/m2Current/humanAnchoredTsb.js`；
- 没有新增旧 `m2-real-data` runner、adapter 或 provider 路线；
- 没有新增第二候选、DeepAR、TFT、Tweedie、层级贝叶斯或其他模型入口；
- 没有重复 package script 名称；
- public diagnostic、private development 与 verify 均指向同一现有 runner。

## 验证范围

完成并通过：

- Node syntax checks；
- Python materializer fixture self-test；
- TSB canonical helper、27 网格、`lambda=0`、冲销隔离、无观察零填充拒绝单测；
- 既有 human-anchored 与 M2 current 相关回归；
- public synthetic diagnostic；
- capability doctor；
- authenticated local private development；
- 公共 M2 diagnostic v0.13。

仓库全量门禁、Linux/Windows CI 和 merge 状态在 PR 阶段另行记录；任何失败必须
按实际结果报告。
