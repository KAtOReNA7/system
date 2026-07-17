# M2 Forecast Intelligence v2 最终建议

## 最终结论

1. **当前 B4 是否应该正式发布：NO。** B4 是可靠比较器和 fallback，但模型、高价值、18 月、业务覆盖、final holdout、业务批准和正式 serving 实现均未全部就绪。
2. **是否应该启动 M2 v2：YES，但只启动 PRD、evidence pilot、Human baseline 与 prospective shadow。** 不开始 C4，不训练，不打开 final holdout，不 release，不进入 M3。
3. **推荐路线：**第一，B4 + External Intelligence Layer + 受控 tree residual；第二，Bayesian hierarchical benchmark；第三，深度时序模型延后。
4. **外部工具：**搜索 Agent 和批准的外部 API 值得引入；GPT Web/OpenAI web search 适合研究与证据提取；Chrome 自动化仅作例外与人工监督路径；新算法库只在数据与合同 gate 后引入。
5. **人工输入：**不应要求用户常规逐作品补填。人工只用于有限 Human-vs-AI baseline、来源/冲突抽检、业务抽检与明确批准。

## 1. 当前 M2 真实能力判断

M2 已经具备：

- 3,053 部作品和 192,872 条收入事实的权威底座；
- formal-cash target 与 pure-buyout null abstention；
- 18,615 development cases、12,223 scoreable cases 和 7,851 formal-cash model cases；
- 严格 as-of、future perturbation、case parity、prediction lock、block bootstrap 与 seals；
- B4/C1/C2-R/C2-R.1/C2/C3 的完整 development 证据；
- 单点、年度拆分、confidence、limitations 的产品边界。

但当前能力仍是“可信的研究与比较系统”，不是已完成的正式商业智能 serving 系统：B4 位于校准脚本，正式 API/DB/export 仍有旧三情景字段，趋势、商业价值、排序、解释和外部证据没有独立验收。

## 2. B4 失败原因

B4 formal-cash WAPE 为 55.6485%、bias 为 +8.9111%。它不是全面失败，但未满足正式发布：

- high-value bias +12.0534%，超过 ±10%；
- 18 月 bias +15.5063%，超过 ±15%；
- 24 月 WAPE 79.2565%；
- 全库/Top10 forecastable cash coverage 为 73.9647%/75.9413%，低于 90%；
- final holdout 和业务批准未完成；
- 没有正式 B4 serving runtime。

根因不是单选题，但必须分开计分：

- **D 覆盖不足是已证明的发布硬阻断**：无买断承诺快照；abstained case 不进入模型 WAPE；
- **A 模型结构不足是 served sales 子集的直接证据**：平坦路径、线性 horizon、粗生命周期和低维统计量；
- **B 信息不足是领先但未证实的增量假设**：无历史外部快照、存在未匹配未来渠道现金，但尚无 external-feature ablation 或人工数值 baseline 证明加入后必然改善；
- **C 旧目标问题已修正**：formal cash 不应再改，但 cash 不能替代商业价值 target。

Gate A 13/13、Gate B/C/D 各 14/14 均已通过；它们证明对应开发阶段的预注册、人口、seals 和运行完整性，不代表候选模型通过。C1、C2-R.1、C2、C3 随后的模型验收仍全部 FAIL。

## 3. C1–C3 路线价值总结

| 路线 | 证明了什么 | 没有证明什么 |
|---|---|---|
| C1 | 冻结的 8 组件 transparent ensemble 与 positive-median fallback 对稀疏序列失效 | 不证明所有 ensemble 或 tree model 无效 |
| legacy C2-R | 旧买断周期/月均目标会产生灾难性偏差；路由工程可实现 | 不具 formal-cash 比较资格 |
| C2-R.1 | formal-cash 路由分治可降低 bias，但 45 个透明候选未稳定超过 B4 | 不证明更丰富 as-of 特征无效 |
| C2 | 硬活跃度分层、经典 intermittent 方法和 generic residual 未带来稳定提升 | 不证明层级模型、tree residual 或外部信息无效 |
| C3 | 20 项内部聚合特征下的透明/线性 residual 只有约 0.46% 相对 WAPE 改善 | 不证明 residual learning 整体无价值；未测试 boosting 和外部证据 |

