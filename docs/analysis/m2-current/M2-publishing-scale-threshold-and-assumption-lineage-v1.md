# M2 出版行业阈值与假设谱系总账 v1

## 技术结论

渠道时间生成模型 v0.2 的机制父层 `50` 部作品门槛，以及平台/三级分类的 `100`
部作品门槛，首次整体写入提交
`36125b451d00489cec900a8140d61f3a91904fed`
（`docs(m2): preregister minimal channel generative v0.2`），随后随 PR #28
进入 `main`。原始文件只说明它们是 outcome 之前冻结的通用支持门和“小型对数网格”；
没有本出版社的 SKU—作品换算、真实人口、有效样本量、集中度、分组学习曲线、
系数稳定性或 leave-one-work-out 证据。

因此，这些值是合规预注册的历史假设，但不是经本项目真实出版数据证明的当前行业
真理。历史配置、报告、分数和资格阻断继续保留；新合同必须使用新版本向前生效。

## 数值不能一概删除

本次将数值分为六类：

1. **业务规模/统计支持假设**：机制 `50`、平台/分类 `100`、行数
   `500/1000`、正事件 `30/50/100`。缺少项目信息，应由 support tier、有效样本
   量和训练侧稳定性取代单一 pass/fail。
2. **算法参数**：发生/金额 L2 `[1,10,100]`、历史 shrinkage
   `[20,80,240]`、各机制 time basis。只能用 training-side grouped validation
   校准，不能读 outer outcome 反推。
3. **评价 materiality**：相对 WAPE `1%`、top 10% `1%`。这是业务决策门，
   不能因为出版行业样本小就自动降低。
4. **稳定性/安全门**：6/11 时间块、4/6 horizon、top 1%/5% 不恶化超过 1%、
   bias 恶化不超过 1 个百分点。继续作为治理门，并与拟合资格分开。
5. **不确定性方法**：2,000 次完整 standard-work cluster bootstrap。它修正了
   早期不完整做法，与行业 SKU 规模无关，继续保留。
6. **数值与隐私安全**：IRLS/ridge 收敛容差、超时、公开 cell 最少
   30 case/20 work/5 origin。它们不应被误写成节点业务支持门。

机器可审计的逐项来源、首次提交、原始理由、证据状态、分类和向前决策见同名 JSON。

## 全仓影响

向前版本不能只修改 runtime config。必须同时闭合：

- 出版行业统计支持合同与 PRD amendment；
- 新的 versioned model revision/experiment arm；
- mechanism、platform、taxonomy 的分层 support tier；
- training-side learning curve、effective sample size、集中度、稳定性和
  leave-one-work-out；
- runtime、runner、validator、报告器、Model Registry、中文目录、测试、
  M2 scoped AGENTS 与最新状态索引；
- 历史 artifact verifier 对旧 `50/100` 版本的继续读取。

本总账生成前没有读取或生成新的候选 outer outcome。
