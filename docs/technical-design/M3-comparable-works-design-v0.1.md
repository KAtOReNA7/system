# M3 comparable works design v0.1

生成日期：2026-06-28

状态：M3-2 fixture/prototype design。本文只定义 synthetic fixture 对标候选规则，不代表 M3 formal execution。

## 1. 目标

M3-2 对标候选用于为后续 M3-3/M3-4 的预测解释和权重输入提供参考，不重做 channel forecast，不恢复 forecast range，不输出“是否建议开发”或资源投入等级。

## 2. 输出结构

`comparableWorks` 包含：

- `systemSelected`：系统对标，最多 3 部；
- `operatorSpecified`：运营指定对标，与系统对标并列展示；
- `sameAuthorReferenceWorks`：同作者参考作品，不占用系统对标名额；
- `excluded`：未纳入系统对标的候选及可解释原因；
- `selectionRules`；
- `limitations`；
- `nonFormal` / `fixtureOnly` / `notForFormalDecision`。

## 3. 选择信号

系统对标候选使用 synthetic fixture 信号：

- source 一致性；
- 分类相似度；
- 字数或音频体量相似度；
- 完结状态；
- 热度信号；
- 渠道相似度；
- 收入模式；
- 是否买断；
- 是否同作者；
- 是否运营指定。

## 4. 并列展示规则

运营指定对标不覆盖系统对标，系统对标也不忽略运营指定对标。两者必须并列展示。运营指定对标不占用系统最多 3 部的名额。

同作者作品不占系统对标名额，统一进入 `sameAuthorReferenceWorks`。

## 5. 买断处理

- pure buyout 作品只能作为历史价值参考，不直接作为实销曲线对标；
- buyout plus sales 作品可使用实销部分作为曲线参考，买断部分必须单列；
- buyout treatment 必须写入每个系统对标或排除原因。

## 6. 安全边界

本设计不读取真实作者明细、不读取 private 物料、不读取数据库、不写 migration、不进入 formal execution。
