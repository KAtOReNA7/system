# M2 v2 当前状态索引 v0.4

## 当前结论

这是 2026-07-24 起的仓库治理与开发导航 successor。PR #7 的 cryptographic current-authority 仍由不可变的 v0.3 JSON 提供；本索引不替换其摘要绑定，只更新 PR 生命周期、工程能力和下一开发边界。

- PR #7：独立 B8 复审通过，10 项 finding 已关闭，已普通 merge 到 `main`。
- PR #8：承载全盘复盘 v0.2 的独立工程收敛，等待最终 CI、review、ready 和 merge。
- 当前业务结论：`CANARY_FAIL`。
- 当前开发 readiness：`NOT_AUTHORIZED`。
- full160、模型训练、final holdout、release、M3 formal：均未授权。
- 公开开发基线：private-independent；缺少 S1 private authenticity 文件不会阻断核心开发。

## 已完成的工程修正

| 范围 | 当前状态 |
|---|---|
| 工具链 | Node 24、npm 11.13.0、Python 3.13 reference/CI 和 CI Python 依赖已固定；本地支持 Python 3.11–3.13，脚本统一 launcher |
| 静态检查 | tracked JS/MJS 全量清单；lint 与 build 拆分为不同契约 |
| 测试 | registry 管理 default/E2E/archive/private profiles；一般 CI 不再重复 PR #7 的历史 exact-branch preflight |
| runtime | formal 与 fixture composition root 分离；formal root 不导入 fixture repository |
| serving | formal M2 export 为 point-only，不再输出 optimistic/pessimistic 情景 |
| 冗余 | 删除 80 份已晋升 migration 副本；8 份重复 archive 文档改为 canonical redirect；删除 8 个无语义脚本 alias |
| 算法诊断 | 建立 public-only `m2-current` case/target/metrics/comparator/gate/report 核心及确定性基线 |

## M2 current 公共诊断

当前 public aggregate evidence 只能形成诊断基线，不能生成新模型或发布决定：

| 指标 | 当前值 |
|---|---:|
| 权威作品人口 | 3,053 |
| model works / formal-cash cases | 824 / 7,851 |
| model work share | 26.99% |
| full-library forecastable cash coverage | 0.7396468495 |
| Top10 coverage | 0.7594125280 |
| 目标覆盖门槛 | 0.90 |
| B4 WAPE / signed bias | 0.55648454 / 0.08911106 |
| C3-A WAPE / signed bias | 0.553945169 / 0.08273913 |

诊断状态为 `BASELINE_ONLY_BLOCKED`。阻断项是覆盖不足、现有候选质量失败、没有获批 current candidate、final holdout 仍 sealed，以及业务抽检尚未完成。下一步不是继续复制 C1–C3 runner 或直接升级复杂模型，而是在相同 formal-cash universe、B4 comparator、as-of/no-leakage 和 null-abstention 边界内，先解决覆盖与失败切片。

## 权威与历史关系

- PR #7 verifier 的摘要绑定入口：`M2-v2-current-state-index-v0.3.json`。
- 当前仓库治理入口：本文件及同名 v0.4 JSON。
- v0.2、v0.3 之前的报告、C1–C3 runner、V2-B.1–B.8 执行记录继续作为历史审计证据，不构成 provider、训练或下一阶段授权。
- 全盘审计 v0.2 是方案基线；实施结果由 `M2-repository-code-convergence-and-portable-development-audit-v0.3.md` 记录。

## 新电脑入口

```bash
git pull --ff-only
npm ci
npm run doctor:dev
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run verify:m2:current
```

只有明确需要某个 private capability 时才运行其 capability doctor 和 canonical verifier。private inventory 的存在不等于真实性通过，也不等于执行授权。
