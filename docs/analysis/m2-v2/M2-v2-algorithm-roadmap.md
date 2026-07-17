# M2 v2 算法路线研究

## 结论与排序

当前不应直接训练新模型。基于 7,851 个 formal-cash case、824 部可比作品、稀疏/间歇收入、缺少历史外部证据快照和 C1–C3 的失败证据，建议的研究优先级为：

1. **Route A + E + F 组合**：保留 B4 现金锚点，由受控搜索/外部证据层自动生成 as-of structured features，再用 CatBoost/LightGBM/XGBoost 做 B4 residual learning；LLM 只抽取证据、评分和解释。
2. **Route C**：Bayesian hierarchical forecasting 作为作者/分类/作品 partial-pooling 的独立 benchmark，重点服务长尾和新信息稀疏场景。
3. **Route D/B 延后**：DeepAR/N-BEATS/PatchTST/TFT 仅在形成更长、更密集的多变量 as-of panel 并证明简单路线到达容量上限后再评估。

这不是 C4 立项，也不授权训练。第一步是冻结 v2 PRD、evidence contract、Human baseline 和 prospective snapshots。

## 共同设计边界

所有路线必须：

- 保持 formal cash target 不变；
- 不预测未承诺未来买断；
- 纯买断无承诺时 null abstain；
- 使用相同 scoreability、case keys、origins、seeds 和 seals；
- 在 final holdout 前预注册特征、模型、超参数、fallback 和 gate；
- 只输出一个点值、年度拆分、confidence、limitations；
- 内部 PI 只用于 coverage/WIS；
- 报告全部 scoreable、served 与 abstention；
- B4 始终保留为 comparator 和 fallback；
- 不以复杂度替代统计显著性与业务覆盖。

## Route A：B4 + Residual Learning

### 适配性

**当前最适合的统计路线，但前提是先补信息。** 7,851 case 的规模可支持受强约束的 tabular boosting；824 部作品要求严格按 work × origin 切分，不能把重叠 case 当独立样本。类别、缺失值、非线性和交互是 boosting 相对当前线性/规则 residual 的优势。

### 目标变量

用户提出的 `actual / B4` 在以下场景不稳定：

- B4 接近 0 时比值爆炸；
- actual 为 0 时形成大量离散边界；
- route abstention 时 B4 为 null；
- 长尾极端值主导损失。

推荐按预注册 ablation 比较：

1. `log1p(actual) - log1p(B4)`；
2. 以 B4 scale 归一、截尾的 signed residual；
3. zero/positive hurdle + positive residual；
4. 直接预测 correction factor，但限制范围并保留 B4 fallback。

不得只选择 development 上最优 target 后再声称预注册。

### LightGBM、XGBoost、CatBoost

| 库 | 适用点 | 风险 | 当前建议 |
|---|---|---|---|
| CatBoost | 类别特征、缺失、ordered target statistics；适合作者/分类/来源等混合特征 | 小样本仍可能过拟合；需严格 group-time split | 首选研究候选 |
| LightGBM | 高效、非线性、单调约束和类别支持 | 叶子优先生长在小数据上需强约束 | 同级 benchmark |
| XGBoost | 成熟、正则化、SHAP/feature map 生态 | 类别处理与数据管道需明确 | 同级 benchmark |

官方能力参考：

