# M3 automated validation policy v0.1

生成日期：2026-06-28

状态：M3 阶段自动化验收策略。

## 1. 策略调整

当前阶段不要求每完成一个 M3 小阶段就生成用户人工填写复核包。人工测试费时费力，应等待 M3 主要开发链路完成后统一进行。

M3-2 只做：

- 脚本测试；
- 自动化验收；
- 边界审计；
- 脱敏 summary。

## 2. 当前禁止

- 不生成用户填写复核包；
- 不停下等待人工测试；
- 不读取 private 物料；
- 不连接数据库；
- 不写 migration；
- 不进入 M3 formal execution；
- 不输出正式业务结论。

## 3. 每轮必须验证

- `npm run check:no-real-data`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run smoke`

时间允许时执行：

- `npm run test:e2e`

## 4. 人工验收触发点

等 M3 主要链路完成后，再统一准备人工测试材料。人工验收前仍需再次确认 PRD、禁止项、安全边界和 private 数据处理方式。
