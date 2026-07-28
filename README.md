# 有声书产品收入评估与年度目标系统

<div align="center">

**从可信账单到可审计预测：公开工程底座、受控 M2 研究与合成 M3 原型**

[![CI](https://github.com/KAtOReNA7/system/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/KAtOReNA7/system/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/Node-24.x-339933?logo=nodedotjs&logoColor=white)
![npm](https://img.shields.io/badge/npm-11.13.0-CB3837?logo=npm&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11%E2%80%933.13-3776AB?logo=python&logoColor=white)
![M2](https://img.shields.io/badge/M2-AUTOMATION_BLOCKED-B45309)
![Privacy](https://img.shields.io/badge/private%20data-Git%20ignored-2563EB)

</div>

<p align="center">
  <img src="docs/assets/readme/readme-hero-audiobook-revenue-system.svg"
       alt="从图书和有声书、渠道与账单，到预测模型和人工决策的项目流程图"
       width="100%">
</p>

本仓库统一维护三层能力：

- **M1 数据基础**：账单、作品、渠道等身份和数据质量治理；
- **M2 预测研究**：旧产品未来分成收入现金的可复现、可审计预测；
- **M3 合成原型**：不依赖真实材料的产品演示和方案验证。

> [!IMPORTANT]
> 当前仓库的公开工程基线可安装、构建、测试和启动，但**没有模型获准自动化或生产发布**。
> `production`、final/later-origin holdout、Canary/full160、provider、共享数据库和
> M3 formal 均保持关闭。

## 30 秒了解项目

| 你可能关心的问题 | 当前答案 |
|---|---|
| 这个项目预测什么？ | **未来分成收入现金**；买断及其他非分成现金不进入 M2 预测目标 |
| 当前可以直接使用哪个模型？ | 作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）仅作为**现行运行回退** |
| 当前研究比较基线是什么？ | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） |
| 是否已有生产模型？ | 没有；`activeCandidate=null`，`approvedForAutomation=null` |
| 最新渠道模型结果如何？ | 出版行业规模适配渠道核心（`M2-CHAN-PSC01`）已实际执行并失败，不是“尚未运行” |
| 没有真实账单能否开发？ | 可以完成公开安装、构建、测试、启动、查询和合成 fixture；只会阻断所属 private capability |
| Linux 和 Windows 为什么都验证？ | 确保同一公开提交在两套主要开发环境中具有一致的可移植性和无私有数据门禁 |

最新状态以 [M2 当前状态索引 v0.37](docs/analysis/m2-v2/M2-v2-current-state-index-v0.37.md)
为准；模型名称、角色、别名、谱系和可比组以
[Model Registry](config/m2-model-registry.v1.json) 为唯一当前机器权威。

## 系统地图

<p align="center">
  <img src="docs/assets/readme/readme-system-map.svg"
       alt="M1 数据基础、M2 预测研究和 M3 合成原型的系统地图，以及 M2 当前模型角色"
       width="100%">
</p>

### 现在能做什么

- 在没有 private 数据、数据库和 provider key 的新电脑上复现公共工程基线；
- 查询当前模型身份、角色、别名、谱系和成绩可比性；
- 运行 formal/fixture 两种 composition，并验证 `/health`；
- 审阅公开脱敏的模型结果、评价合同、失败证据和治理状态；
- 在单独授权并具备对应 private capability 时执行受控研究。

### 明确不能做什么

- 把现行运行回退或研究基线解释为 production champion；
- 用安全 fallback 或 selected pipeline 掩盖 raw candidate 的失败；
- 在缺少 forecast-origin 可见证据时用当前状态回填历史；
- 将作品点预测、组合预测、排序/分配和风险区间放入同一排行榜；
- 提交真实账单、private input/output、凭据、数据库或冻结行级证据；
- 未经独立授权打开 production、final holdout、自动化、发布或 M3 formal。

## 当前模型角色

| 能力 | 中文名称（英文原名、稳定 ID） | 当前角色 | 需要怎样理解 |
|---|---|---|---|
| 作品点预测 | 作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 现行运行回退（operational fallback） | 可以作为已有现金历史的保守锚点，但尚未通过绝对质量与自动化门槛 |
| 作品研究比较 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 研究比较基线（research baseline） | 用于同人口候选比较，不等于 production 晋升 |
| 组合预测 | 组合现金 ETS/Holt-Winters（Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`） | 组合级参考（portfolio reference） | 3/6/12 月必须分别评价，组合结果不能分配回作品 |
| 渠道预测 | 出版行业适配渠道月度发生—条件金额核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`） | 已执行失败候选 | raw candidate 已冻结；不允许同窗 outcome-driven 调参 |

当前没有活动候选和自动化批准模型。完整历史模型、实验臂、别名和成绩总账见
[M2 模型目录与成绩总账](docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md)。

## 最新研究结论

出版行业规模适配渠道核心（`M2-CHAN-PSC01-RAW`）已完成首个完整、同人口、可解释的
原始候选评价，共冻结 `3,318,819` 行预测：

| 同人口评价 | 冻结研究基线 WAPE / signed bias | `M2-CHAN-PSC01-RAW` WAPE / signed bias | 结论 |
|---|---:|---:|---|
| Primary | `0.44310049 / -0.12165171` | `0.92408663 / -0.88928240` | WAPE 恶化 108.55% |
| Strict | `0.41281268 / -0.03786001` | `0.91533339 / -0.85410647` | WAPE 恶化 121.73% |

这次结果证明的是**当前独立渠道发生—条件金额实现失败**，并不等于出版渠道业务机制
理论已经被否定。主要问题是条件正金额严重低估；机制时间结构仍表现出约 5% 的局部
信息增益。下一步需要先审计金额尺度塌缩与比较器完整性，再决定是否建立新的、有总量
锚定与守恒约束的候选。

详细证据：

- [出版规模渠道开发评价](docs/analysis/m2-current/M2-current-publishing-scale-channel-development-v0.1.md)
- [出版规模渠道可预测性诊断](docs/analysis/m2-current/M2-current-publishing-scale-channel-forecastability-v0.1.md)
- [M2 当前状态索引 v0.37](docs/analysis/m2-v2/M2-v2-current-state-index-v0.37.md)

> 不同预测目标、粒度、人口、horizon、评价窗口或 actual 定义的成绩不能直接排名。
> WAPE 与 signed bias 是必要指标，但不足以单独评价 occurrence、条件金额、排序、
> 组合预算、风险区间和时间稳定性。

## 推荐阅读路径

<p align="center">
  <img src="docs/assets/readme/readme-reading-path.svg"
       alt="从业务目标、模型角色、公开复现到证据与限制的推荐阅读路径"
       width="100%">
</p>

### 给业务读者

1. 先读 [M2 Forecast Intelligence v2 PRD](docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md)，
   明确预测目标、使用场景和禁止外推的边界；
2. 再读 [M2 模型目录与成绩总账](docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md)，
   理解模型、实验、状态码和当前角色；
3. 最后读 [M2 当前状态索引 v0.37](docs/analysis/m2-v2/M2-v2-current-state-index-v0.37.md)，
   查看最新结论、阻断项和下一步。

### 给开发者

1. 先读 [协作规则](AGENTS.md) 和
   [M2 canonical core 局部规则](src/domain/m2Current/AGENTS.md)；
2. 通过 [Model Registry](config/m2-model-registry.v1.json) 和只读命令解析模型身份；
3. 从 [`src/domain/m2Current/`](src/domain/m2Current/) 与
   [`scripts/m2-current/`](scripts/m2-current/) 进入当前实现；
4. 用公共门禁复现工程，再按 capability doctor 判断私有能力是否可用。

## 五分钟开始

### 工具链

- Git
- Node 24.x
- npm 11.13.0
- Python 3.11–3.13（CI reference 为 3.13）

项目通过 `scripts/resolve-compatible-python.mjs` 解析兼容 Python；不要把某台电脑的
绝对 Python 路径、仓库路径、预置 HEAD 或本地文件 digest 写进公共任务门禁。

```bash
git clone https://github.com/KAtOReNA7/system.git
cd system
npm ci
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run smoke:portable-start
npm run test:e2e
npm run verify:m2:current
```

上述公共基线不会读取 `data/private-input/**`、`data/private-output/**`、`.env`、
`.pgpass`、数据库 dump 或任何 provider/API key。

## 启动方式

启动 formal composition：

```bash
npm start
```

启动合成 fixture composition或开发热重载：

```bash
npm run start:fixture
npm run dev
```

formal composition 在无数据库时仍应启动并通过 `/health`；数据库业务接口会明确返回
degraded/unavailable，不会静默回落到 fixture。

## 查询当前模型

```bash
npm run m2:model -- status
npm run m2:model -- list
npm run m2:model -- show M2-WORK-OA03
npm run m2:model -- aliases exact-v0.3
npm run m2:model -- experiment M2-EXP-PUBLISHING-SCALE-CHANNEL-01
npm run m2:model -- compare M2-WORK-OA03 M2-WORK-LG01
```

这些命令只读取公开 Model Registry；不会训练模型、读取 private capability、生成预测
或改变 production。

## 预测目标与评价原则

M2 的正式预测对象是**未来分成收入现金**：

- 买断及其他非分成现金在模型外独立审计；
- pure-buyout 必须 `null abstain`，不能用 0、承诺金额或月均等效值替代预测；
- 分成账单是 actual 的唯一现金来源，总账仅用于守恒审计；
- 所有特征必须证明在 forecast origin 可得；
- 发生概率、条件金额、总量校准、排序、组合和区间风险分别评价；
- raw candidate 必须单独报告，不能被 fallback 后的 selected 结果掩盖；
- 模型晋升需要同人口、跨时间块和独立 later-origin 证据。

评价合同 v2.2 当前仅作为**开发评价合同**，并透明披露无法分配的冲销残差隔离；它不
授予 production、automation 或 release 权限。详情见
[评价合同 v2.2](docs/analysis/m2-current/M2-evaluation-contract-v2.2.md)。

## Public / Private 边界

| 类型 | 示例 | 缺失时如何处理 | 是否进入 Git |
|---|---|---|---|
| 公开工程与脱敏聚合 | 代码、测试、配置、PRD、聚合报告 | 公共门禁必须通过 | 是 |
| 私有来源权威（`PRIVATE_SOURCE_AUTHORITY`） | 原始账单、人工确认、真实主数据 | 仅阻断所属 capability | 否 |
| 可重建私有派生缓存（`PRIVATE_DERIVED_CACHE`） | 冲销协调结果、派生物化缓存 | 从来源权威与冻结代码自动重建 | 否 |
| 私有运行溯源（`PRIVATE_RUN_PROVENANCE`） | 历史 receipt、运行环境记录 | 缺失告警，不作为跨电脑开发硬阻断 | 否 |
| 冻结私有证据 | 行级预测、评价行、manifest、digest | 保留或可验证冷归档，不能按年龄直接删除 | 否 |

这样可以同时满足两件事：真实材料不会被推送到远端；更换电脑时，可重建缓存或历史
收据缺失也不会反复阻断公开开发。

## 仓库结构

| 路径 | 用途 |
|---|---|
| `src/` | 应用与 domain runtime |
| `src/domain/m2Current/` | 当前 M2 canonical core |
| `scripts/m2-current/` | 当前 M2 查询、诊断和受控执行入口 |
| `test/` | 公共、合同、历史、private-safety 与 E2E 测试 |
| `db/migrations/` | 唯一 forward-only Flyway migrations |
| `config/` | 模型、能力、工具链、测试和命令生命周期合同 |
| `docs/prd/` | 产品需求权威 |
| `docs/analysis/` | 公开脱敏分析与历史审计证据 |
| `data/` | 本地 private capability 与冻结证据；默认不进入 Git |

历史 PR、旧分支、B0–B8、C1–C3 和旧状态索引继续保留用于审计追溯，但不是当前执行入口。

## 文档导航

| 主题 | 当前入口 |
|---|---|
| 最新状态 | [M2 当前状态索引 v0.37](docs/analysis/m2-v2/M2-v2-current-state-index-v0.37.md) |
| 模型身份与角色 | [Model Registry](config/m2-model-registry.v1.json) · [中文模型目录](docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md) |
| 产品定义 | [M2 Forecast Intelligence v2 PRD](docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md) |
| 评价体系 | [v2.2 合同](docs/analysis/m2-current/M2-evaluation-contract-v2.2.md) · [v2.2 验证](docs/analysis/m2-current/M2-evaluation-contract-v2.2-validation.md) |
| 最新渠道实验 | [开发评价](docs/analysis/m2-current/M2-current-publishing-scale-channel-development-v0.1.md) · [可预测性诊断](docs/analysis/m2-current/M2-current-publishing-scale-channel-forecastability-v0.1.md) |
| 工程与协作 | [协作规则](AGENTS.md) · [命令生命周期](config/command-lifecycle.v0.1.json) |

## 安全与贡献

- 禁止提交真实账单、台账、原始材料、private input/output、Excel/CSV、环境文件、密钥、
  连接串或数据库文件；
- 禁止连接未授权的 production、共享或 staging-like 数据库；
- 正式 runtime 不得静默回落到 fixture；
- 新的 M2 实现扩展 canonical core，不复制历史 runner 创建平行路线；
- 不因命名或首页治理改写历史文件、稳定 ID、digest 或冻结结果；
- 提交前运行公共基线，并只暂存本任务明确涉及的文件。

完整协作、授权、验证与 Git 规则见 [AGENTS.md](AGENTS.md)。
