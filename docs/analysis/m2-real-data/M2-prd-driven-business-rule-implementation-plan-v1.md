# M2 PRD-driven business rule implementation plan v1

本计划只描述用户回答后的下一轮实施，不在本轮执行代码修改，不生成任务包，不进入 M3。

## 1. 用户回答后应修改的文件

若用户采用推荐答案，下一轮预计修改：

- `src/domain/oldProductEvaluation/revenueModelClassifier.js`
- `src/domain/oldProductEvaluation/ratingCalibration.js`
- `src/domain/oldProductEvaluation/shelfStatusInference.js`
- `src/domain/oldProductEvaluation/suggestionCalibration.js`
- `scripts/m2-real-data/run_m2_rating_standard_v4_task_pack.py` 或后续 v5 任务包脚本
- `package.json` 中对应验证脚本，如需要新增 v5

若用户选择非推荐答案，应先更新问题包 summary，再调整实施范围。

## 2. 应新增或修改的测试

- `test/m2-revenue-model-classifier.test.js`
- `test/m2-rating-standard.test.js`
- `test/m2-rating-front-display.test.js`
- `test/m2-shelf-status-inference.test.js`
- `test/m2-suggestion-removal-boundary.test.js`
- 必要时新增 `test/m2-prd-driven-business-rule-answers.test.js`

测试必须覆盖：

- 收入模式边界；
- unknown 保留条件；
- 纯买断折算；
- 买断+实销合成；
- 下架/版权状态置信度；
- 单一前台评级；
- 实销档位不回退；
- forecast 不覆盖实销评级；
- 自动运营建议主字段不恢复；
- M4 校准候选窄口径；
- M3 仍未进入。

## 3. 应重跑的验证

下一轮实施后至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run validate:m2:rating-standard
npm run validate:m2:rating-standard-v4
npm run test:e2e
```

若新增 v5 脚本，则改为同时运行 `validate:m2:rating-standard-v5`。

## 4. 应生成的新任务包

如果用户回答完成且需要新一轮复核，建议生成：

- `m2-v1.1-30-work-operator-task-pack-cn-prd-driven-v5.xlsx`

该文件必须继续位于 gitignored private output 下，不提交 Git。公开报告只输出聚合统计和脱敏说明。

## 5. 是否需要重跑 forecast

默认不需要。当前问题集中在收入模式、评级、货架/版权状态、前台解释和建议边界。只有用户在 Q9 中选择让 forecast 直接影响主评级，才需要重新设计 forecast-rating 接口并重跑相关验证。

## 6. 是否仍不进入 M3

仍不进入 M3。用户回答问题后最多支持 M2 engineering/local closeout；formal complete 仍取决于正式主数据、formal readiness、正式授权、对账和发布审批。

## 7. 延后到 M4 的内容

- 自动运营建议主功能恢复；
- 长期校准案例池治理；
- 反馈到规则修复的闭环；
- 复杂异常样本重评和回滚策略；
- M4 校准 UI/流程。

