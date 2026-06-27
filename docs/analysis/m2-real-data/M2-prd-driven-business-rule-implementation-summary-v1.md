# M2 PRD-driven business rule implementation summary v1

本文件记录 Q1-Q12 业务回答后的本轮最小落地范围。内容为脱敏聚合说明，不包含真实作品名、作者名、渠道名或原始账单行。

## 已落地规则

- 买断摊销默认周期从 5 年改为 3 年。
- 若剩余版权期短于默认周期，则按剩余版权期限制，最低 1 年。
- 实销、纯买断、买断+实销评级统一使用月均实销等价值。
- 纯买断保留上一买断周期月均实销等价值，作为后续纯买断下一周期预估参考。
- 买断+实销当前评级将买断折算月均与当周期实销月均相加。
- 买断+实销下一周期预测只预测实销部分，不预测未来买断谈判。
- 版权台账状态作为高可信状态来源；尾部收入只作为后续核查线索，不反向改写版权状态。
- M4 校准候选不再由前序失败样本自动汇入，改为由用户选择经典/关键作品。

## 修改范围

- `src/domain/oldProductEvaluation/ratingCalibration.js`
- `src/domain/oldProductEvaluation/shelfStatusInference.js`
- `scripts/m2-real-data/run_m2_rating_standard_v4_task_pack.py`
- `test/m2-rating-standard.test.js`
- `test/m2-rating-front-display.test.js`
- `test/m2-shelf-status-inference.test.js`

## 边界

本轮不进入 M3，不写正式主数据，不提交 private Excel，不使用 `git add .`，不触碰 stash。
