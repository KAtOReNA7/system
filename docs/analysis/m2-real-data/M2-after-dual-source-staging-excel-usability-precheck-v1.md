# M2 after-dual-source-staging Excel usability precheck v1

## 结论
- 30-work 运营任务包可填写: `True`
- 20-year evaluation 表可读: `True`
- 两张表是否可以交给用户填写: `True`
- 是否仍存在匿名无法匹配问题: `False`
- 是否仍存在主阅读英文 code 或未映射: `False`
- 是否仍存在不合理空白: `False`
- 是否进入 M3: `False`

## 30-work 运营任务包
- 文件: `data\private-output\m2-business-review\m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-v3.xlsx`
- xlsx 格式有效: `True`
- 任务行数: `30`
- 样本分布: `{"系统分层样本": 20, "用户指定作品": 5, "高风险边界样本": 5}`
- 缺失列: `[]`
- 结构性不合理空白计数: `{}`
- 真实数据缺口空白计数: `{"standardWorkIdButMissingAuthor": 2}`
- 可用 standard_work_id 回写: `True`

## 20-year evaluation
- 文件: `data\private-output\m2-business-review\M2-v1.1-random-20-year-evaluation-after-dual-source-staging-v3-cn.xlsx`
- xlsx 格式有效: `True`
- 有效样本行数: `20`
- 覆盖年份: `["2017", "2018", "2019", "2020", "2021", "2022"]`
- 预测输出类型分布: `{"运营窗口预测（待补版权到期）": 13, "版权期预测": 7}`
- 空白原因分布: `{"缺版权到期": 13}`
- 疑似 bug 空白计数: `{}`
- 真实数据缺口空白计数: `{"standardWorkIdButMissingAuthor": 6}`

## 用户填写字段
- 运营判断：预测是否可信
- 运营判断：评级是否合理
- 运营判断：建议是否可执行
- 运营发现的问题类型
- 运营建议修正
- 是否应进入M4校准案例池

## 安全边界
- 本报告只包含聚合统计和文件路径，不包含真实作品名、作者名、渠道名或原始账单行。
- private Excel 与 private source JSON 保持在 gitignored data/private-output 下，不提交。
- 本轮未进入 M3。
