# M2 current 可靠预测模型开发 v0.3

> 历史检查点：当前正式目标已于 2026-07-25 改为纯分成收入。当前入口为
> `M2-v2-current-state-index-v0.12.md`。

## 结论

当前候选仍是
`M2-current-hierarchical-robust-calibration-v0.2`，冻结 development population
仍是 824 部作品、7,851 个 formal-cash case。WAPE 为 0.51114966，signed bias
为 -0.00586227；相对 B4 的 WAPE 改善为 8.1467%，paired work×origin bootstrap
95% CI 为 [-15.7461%, -2.9082%]。

这些结果证明 v0.2 在当前 development population 上明显优于 B4，但尚未达到可发布
状态：

- dormant 没有改善；
- v0.2 相对 v0.1 的 paired 95% CI 为 [-11.8298%, +1.0519%]，穿过零；
- 全库和 Top10 现金可观察性只有 73.96% 和 75.94%，低于 90%；
- final holdout 仍 sealed。

因此结论继续为 development-only `PARTIAL_PASS`，`currentDecision=CANARY_FAIL`。

## 已取消的人工评价路线

不再执行以下工作：

- 人工为 120 部样本填写未来收入点预测或区间；
- 建立“人工预测与模型预测比赛”的盲视数值基线；
- 把当前 120 部样本的逐行人工复核作为算法继续开发的前置门禁；
- 要求用户继续填写原三张人工模板。

原因是当前 120 部样本由 60 部代表性样本、30 部最大低估和 30 部最大高估组成。
后 60 部 stress 样本使用 actual 选取，适合定位模型错误，不代表自然业务人口。
同时 pure-buyout 或缺少 cutoff 承诺的 case 本就应 abstain，要求人工猜测金额不会
产生可靠标签。

人工仍然重要，但角色调整为：自动化技术门禁通过后，查看少量代表性最终结果，
做 `accept`、`accept_with_limits` 或 `reject`，并指出 route 或数据问题。人工不
填写预测金额，也不与模型比较 WAPE。

## v0.2 数学结构保持冻结

令 B4 对 case `i` 的预测为 `b_i`，候选预测为：

```text
y_hat_i = b_i × s(segment_i, group_i, origin_i)
```

每个 outer origin 只使用严格更早、且标签已成熟的 case：

```text
training_origin < outer_origin
label_available_as_of <= outer_origin
```

dense/intermittent 先选择 bias-safe segment scale；只有 group 至少有 80 个成熟
earlier case，且相对 segment fallback 的 training WAPE 至少改善 1%，才采用
group scale。dormant 在没有新的 as-of 可识别信号时继续回退 B4。当前不继续搜索
scale、group 或新候选家族。

## 下一步开发顺序

### 1. 自动化时间回测

将现有 5 个半年 origin 扩展为月度 rolling origin。每个 origin 只可读取当时已知
特征和已成熟标签，并输出训练人口、评分人口、标签成熟度与排除原因。

### 2. 同人口简单基线

在完全相同 case key、actual 和 cutoff 上比较：

- 全零；
- seasonal naive；
- SBA；
- TSB；
- ADIDA；
- B4；
- v0.1；
- exact v0.2。

简单基线不是为了替代业务判断，而是检验复杂模型是否真正增加了稳定价值。

### 3. 拆分发生与金额

对正常销售现金分别回答：

1. 未来窗口是否会发生正现金；
2. 在正现金发生条件下，金额是多少。

先完成诊断和评价合同，不在没有新授权时训练新 two-part/hurdle 候选。未承诺买断
不得进入概率金额模型，pure-buyout 无承诺继续 `null abstain`。

### 4. 扩展质量与覆盖报告

除 WAPE 和 signed bias 外，增加 MASE、RMSSE，并按 horizon、segment、route
报告。eligibility、cash observability、served coverage 与 abstention 必须分开，
不能通过移动 824/7,851 冻结人口提高表面覆盖率。

### 5. 只接收真实承诺

commitment snapshot 只记录 cutoff 时已签署、确认且可审计的未来现金承诺。没有
这类真实业务材料时保持空白，不需要用户制作替代值，也不得由算法猜测未承诺买断。

### 6. 最终业务验收

只有自动化评价、业务覆盖和另行授权的 final holdout 均通过后，才冻结一个小规模
代表性结果集交给人工做最终接受、有限接受或拒绝。该结果不回流调节同一批 case。

## 边界

- 不扩建 evidence framework；
- 不复制 C1–C3 或历史 runner；
- 新实现只进入 `src/domain/m2Current/**`；
- 新候选训练、provider、数据库、final holdout、Canary/full160、release 和
  M3 formal 仍需各自单独授权；
- 当前 120 部样本只保留公开聚合误差诊断，candidate runner 不再生成 private
  人工复核工作簿。

## 可复现入口

```bash
npm run doctor:capability -- m2-algorithm-authoritative-input
npm run develop:m2:current:candidate
npm run diagnose:m2:current
npm run verify:m2:current
```

公共聚合证据：

- `docs/analysis/m2-current/M2-current-reliable-candidate-v0.2.json`
- `docs/analysis/m2-current/M2-current-business-sample-diagnostic-v0.2.json`
- `docs/analysis/m2-current/M2-current-public-diagnostic-v0.3.json`