C2-R.1 仅 2/5 origins 超过 B4，并在短 horizon、TopK 和内部区间门槛上失败；C2 与 B4 的 paired CI 包含 0，intermittent/dormant 仍弱；C3 仍仅 2/5 origins 超过 B4，3/6/12 月改善均未达 3%，TopK/WIS 改善不足，C3-S 因 strictly-earlier activation 证据不足而 skipped。

经验上未产生稳定价值的方向是：在同一内部信息集上继续搜索小公式、当前硬活跃度/间歇路由和当前透明/线性 residual。另有一组并非“效果差”而是规则禁止的方向：用历史周期预测买断、用 0 替代 abstention、以事后状态做历史特征。

仍值得研究：新的 cutoff-as-of 信息、作者/分类层级 partial pooling、受约束 tree residual、趋势/价值独立目标和证据驱动解释。

## 4. 人工预测信息来源分析

现有流程要求与记录覆盖收入趋势、生命周期、异常峰值、收入模式、作品状态、音频版权状态和版权期限事实。外部热点、作者影响力、原作表现、改编和市场趋势只存在于旧 PRD 或 M3 设计意图，尚未形成 M2 可回放证据。

项目没有同 cutoff 的人工点值预测，因此不能说人工比 B4 强。应新增：

- 120–200 个不同的回溯盲测 `work × origin` block，每个 block 覆盖适用 horizons；
- 2–3 reviewer；
- 同 evidence、同 cutoff、同 horizon；
- individual human、human median、B4、v2 candidate 比较；
- WAPE/bias/MAE、rank、TopK、trend、abstention、inter-rater 和耗时；
- 约 150 部 prospective shadow cohort。

## 5. External Intelligence Layer 可行性

结论是 **技术可行、业务假设合理、当前不能直接历史训练**。

建议结构为：实体解析 → 查询规划 → provider abstraction → 搜索/结构化 API → 允许页面的受控获取 → LLM schema extraction → 来源/时点/矛盾校验 → evidence store → as-of feature view → shadow evaluation。

核心规则：`evidence.availableAt <= cutoff`。今天网页不能回填旧 cutoff。先积累 prospective snapshots，才能评估真实 uplift。

