# M2 用户可见中英双语报告规范 v1

## 目的

机器记录继续使用稳定英文 ID、JSON 字段、代码符号、schema、digest 和机器状态码；
用户可见的标题、结论、原因、比较和下一步必须中文优先。英文信息用于精确定位，
不能代替中文解释。

## 机器层

1. stable model ID 使用英文 ASCII，例如 `M2-WORK-OA03`。
2. JSON key、代码 symbol、schema、digest 和英文大写状态码不翻译。
3. 模型、模型族、实验、实验臂/消融、评价活动、执行检查点、证据 artifact、
   状态索引、业务状态和命令必须分别记录。
4. 历史文件名、历史 model ID、schema、digest、冻结结果和 archive command
   不因新别名而改写。

## 用户层

1. 标题、结论、失败或阻断原因、是否执行、成绩人口、可比性、停止原因和下一步
   全部先用中文。
2. 英文原名首次出现时放在中文名之后，例如：
   人工锚定可学习全局模型（Human-Anchored Learned Global，
   `M2-WORK-LG01`）。
3. 状态码必须带中文解释，例如：
   渠道生成 v0.2 核心执行被合同阻断
   （`GENERATIVE_V02_CORE_EXECUTION_BLOCKED`）。
4. 不得向用户裸写 `G1`、`A5`、`R3`、`K1`。必须写所属实验和含义，例如：
   渠道时间生成 v0.2 / G1（独立渠道发生-条件金额生成器，
   `M2-EXP-CHANNEL-GENERATIVE-02/G1`）。
5. 指标必须写中文含义。WAPE 首次写作“加权绝对百分比误差（WAPE）”，
   signed bias 首次写作“有方向的总量偏差（signed bias）”。
6. fallback、baseline、candidate、champion、blocked、failed 和 not executed
   不得混用。尤其：
   - blocked 表示前置条件不满足；
   - failed 表示候选已经执行但未通过；
   - not executed 表示没有产生候选结果。
7. fallback 或 selected pipeline 必须与 raw candidate 分开报告；安全回退后的
   FVA=0 不能替代或掩盖 raw candidate 的负 FVA。
8. 作品点预测、组合预测、排序/分配和风险/区间属于不同能力，不组成统一排行榜。

## 固定术语

| 英文 | 中文 |
|---|---|
| operational fallback | 现行运行回退模型 |
| research baseline | 研究比较基线 |
| candidate | 待验证候选 |
| champion | 当前比较优胜模型 |
| development evidence | 开发窗口证据 |
| independent evidence | 独立验证证据 |
| blocked | 因前置条件不满足而阻断 |
| failed | 已实际执行并未通过 |
| not executed | 尚未执行 |
| WAPE | 加权绝对百分比误差 |
| signed bias | 有方向的总量偏差 |
| occurrence | 收入是否发生 |
| conditional amount | 发生收入时的条件金额 |
| common reversal | 共用冲销修正 |
| materiality | 实质改善阈值 |
| same-case intersection | 相同案例交集 |
| rolling origin | 滚动预测起点 |
| abstention | 主动不出预测 |
| exact replay | 精确重放 |
| private capability | 受控私有数据能力 |

## 成绩可比性

只有目标、现金权威、案例人口或明确 same-case intersection、horizon、grain、
as-of/label maturity、actual definition 和 evaluation family 同时一致，才能排名。

不可直接比较时，用户报告必须：

1. 明确说“不能直接排名”；
2. 展示目标、人口、粒度、horizon 或窗口差异；
3. 不输出统一冠军；
4. 不用 44% 对 49% 的表面数字判断模型胜负。

## 每次反馈的最小内容

每次用户可见反馈必须回答：

```text
本轮做了什么
当前结论
模型/实验的中文名称
英文 ID
是否真的执行
成绩属于哪个人口
是否能与其他成绩直接比较
为什么停止
下一步需要什么授权
```

若只是治理或代码变更，应明确写“模型执行次数为 0”，而不是省略执行状态。

## 示例

正确：

```text
渠道时间生成 v0.2 / G1（独立渠道发生-条件金额生成器，
`M2-EXP-CHANNEL-GENERATIVE-02/G1`）

当前状态：尚未执行（`NOT_EXECUTED_CONTRACT_SEMANTIC_BLOCKER`）。
原因：训练期 G0 权威绑定不完整。
```

错误：

```text
G1 NOT_EXECUTED
safeToStart=false
```
