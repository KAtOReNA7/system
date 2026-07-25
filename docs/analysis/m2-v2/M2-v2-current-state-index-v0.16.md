# M2 当前状态索引 v0.16

日期：2026-07-26

## 唯一当前结论

M2 只预测未来分成收入现金。人工账单分区继续是现金类型唯一权威；canonical 渠道
治理已经完成，但首轮平台分层模型没有产生可用的预测提升。

133 个原始渠道 ID/名称组合全部人工确认，归并为 74 个 canonical 渠道。分成账单
190,663 行全部映射，完整月截止 2026-04，87,624,963.9132 元在映射和
`作品×月×canonical 渠道×角色×收入模式` 面板中保持精确守恒。系统内部 UID 自动
生成，不要求用户维护。

## 当前质量

| 视图 | 基线 WAPE | v0.9 WAPE | 相对变化 | 结论 |
|---|---:|---:|---:|---|
| 25-origin 月度诊断 | 0.46274198 | 0.46506585 | +0.5022% | FAIL |
| 当前 served 7,083 case | 0.49075894 | 0.49070110 | -0.0118% | FAIL |

v0.9 在逐月诊断中恶化；在 7,083 case 上的改善远低于预注册 1% 门槛，绝对 WAPE
仍远高于 0.30。它不能替换 exact v0.3。

## 为什么渠道治理没有直接提升模型

1. 渠道别名归并修复了实体粒度，但不会自动产生新的需求信号。
2. 133 行主表的生效年月覆盖为 0；角色/收入模式用于本轮 post-hoc development，
   不能当作历史 as-of truth。
3. 单购/点播约占完整分成现金 10.12%，但没有可审计净单价，不能安全换算销量。
4. 没有历史渠道状态、合同可售状态和真实上线月 snapshot。
5. 三级分类与当前 rating 只有 current 值，本轮只作报告分组，没有进入预测。
6. 本轮仍是旧 development 窗口，不是独立 later-origin/final holdout。

## 当前入口

- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.10.json`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.md`
- `docs/analysis/m2-current/M2-current-canonical-channel-development-v0.1.json`
- `docs/analysis/m2-current/M2-current-authority-source-audit-v0.2.json`
- `docs/prd/m2-v2/M2-forecast-intelligence-v2-prd-v0.2.md`
- `docs/analysis/m2-current/M2-current-human-ledger-partition-audit-v0.1.md`
- `docs/analysis/m2-current/M2-current-as-of-source-inventory-v0.1.json`
- `AGENTS.md`

## 下一开发方向

1. 保持 exact v0.3 作品级 fallback；冻结 v0.9 参数与失败结论，不在同一窗口调参。
2. 为渠道角色、收入模式、合同可售和渠道状态建立带 `effectiveAt/availableAt` 的
   历史 snapshot；没有证据时保持 `unknown_at_origin`。
3. 补充单购平台的作品净单价/净分成/销量换算依据；缺少时继续阻断单购销量模型。
4. 补充真实上线时间；首笔实销月只能作为 observed-sales-age proxy。
5. 新材料先通过覆盖、守恒、泄漏和 25-origin 门禁，再预注册一个未参与
   v0.5/v0.7/v0.8/v0.9 设计的 later-origin 验证。
6. later-origin、final holdout、provider、数据库、Canary/full160、release 与
   M3 formal 均需各自新增授权。

## 命令

公共、无 private：

```bash
npm run diagnose:m2:channel-governance
npm run verify:m2:channel-governance
npm run verify:m2:current
```

本机受控 capability：

```bash
npm run doctor:capability -- m2-current-canonical-channel
npm run develop:m2:current:canonical-channel
```

缺少 private 渠道表或账单只阻断第二组命令，不得阻断 clone、安装、测试、公共诊断
或本地服务器启动。
