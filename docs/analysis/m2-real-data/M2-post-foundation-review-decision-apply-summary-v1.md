# M2 post-foundation 两类复核决策应用摘要 v1

## 结论

- 用户填写范围：`238` 条，其中到期仍有收入 `146` 条、版权有效但收入稀疏 `92` 条。
- 已通过校验并形成最终复核状态：`238` 条；仍待确认：`0` 条。
- private 逐作品正式输入候选内容契约：`通过`。
- 本摘要只包含聚合信息；逐作品书名、作者、确认备注、日期和值留在 Git 忽略的 private 输出中。

## 本地 staging 变化

- 字段更新分布：`{"版权到期": 69, "作品状态": 120, "音频版权状态": 21}`。
- 作品状态分布：`{"已下架": 755, "已上架": 2298}`。
- 音频版权状态分布：`{"无限期": 473, "版权有效": 2250, "版权已到期": 330}`。
- 版权期限类型分布：`{"perpetual": 473, "exact_date": 2503, "expired_unknown_date": 16, "relative_term": 59, "year_only": 2}`。
- 复核审计事件：`238` 条；复核提示赋值：`139` 条。
- 当前来源自动消歧：`{"single_future_value_across_available_sources": 57, "two_source_exact_agreement": 14, "current_authorization_summary": 3, "single_exact_value_across_available_sources": 2, "current_authorization_summary_plus_user_confirmation": 16}`。
- 正式输入阻断：`{}`。

## 边界

- 本步骤只应用 private 文件级确认并生成可验证正式输入候选；尚未写正式主数据、激活 mapping、执行 formal evaluation 或创建正式 release。
- M2 不输出自动运营建议；复核提示仅记录事实归因、审计或后续证据要求。
- M3 formal execution 仍未开始。
