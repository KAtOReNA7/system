# 作品 ID 格式报告

## 已确认的数据事实

- 识别到 3,575 个原始作品 ID、3,099 个标准作品数字主体。
- 无法按当前纯数字或 Y+数字规则识别的记录为 27 行。

## 候选规则（未启用）

- 作品 ID 物理存储应采用文本语义，避免前导零或长数字精度损失；规范化细节不自动启用。

## 无法单靠账单确认的事项

- 当前文件是否覆盖两种业务形态、异常前缀是否具有业务含义，需要运营确认。

## 需要运营确认的样本

- 异常作品 ID 详细行位于本地 `invalid-required-fields.csv`。

## REQ 与 AT

REQ-WORK-001~011；AT-M1-020~029、AT-M1-031；REQ-DQ-001~003；AT-M1-010~012

## PENDING-DATA 状态

前导零、大小写、科学计数法和异常形式处理仍为 PENDING-DATA。

## 格式分布

| 格式分类 | 记录数 |
|---|---|
| text_Ydigits | 135233 |
| text_digits | 57575 |
| text_Ydigits_leading_zero | 64 |
| other_text | 26 |
| numeric_float_nonintegral | 1 |