供应商必须可替换：Google Custom Search 已对新客户关闭并计划停止现有服务，Bing Search API 已退役，说明不能把产品绑定到单一搜索 API。参考 [Google 官方说明](https://developers.google.com/custom-search/v1/overview) 和 [Microsoft 生命周期公告](https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement)。

## 6. 算法路线比较

| 排名 | 路线 | 结论 |
|---:|---|---|
| 1 | B4 + External Intelligence + CatBoost/LightGBM/XGBoost residual | 最匹配 tabular、小样本、类别与缺失；需先有 as-of evidence |
| 2 | Bayesian hierarchical | 适合作者/分类/作品 partial pooling 与长尾；作为独立 benchmark |
| 3 | TFT/DeepAR/N-BEATS/PatchTST | 当前 824 部 formal-cash works、短稀疏序列和无历史外生变量不足，延后 |

Route A 不建议直接用裸 `actual/B4`，因为 B4 接近 0 时不稳定。优先预注册比较 log residual、bounded signed residual 和 hurdle residual。CatBoost 的类别处理、LightGBM 的高效树模型、XGBoost 的成熟解释生态均适合 benchmark；任何预期提升目前都只是待验证假设。

深度路线的原始研究可参考 [TFT](https://arxiv.org/abs/1912.09363)、[DeepAR](https://arxiv.org/abs/1704.04110)、[N-BEATS](https://arxiv.org/abs/1905.10437) 和 [PatchTST](https://arxiv.org/abs/2211.14730)，但模型新颖度不能替代相同 case-key 的 gate。

## 7. M2 v2 是否必要

**YES。** 理由不是 C3 失败后必须换大模型，而是当前产品目标与信息结构存在真实缺口：

- cash 不能独立表达商业价值；
- trend、rank、TopK 和 explanation 没有独立 truth/gate；
- 旧 PRD 的外部事件意图没有落成数据角色；
- Human-vs-AI 尚未建立；
- API/DB/export 与正式合同未现行化；
- C1–C3 已表明在相同内部信息集上继续小幅公式迭代的边际价值低。

启动含义仅为研究和架构重构准备，不是开发 C4。

## 8. 推荐技术路线

### 第一优先：Evidence-first B4 anchored intelligence

- B4 保持不变并作为 fallback；
- 自动 External Evidence Layer；
- LLM 只提取、消歧、评分证据；
- 形成 prospective as-of snapshots；
- 之后预注册 CatBoost/LightGBM/XGBoost residual ablation；
- cash、trend、value、explanation、risk 分头验收。

### 第二优先：Bayesian hierarchical benchmark

- 作者、分类、收入模式、作品 partial pooling；
- B4 作 prior mean/offset；
- 对 long-tail/intermittent 的稳定性和 bias 进行独立验证。

### 第三优先：深度多变量时序

- 只有在证据面板足够长、密、稳定，且简单路线已达容量上限后再评估。

## 9. PRD 需要修改部分

1. 定义独立 commercial value target、truth 和版本；
2. 定义 trend actual window 与 macro-F1/balanced accuracy；
3. 增加 rank correlation、NDCG 和 TopK precision/recall；
4. 建立 Human-vs-AI baseline；
5. 建立 driver/evidence schema 与 explanation faithfulness；
6. 建立 External Evidence Coverage；
7. 定义成本、延迟、刷新、漂移、provider fallback 和依赖复现；
8. 统一 formal cash、point-only、null abstention、无建议和 C3 terminal 状态；
9. 现行化 DB/API/export/test；
10. 建立 M2 requirement traceability。

## 10. 是否需要人工输入

**不需要常规逐作品人工输入。** 必须自动获取外部证据；缺失时 B4 fallback、降 confidence 或 abstain。人工只承担：

- Human-vs-AI 基准；
- 来源白名单与矛盾抽检；
- 高风险/低置信结果验证；
- release 前中文抽检与明确批准。

## 11. 需要新增工具

| 工具 | 是否需要 | 边界 |
|---|---|---|
| Search Agent | YES | 有预算、allowlist、审计、fail-closed |
| Search/External API | YES | provider abstraction；许可与成本先评审 |
| GPT Web/OpenAI web search | YES，研究/二级提取 | 必须保留引用，不能作唯一不透明依赖 |
| Chrome/Playwright automation | CONDITIONAL | 少量允许来源、研究/诊断、人工监督 |
| CatBoost/LightGBM/XGBoost | LATER | evidence 与预注册 gate 后才引入 |
| Bayesian library | LATER | 层级密度审计后 |
| TFT/DeepAR/N-BEATS/PatchTST | NOT NOW | 长密 panel 与简单路线容量证据后 |

OpenAI web search 可用于带来源的研究编排，参考 [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)。浏览器自动化可通过 [Chrome DevTools Protocol](https://developer.chrome.com/docs/devtools/protocol-monitor) 与 [Playwright auto-wait](https://playwright.dev/docs/actionability)，但不应绕过网站条款或成为全库主链路。

## 12. 下一步建议

按下列顺序执行，并在每个 gate 后停下审批：

1. **V2-A：现行合同收口。** 统一 PRD/API/DB/export/test 的 point-only formal-cash 边界；定义 trend/value truth、evidence schema 和 Human baseline。
2. **V2-B：100–200 部 evidence pilot。** 只测覆盖、消歧、时效、矛盾、许可、成本和复现，不训练。
3. **V2-C：prospective shadow。** 自动积累多个 origin 的 as-of snapshots，并运行 Human baseline。
4. **V2-D：预注册算法实验。** 先 internal-only tree residual，再 external-only、combined、Bayesian；保持 B4 fallback。
5. **V2-E：业务与正式决策。** 只有全部 gate 通过，才允许单次 final holdout、中文抽检和明确批准。

当前停止点：研究文档完成后停止。未开始 C4，未训练新模型，未修改 B4，未打开 final holdout，未 release，未进入 M3。
