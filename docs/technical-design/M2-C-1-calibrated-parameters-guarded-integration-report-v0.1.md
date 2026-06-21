# M2-C-1 非正式校准参数 guarded integration 与对比验证报告 v0.1

## 结论

本轮已将 M2-C-0 产生的聚合校准参数以受控 profile 的方式接入老品评估 fixture 引擎。

当前存在两个参数 profile：

- `fixture_baseline`：默认 profile，继续作为 API、管理端、fixture smoke 的默认行为。
- `calibrated_non_formal`：显式启用的非正式校准 profile，仅用于 fixture/local 对比验证。

`calibrated_non_formal` 输出强制标记：

- `nonFormalCalibration=true`
- `realDataAggregated=true`
- `notForFormalDecision=true`
- `formalEvaluationAllowed=false`

该 profile 不通过 API 路由暴露，不新增写接口，不导入真实数据，不触发 mapping 激活，不修改 `db/migrations/`。

## 实现范围

### 参数 profile 机制

新增单一参数 profile 解析模块，集中定义：

- 默认 profile：`fixture_baseline`
- 非正式校准 profile：`calibrated_non_formal`
- 未知 profile 行为：显式抛出错误，不静默回退

校准 profile 引用 M2-C-0 聚合参数版本：

- `m2-c0-cleaned-bill-nonformal-v0.1`

### 引擎接入

老品评估 fixture 引擎已支持显式 profile：

- 默认调用不传 profile 时仍使用 `fixture_baseline`。
- 显式传入 `calibrated_non_formal` 时，生命周期、预测、评级逻辑读取校准参数。
- 输出保留 fixture-only 与 not-for-formal-decision 边界。

### API 边界

当前只读 API 不暴露参数 profile 选择能力，也不允许调用方通过 API 切换 profile。

为避免 profile 元数据通过 detail API 的完整结果克隆泄漏，本轮在 repository 输出层剥离了内部 profile 元数据。CLI 仍可输出 profile 信息，用于工程验证。

### CLI

保留原有命令：

```bash
npm run evaluate:m2:old-products:fixture
```

新增命令：

```bash
npm run evaluate:m2:old-products:calibrated
npm run compare:m2:old-products:calibration
```

对比命令仅输出聚合分布变化，不输出作品级明细。

## 聚合对比结果

对比对象为 7 条纯合成 fixture 评估样本。

### 评级分布变化

| 评级 | baseline | calibrated | delta |
|---|---:|---:|---:|
| S+ | 1 | 4 | +3 |
| S | 1 | 2 | +1 |
| A | 1 | 1 | 0 |
| B | 1 | 0 | -1 |
| C | 1 | 0 | -1 |
| D | 1 | 0 | -1 |
| E | 1 | 0 | -1 |

### 生命周期分布变化

| 生命周期 | baseline | calibrated | delta |
|---|---:|---:|---:|
| stable | 1 | 4 | +3 |
| rebound | 1 | 1 | 0 |
| inactive | 1 | 1 | 0 |
| insufficient_history | 1 | 1 | 0 |
| growth | 1 | 0 | -1 |
| declining | 1 | 0 | -1 |
| long_tail | 1 | 0 | -1 |

### 预测合计分布变化

| 指标 | baseline | calibrated | delta |
|---|---:|---:|---:|
| count | 7 | 7 | 0 |
| min | 5,031.25 | 15,898.75 | +10,867.50 |
| median | 79,655.63 | 136,000.00 | +56,344.37 |
| max | 1,216,000.00 | 638,400.00 | -577,600.00 |
| total | 2,035,418.05 | 1,344,765.95 | -690,652.10 |

该变化只说明 fixture 纵向切片在不同参数 profile 下的输出差异，不构成正式业务结论。

## 安全边界验证

本轮未执行：

- 正式数据库连接；
- 真实数据导入；
- 数字版权台账导入；
- 运营确认结果导入；
- mapping version 激活；
- `switch_mapping_version` 调用；
- 正式数据迁移；
- `db/migrations/` 修改；
- 写接口、导出接口或评估任务接口新增。

## 本地验证

已通过：

```bash
npm run lint
npm run build
npm test
npm run smoke
npm run test:e2e
npm run evaluate:m2:old-products:fixture
npm run evaluate:m2:old-products:calibrated
npm run compare:m2:old-products:calibration
```

`npm run check:no-real-data` 在 staging 后执行并通过，结果见本轮提交记录。

## 后续边界

`calibrated_non_formal` 仍是非正式校准 profile。进入 local dry-run 或正式评估前，仍需独立门禁：

- 使用清洗后账单的本地 dry-run 输入 manifest；
- 不读取原始明细；
- 不写正式库；
- 不生成正式 mapping version；
- 不自动应用运营确认结果；
- 不把本 profile 当作正式业务规则。
