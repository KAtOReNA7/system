# M3 新品评估测试计划 v0.1

状态：fixture/prototype

## 覆盖范围

| 测试 | 文件 | 覆盖 |
|---|---|---|
| fixture engine | `test/m3-new-product-fixture-engine.test.js` | M3-0 到 M3-7 对象、readiness、预测、评级、关联、回测 |
| API contract | `test/m3-new-product-api.test.js` | 总览、列表、详情、缺口、对标、算法版本、回测、formal 阻断 |
| 管理端 E2E | `test/e2e/admin.e2e.test.js` | M3 只读页面渲染、API 调用、无敏感输出、无写入控件 |

## 验证命令

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run test:e2e
```

## 关键断言

- M3 fixture 数据必须标记 `syntheticOnly` 和 `notForFormalDecision`。
- formal 请求必须返回 `formal_data_blocked`。
- write-like 路由不可用。
- readiness 缺口阻断 formal-style 预测。
- 对标最终数量不超过 3。
- 作者排位不足 3 个可测算样本时禁用。
- 评级不输出固定“是否建议开发”结论。
- 页面不得泄露连接串、密码、原始材料、原始账单或 private 输出路径。

## Gap-closure coverage added after acceptance audit

- Same-author comparator references must expose a non-counting cap marker.
- System-selected and operator-suggested comparator origins must coexist in fixture output.
- Synthetic topics must cover S+/S/A/B/C/D/E plus blocked rating states.
- M4 calibration candidates are entry-only fixture handoff records and must keep `m4Executed=false`.
