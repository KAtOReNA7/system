# M2 LG01 头部现金残差校准预注册 v0.1

状态：已预注册、尚未读取本实验外层结果
（`M2_LG01_HEAD_CASH_RESIDUAL_PREREGISTERED_NOT_EXECUTED`）。

本实验为 M2 LG01 头部现金残差校准 v0.1
（M2 LG01 Head-Cash Residual Calibration v0.1，
`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01`），候选模型身份为
LG01 头部现金残差校准模型 v0.1
（LG01 Head-Cash Residual Calibration Model v0.1，`M2-WORK-HCRC01`）。
建议 ID 在当前模型登记表中无冲突，因此没有递增改名。

本方向是在读取核心老品分周期金额模型 v0.1
（Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）
结果后提出，只能形成探索性开发证据
（`EXPLORATORY_DEVELOPMENT_EVIDENCE_NOT_INDEPENDENT_CONFIRMATION`）。

## 固定问题与范围

唯一问题是：能否在不破坏人工锚定可学习全局模型
（Human-Anchored Learned Global，`M2-WORK-LG01`）头部现金表现、也不产生
数值爆炸的前提下，对 CHAM01 的三个月 B3 残差信号做有界、交叉拟合、可回退校准。

主评价固定为 Strict rolling Core80、三个月、作品总额、同案例比较冻结 LG01；
Strict rolling Core90 是敏感性人口。Primary 只作原始数值稳定性、人口和分布诊断；
没有合法 LG01 同案例时保持不可比较（`NOT_COMPARABLE`）。

不执行 6、12、36 个月，不加入新作品、未来首次渠道、Core 外长尾、渠道分配、
taxonomy、三级分类、作品来源、会员/广告/单购机制、公司目标或组合缺口。

## 四个固定实验臂

| 所属实验与实验臂 | 中文名称（英文原名） | 作用与资格 |
|---|---|---|
| `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C0` | 冻结 LG01 三个月同案例基线（Frozen LG01 Three-Month Same-Case Baseline） | 研究比较基线；`alpha=0` 只表示回退 |
| `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C1` | 冻结 CHAM01 B3 三个月原始诊断参考（Frozen CHAM01 B3 Three-Month Raw Diagnostic Reference） | 只作历史诊断，不具备通过资格 |
| `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C2` | 全局有界残差混合（Global Bounded Residual Blend） | 原始探索候选 |
| `M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/C3` | 头部现金带保护的有界残差混合（Head-Cash-Band Protected Bounded Residual Blend） | 原始探索候选 |

不得增加第五个实验臂，也不得用安全回退后的 selected pipeline 代替原始候选成绩。

## 有界残差

对合法同案例行固定：

```text
base = frozen LG01 prediction
raw = frozen CHAM01 B3 prediction
residual = raw - base
floor = earlier-inner-origin positive base q10
scale = max(abs(base), floor)
normalizedResidual = residual / scale
boundedResidual = scale × clip(normalizedResidual, earlier q05, earlier q95)
```

分位数使用 `(n-1) × p` 位置的线性插值。正 base floor、残差上下界和数值安全边界
都只使用当前 outer origin 之前、标签在相应 inner origin 已成熟的行；至少需要两个
独立更早 origin。支持不足或任一输入、scale、边界为非有限值时，该行回退到所属
实验的冻结 LG01 基线，并单独计数，禁止填 0、均值或其他周期。

全局有界残差混合的固定 alpha 网格为 `0.25 / 0.50 / 0.75 / 1.00`。
每个 outer origin 只用更早 inner origins 按以下字典序选择：

1. 排除数值稳定性失败；
2. 排除绝对 signed bias 比冻结 LG01 恶化超过 0.01；
3. 排除 H50 绝对误差恶化；
4. 最小化 Core80 现金绝对误差总和；
5. 完全并列选择更小 alpha；
6. 无合格 alpha 时回退冻结 LG01。

## 头部现金带与收缩

每个 origin 的 Strict Core80 按起点可见 trailing-12 分成现金的非负部分降序排列，
使用稳定内部作品键打破并列。累计约前 50% 为 H50，随后约 30% 为 M30，剩余为
L20；跨越边界的作品整体留在更高现金带。

头部现金带保护臂仍从相同 alpha 网格产生带内候选，但其证据按全局 alpha 收缩。
收缩权重只由独立时间块、有限起点现金覆盖、Kish 现金有效样本比和数值稳定性连续
计算；少于两个独立时间块时直接采用全局 alpha。没有 50/100 部作品等固定行业门槛，
也不为单一作品拟合 alpha。

## 数值稳定性硬门

本实验不进行 inverse transform。对每个 outer fold、实验臂和 alpha，使用更早
inner origins 的稳定 prediction/base 比率形成 q01/q99 核心范围，并用
`q01 - 1.5×IQR` 与 `q99 + 1.5×IQR` 固定安全边界。分母使用带符号的
`max(abs(base), floor)`，避免近零 base 伪造无限比率。

所有正式预测必须有限。任何外层原始候选越界都必须保留原始证据并登记数值失败
（`NUMERIC_STABILITY_FAIL`）；selected pipeline 可以安全回退冻结 LG01，但该回退
不得使原始实验臂通过。Primary/Core90 不得复现 CHAM01 的有限但极端外推。

## 评价、门禁与最终状态

每个实验臂均报告 cases、actual/predicted cash、WAPE、signed bias、MAE、中位绝对
误差、相对冻结 LG01 的配对 FVA、2,000 次完整作品聚类 bootstrap 95% 区间、独立
时间块胜负、三现金带指标、起点 Top20/Top50 误差、单作品及 top5/top10 误差集中度、
回退/弃权、非有限/边界触发，以及 prediction/base 比率 p50/p90/p95/p99/max。
原始候选与选定回退管线分开报告。

确认级开发通过
（`M2_LG01_HEAD_CASH_RESIDUAL_CONFIRMED_DEVELOPMENT_PASS`）必须同时满足：

- Core80 配对 FVA 至少 1%，作品 bootstrap 95% 下界大于 0；
- 独立时间块改善占比大于 50%；
- 绝对 bias 不超过冻结 LG01 的绝对 bias 加 0.01；
- H50 绝对误差至少改善 1%；
- 最大单作品误差占比和 top10 误差集中度各不得恶化超过 2 个百分点；
- 所有数值硬门通过，Core90 不出现相反的实质退化。

有希望但未确认
（`M2_LG01_HEAD_CASH_RESIDUAL_PROMISING_UNCONFIRMED`）还必须满足 Core80 FVA 至少
1%、多数时间块改善，以及 bias、H50、集中度与数值护栏全部通过，只允许 bootstrap
区间仍跨 0。其他情况为失败（`M2_LG01_HEAD_CASH_RESIDUAL_FAIL`）。

## 执行与停止边界

私有权威输入缺失才允许阻断
（`M2_LG01_HEAD_CASH_RESIDUAL_BLOCKED_MISSING_PRIVATE_AUTHORITY`）；派生缓存缺失必须
自动重建，历史收据缺失只告警。任何完整合法 C0–C3 外层结果形成后立即冻结，禁止
第二次评价、结果后调参或增加实验臂。

`activeCandidate=null`、`approvedForAutomation=null`。不修改 production loader、
route、API、现行运行回退或 exact v0.3；不打开 later-origin、final holdout、
Canary/full160、release、数据库、provider 或 M3 formal，也不合并本实验的草稿
拉取请求。