- [CatBoost categorical features](https://catboost.ai/docs/en/features/categorical-features)
- [CatBoost ordered categorical processing](https://catboost.ai/docs/en/concepts/algorithm-main-stages_cat-to-numberic)
- [LightGBM parameters](https://lightgbm.readthedocs.io/en/stable/Parameters.html)
- [LightGBM features](https://lightgbm.readthedocs.io/en/latest/Features.html)
- [XGBoost feature map and SHAP](https://xgboost.readthedocs.io/en/stable/contrib/featuremap.html)

### 可解释性

- 全局：特征组 ablation、permutation importance、SHAP summary；
- 单 case：B4 anchor、校正方向、主要证据 IDs、单调/范围约束；
- 稳定性：跨 origin 的 feature importance 与 correction sign；
- fail-closed：无合格外部证据或 out-of-distribution 时返回 B4。

### 预期提升

当前没有可估计的外部特征 uplift。合理的研究目标不是承诺百分比，而是至少通过冻结 gate：总体与关键 horizon 有预注册的实质改善、paired block-bootstrap CI 支持、bias 不恶化、高价值与 TopK 不回退。若 evidence pilot 之后 internal+external ablation 仍不能稳定超过 B4，应终止该路线。

## Route B：Temporal Fusion Transformer

TFT 面向多 horizon、多变量、静态与时变协变量，并提供 variable selection 与 attention 解释。原始论文：[Temporal Fusion Transformers](https://arxiv.org/abs/1912.09363)。

### 当前适配性

偏低：

- 3,053 是作品总量，但 formal-cash 共同模型人口只有 824 部；
- 月序列较短、稀疏、间歇且路由异质；
- 当前没有可回放的历史外部时变协变量；
- C3 的有效信息仅 20 项内部聚合；
- 深度模型的 validation variance、调参空间和泄漏面更大；
- 解释不等于因果，attention 不能直接作为业务证据。

### 何时重评

- 至少积累多个 origin 的 prospective external snapshots；
- 有稳定的静态和时变 covariates；
- 有足够非重叠作品与月份支撑独立 validation；
- Route A/C 已达容量上限；
- 有冻结的训练预算、early stopping、seed variance 和 serving 成本门槛。

当前结论：**DEFER**。

## Route C：Bayesian Hierarchical Forecasting

### 适配性

中高，尤其适合：

- 作者 → 分类 → 作品的层级借力；
- 长尾、稀疏作品的 partial pooling；
- 在数据少时表达不确定性；
- 将群体先验与作品历史分离；
- 输出可审计的层级贡献。

### 设计候选

- hurdle：收入是否发生 + 正收入金额；
- 层级 random effects：作者、一级/二级/三级分类、收入模式；
- 作品级趋势与 shrinkage；
- B4 作为 offset 或 prior mean；
- 外部 evidence score 作为 time-varying covariate；
- pure-buyout 无承诺仍不进入现金模型。

### 风险

- 作者/分类层级是否足够密集需先审计；
- 超大作者/小类别可能不平衡；
- inference 成本和收敛诊断；
- 层级字段必须有 cutoff-as-of 快照；
- prior 不能用 holdout 调整。

### 预期提升

更可能改善长尾稳定性、bias 和不确定性，而非保证总体 WAPE 大幅下降。应作为与 Route A 独立的简单层级 benchmark，而不是直接堆叠进复杂系统。

## Route D：Probabilistic Forecasting

### DeepAR

DeepAR 用跨大量相关序列训练自回归概率模型，适合具有共同模式的多序列场景。论文：[DeepAR](https://arxiv.org/abs/1704.04110)。当前作品数有限、零膨胀和路由差异大，且产品不外发区间，收益主要限于内部校准，优先级低。

### N-BEATS

N-BEATS 是强单变量深度基线并提供趋势/季节分解变体。论文：[N-BEATS](https://arxiv.org/abs/1905.10437)。当前 B4 的平坦路径确有改进空间，但短、稀疏序列可能不足以发挥深度容量。

### PatchTST

PatchTST 以 patch 和 channel independence 处理长上下文。论文：[PatchTST](https://arxiv.org/abs/2211.14730)。本项目历史长度和间歇性与其典型长、密集 benchmark 不匹配，外部变量融合也需额外设计。

### 结论

三者当前均为 **DEFER**。若未来进入研究，应先与 seasonal naive、B4、Croston family 和 tree residual 做相同 case-key 的成本/收益比较；不能因模型新颖而降低 gate。

## Route E：LLM Judge + Structured Features

### 推荐角色

- 外部来源实体消歧；
- 事件、作者、原作、改编、市场事实提取；
- 证据可靠性、时效与冲突评分；
- IP 商业价值维度评分；
- 风险与 limitations；
- 基于已引用证据的中文解释。

### 禁止角色

- 直接预测未来收入金额；
- 用模型记忆替代来源；
- 猜测未承诺买断；
- 根据 final holdout 调整提示词或评分阈值；
- 生成自动运营动作。

### 评价

- schema validity；
- evidence precision/recall；
- entity resolution accuracy；
- unsupported claim rate；
- contradiction handling；
- repeatability across model versions；
- incremental model value；
- 中文业务抽检。

结论：**推荐作为 feature/evidence processor，不作为 revenue forecaster。**

## Route F：Agent Search / Browser Research Layer

### 推荐架构

- Query Planner；
- provider abstraction；
- search API 优先；
- 结构化 API 次优先；
- Chrome/Playwright 仅作允许来源的例外路径；
- LLM 提取后进入 evidence store；
- 预算、超时、allowlist、审计、缓存、版本锁；
- 失败时不阻断 B4 fallback。

### 适配性

高，原因是它直接扩展当前模型信息集，并能把旧 M2 PRD 中未落地的“外部热点/重大事件”转为可审计数据。但它首先是数据工程和治理路线，而不是模型路线。

结论：**推荐先做小规模 evidence pilot 和 prospective shadow；不建议把浏览器自动化作为全库生产主链路。**

## 路线比较

| Route | 当前数据适配 | 新数据依赖 | 可解释性 | 工程/治理成本 | 当前决策 |
|---|---|---|---|---|---|
| A Tree residual | 中高 | external/as-of 可显著增强 | 高 | 中 | 第一统计候选，尚不训练 |
| B TFT | 低 | 长、密、多变量 panel | 中 | 很高 | 延后 |
| C Bayesian hierarchy | 中高 | 作者/分类 as-of 层级 | 高 | 中高 | 第二统计候选 |
| D DeepAR/N-BEATS/PatchTST | 低至中 | 更长密集序列 | 中低 | 高 | 延后 |
| E LLM structured judge | 高 | 引用来源与 schema | 高（证据级） | 中 | 推荐 evidence processor |
| F Agent research layer | 高 | provider/source governance | 高（全链路） | 中高 | 推荐先行 pilot |

## 研究验收设计

在任何候选训练前冻结：

- feature manifest 与 as-of availability；
- entity resolution 和 evidence quality gate；
- target transform、loss、超参数空间与 seed；
- group-time nested validation；
- B4 fallback 和 correction cap；
- internal-only/external-only/combined ablation；
- all-scoreable、served、abstention、value/horizon/route 分层；
- paired work × origin block bootstrap；
- complexity/cost/latency gate；
- final holdout 不用于选择。

建议最小实验顺序：

1. B4 不变；
2. internal-only CatBoost/LightGBM/XGBoost，验证 C3 结论的模型家族边界；
3. external-only 特征；
4. internal + external；
5. Bayesian hierarchy；
6. 只有简单路线稳定过 gate，才评估组合；
7. 深度模型最后。

## 运行时与依赖缺口

当前仓库没有 `requirements.txt`、`pyproject.toml` 或等价 Python lock。引入任何新算法库前必须先定义：

- Python 版本；
- CPU/GPU 边界；
- lockfile 与 artifact checksum；
- deterministic seeds 与线程设置；
- 训练/推理资源和最大时长；
- 模型序列化格式与兼容策略；
- SBOM、许可证与漏洞扫描；
- 无外部证据时的 B4-only 运行模式。

本轮不新增依赖、不训练模型、不开始 C4。
