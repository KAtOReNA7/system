# 全库当前状态、冗余与首页收敛审计 v0.1

## 一句话结论

本轮对全部 Git tracked 文件、顶层入口、M2 canonical core、package scripts、
测试登记、CI、文档导航和远端分支状态进行了只读盘点。没有发现可安全直接删除的
逐字节重复代码或文档；真正需要收敛的是根目录状态复制和过时导航。历史 runner
继续由命令生命周期隔离，不能因为实验失败或文件较旧而删除。

结论是“审计完成、治理入口已收敛、没有进行无证据代码删除”。

## 审计范围

| 项目 | 结果 |
|---|---:|
| 修改前 Git tracked 文件 | 1,927 |
| tracked 总字节 | 23,328,693 |
| `docs/` | 1,209 |
| `test/` | 199 |
| `src/` | 165 |
| `scripts/` | 150 |
| `db/` | 84 |
| `config/` | 34 |
| package scripts | 275 |
| M2 current canonical core 文件 | 35 |
| M2 current 脚本 | 23 |

文件摘要覆盖全部 tracked 文件，而不是只检查当前 diff。仓库内逐字节相同文件组为
0；package scripts 中逐字节相同命令别名为 0。

## 代码与入口结论

### 1. Canonical runtime

- formal composition 唯一入口为 `src/server.js`；
- fixture composition 唯一入口为 `src/fixtureServer.js`；
- 当前 M2 模型逻辑唯一实现目录为 `src/domain/m2Current/`；
- `config/build-entrypoints.v0.1.json` 与 package scripts 的三项启动入口一致；
- 当前 M2 模型登记的 code entrypoint 均位于 canonical core 或
  `scripts/m2-current/`；
- production loader、route 与 API 没有导入 development challenger。

因此没有发现应删除的第二套 production runtime、loader、route 或 API。

### 2. 历史 runner

275 个 package scripts 已全部进入生命周期登记：

| 生命周期 | 数量 | 处理 |
|---|---:|---|
| `current-public` | 30 | 当前开发和 CI |
| `archive-only` | 183 | 只允许历史审计重放 |
| `restricted-local` | 61 | 需要所属 capability 和授权 |
| `history-dispatcher` | 1 | 历史命令的统一人工入口 |

历史脚本数量较多，但它们绑定冻结测试、旧 schema、digest 或可重放审计证据。删除会
破坏历史可验证性。本轮维持“生命周期隔离 + 禁止复制为新实现”，不做无证据批量
删除。

### 3. 数据库与测试

- `db/migrations/` 保持 84 个唯一 forward-only migration；
- promoted migration 没有在 experiment 目录保留第二份 canonical copy；
- 测试按 unit、current-contract、historical-M2、archive、private-safety 与 E2E
  分层登记；
- Linux 与 Windows CI 均执行 exact event HEAD、固定 Node/npm/Python、无真实数据
  扫描、lint、build、公共测试、portable start、M2 诊断与 E2E。

## 已处理的过时与冗余

### README

旧首页把大量历史 PR、失败分数、执行队列和 40 余个文档链接堆在首屏，并仍指向状态
索引 v0.27。本轮改为中文优先状态看板，突出：

- 可实现、可验证、已授权和可发布之间的差别；
- 当前模型角色、稳定 ID 和机器状态码；
- 作品点预测、组合预测、排序与风险区间的能力边界；
- 评价合同第二版的“已验证、需修订、未激活”状态；
- 公共开始命令、private 边界和少量 current authority 链接。

首页使用 GitHub 原生表格、徽章和 Mermaid，避免加入需手工更新的二进制宣传图。

### AGENTS

根 `AGENTS.md` 原有 617 行，混入一次性阶段授权、历史分数和重复执行队列。本轮收敛
为长期协作、安全、权限、业务和验证规则；动态状态统一由最新状态索引与 Model
Registry 提供。

`src/domain/m2Current/AGENTS.md` 新增评价合同长期规则，包括：

- 第二版合同未激活；
- raw/selected/fallback 变体分离；
- occurrence、conditional amount 与 reversal 的语义要求；
- 严格 origin-prior MASE、零分母和缺失值处理；
- horizon 分离、未来 actual 后验归因和公开隐私阈值。

### 根目录交接页

`NEXT-CODEX-INSTRUCTION.md` 仍复制状态索引 v0.10 和旧任务队列。历史合同仍引用该
路径，因此保留文件并退役其状态副本功能，只提供到 README、AGENTS、最新状态索引、
Model Registry 和局部规则的稳定跳转。

## 未删除项目及原因

| 候选 | 决定 | 原因 |
|---|---|---|
| 历史 M2 runner | 保留 | 冻结测试、旧 schema 与审计重放绑定 |
| 旧状态索引 | 保留 | 不可变审计与谱系追溯 |
| 失败候选实现 | 保留但不进入 production | 需要复现 raw 失败证据和防回归 |
| archive tests | 保留 | 防止历史合同在 current 变更中静默漂移 |
| `NEXT-CODEX-INSTRUCTION.md` 路径 | 保留为跳转 | 旧合同与历史文档仍引用路径 |

“失败”“旧版本”或“文件较大”不是删除依据。后续删除必须同时证明无调用方、无
测试/合同绑定、无 digest/冻结证据依赖，并保留必要迁移或重定向。

## 权限边界

本轮只做公开仓库审计、文档与长期规则治理。没有训练、调参、运行候选模型、读取或
改写 private 预测、连接 provider/数据库、打开 final holdout、执行
Canary/full160、release 或 M3 formal。

## 验证

最终本地与远端 exact-head 验证结果在本轮提交和 CI 中留痕。任何 Git ignored 的
`output/`、`tmp/` 或 private capability 内容均不进入提交。
