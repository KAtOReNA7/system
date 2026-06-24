# M1 Ledger Backfill Apply Readiness Gate v2

本门槛用于判断用户完成 80 条抽检后，是否可以在下一轮单独授权“高置信候选本地 staging apply”。本报告为脱敏公开说明，不包含真实作品名、作者名、渠道名或台账原文。

## Gate 结论口径

| 状态 | 含义 | 后续动作 |
|---|---|---|
| waiting_for_user_spotcheck | 用户尚未填写审核包 | 等待用户填写 |
| needs_more_spotcheck | 完成率不足 `90%` | 继续填写或扩大抽检 |
| needs_rule_fix | 发现阻断错误或需修改缺少修正值 | 分析错误模式，修正规则或候选 |
| not_ready | 没有达到 apply 门槛 | 不执行 apply |
| ready_for_local_staging_apply | 达到本地 staging apply 门槛 | 下一轮需用户单独授权 |

## 必须全部满足的门槛

| 门槛 | 要求 |
|---|---|
| 用户抽检完成率 | `>= 90%` |
| 高置信候选抽检接受率 | `>= 95%` |
| 高收入样本错误数 | `= 0` |
| 版权到期候选严重错误数 | `= 0` |
| 作者/书名严重错误数 | `= 0` |
| 有声权利严重错误数 | `<= 1` |
| 需修改项 | 必须填写用户修正值 |
| 不确定项 | 不自动应用 |
| 低/中置信项 | 不自动应用 |
| 冲突项 | 不自动应用 |

## 会阻断 apply 的错误

- 高收入样本被拒绝或需要修改。
- 版权到期日期被拒绝或需要修改。
- 作品名/作者被拒绝或需要修改。
- 有声权利被拒绝超过 1 条。
- 任意“需修改”项没有填写用户修正值。
- 完成率不足 `90%`。
- 高置信候选接受率低于 `95%`。

## 未填写时状态

如果用户还没有填写审核包，summary 脚本应输出：

- `status = waiting_for_user_spotcheck`
- `readyForLocalStagingApply = false`

该状态不是脚本失败；它表示当前还不能 apply。

## 安全边界

- 本 gate 只允许进入本地 staging apply 的准备判断。
- 本 gate 不写正式主数据。
- 本 gate 不连接远端生产、共享或 staging-like 数据库。
- 本 gate 不进入 M3。
- 本 gate 不提交 private Excel、CSV、JSON 或原始台账明细。
