# M3 选题表模板字段 v0.1

生成日期：2026-06-28

状态：M3-0 planning only。本文只定义用户建议准备的表格字段，不提交原始 Excel。

## 1. 推荐表格形态

建议用户准备一份 private Excel/CSV/JSON 选题表，每行一条新品选题。输入文件必须放在本地 private 路径或 `data/private-output/**` 等 gitignored 目录，不得提交。

## 2. 必填列

| 列名 | key | 校验 | 缺失提示 |
|---|---|---|---|
| 书名 | `title` | 非空 | 缺书名，无法识别选题 |
| 作者 | `author` | 非空 | 缺作者，无法做作者排位或同作者修正 |
| 来源 | `source` | 出版物/原创网文/其他 | 缺来源，无法分流模型 |
| 完整三级分类 | `completeClassification` | 至少三级 | 缺完整分类，无法做类别曲线和同类对标 |
| 简介 | `synopsis` | 非空 | 缺简介，无法确认内容和适配风险 |
| 字数 | `wordCount` | 正数 | 缺字数，无法估算有声体量 |
| 完结状态 | `completionStatus` | 完结/连载中/未知 | 缺完结状态，无法判断曲线风险 |
| 阅读量 | `reads` | 非负数字 | 缺阅读量，热度信号不足 |
| 收藏量 | `collections` | 非负数字 | 缺收藏量，热度信号不足 |
| 评分 | `ratingScore` | 数字 | 缺评分，口碑信号不足 |
| 同名有声状态 | `sameNameAudioStatus` | 有/无/不确定 | 缺同名有声判断，竞争状态不明 |
| 站外热度 | `externalHeat` | 标签或指标摘要 | 缺站外热度，外部热度映射不足 |
| 目标渠道 | `targetChannels` | 至少 1 个 | 缺目标渠道，无法输出渠道结构说明 |
| 版权期限范围 | `copyrightTermRange` | 非空 | 缺版权期限，无法确认可开发窗口 |
| 运营推荐理由 | `operatorRecommendationReason` | 非空 | 缺运营理由，无法保留人工依据 |

上述必填列缺失时，M3 readiness 应为 blocked，不生成 numeric forecast。

## 3. 可选列

| 列名 | key | 用途 |
|---|---|---|
| 评论量 | `commentCount` | 口碑可信度和热度解释 |
| 影视/动漫/漫画/游戏改编信号 | `adaptationSignals` | 评级修正、风险和解释 |
| 运营指定对标 | `operatorComparators` | 与系统对标并列展示 |
| 材料来源 | `materialSource` | 可追溯性 |
| 材料更新时间 | `materialUpdatedAt` | 时效性风险 |
| 输入确认人 | `inputConfirmedBy` | 审计和确认责任 |
| 备注 | `notes` | 人工补充说明 |

可选列缺失不阻断 numeric forecast，但可能降低解释、评级或对标可信度。

## 4. 字段校验

- `source` 只能填出版物、原创网文或其他。
- `wordCount`、`reads`、`collections`、`commentCount` 必须可解析为非负数字。
- `ratingScore` 必须可解析为数字，并在用户确认的评分体系内。
- `completeClassification` 必须能拆分为三级。
- `targetChannels` 多值建议用分号、逗号或换行分隔。
- `operatorComparators` 可填标准作品 ID、标题摘要或运营说明，但正式使用前必须再确认。

## 5. private 输入路径要求

- 输入 Excel/CSV/JSON 属于 private，不得提交。
- 可以放在 `data/private-output/m3-topic-input/` 或用户本地仓库外目录。
- 不得把原始选题表、材料原文、完整作品明细、真实渠道明细提交到公开仓库。

## 6. 缺失处理

| 缺失类型 | 处理 |
|---|---|
| 必填列缺失 | readiness blocked，不生成 numeric forecast |
| 可选解释列缺失 | 生成 risk/explanation note |
| 材料解析候选未确认 | draft 或 pending confirmation |
| 外部平台数据过期 | staleness risk |

## 7. 后续实现边界

本模板只定义字段，不实现导入器、不写业务代码、不写 migration、不连接数据库。

## 8. 用户答复后的模板定位修订

结构化选题表不再是 M3 第一入口，只作为 fallback。只有当少数选题只有书名、作者且没有完整物料时，才使用本模板补充输入。M3-1 的默认入口改为 Word/PDF/PPT/物料表/物料文本 fixture。
