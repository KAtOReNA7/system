import React from "react";
import { formatPercent, formatNumber } from "../api.js";
import { Chapter, SourceNote, Badge, StatePanel } from "../components/ui.jsx";
import { AcceptanceEvidence, FrozenResearchRoutes } from "../components/ResearchAcceptance.jsx";

export default function Research({ resource }) {
  const data = resource.data;
  const version = data?.roles.currentStatePath.match(/v([\d.]+)\.md$/)?.[1];
  const baseline = data?.baselineSummary;
  const latest = data?.latestIndependentEvaluation;
  const sources = data?.sources ?? [];
  return <>
    <section className="hero section research-hero">
      <div className="research-heading"><div><p className="micro">03 / RESEARCH INTELLIGENCE</p><h1 className="hero-title">THE<br />EVIDENCE.</h1><h2 className="chinese-title">研究结果 / 证据清楚，边界明确。</h2></div>
        <aside className="research-status"><p className="hero-title">{data ? String(baseline.horizons.length).padStart(2,"0") : "—"}</p><h3 className="eng-label">HORIZONS / 四个预测周期</h3>
          {data ? <p>{data.roles.activeCandidate == null ? "无活动候选" : "已有活动候选，资格另行判定"}<br />{data.roles.approvedForAutomation == null ? "自动化未批准" : "自动化批准已登记"}<br />{data.roles.productionReady ? "生产资格详见权威状态" : "未具备生产资格"}</p> : <p>正在核对公开研究状态…</p>}
        </aside>
      </div>
      <SourceNote isPublic>公开冻结证据 · {version ? "状态索引 v"+version+" / 业务验收合同 v1" : "正在读取权威来源"}</SourceNote>
    </section>
    {resource.loading || resource.error ? <section className="section"><StatePanel resource={resource} title="公开研究证据暂时无法读取" /></section> : <>
      <section className="section metrics-section">
        <div className="baseline-heading"><div><h2>{baseline.model.nameZh} / 研究比较基线</h2><p className="small muted">{baseline.model.id} · 作品总额 · 动态 Core80 · 自身可预测案例</p></div><Badge>历史摘要，不代表完整验收</Badge></div>
        <div className="metric-grid">{baseline.horizons.map(row=><article className="metric-card" key={row.months}>
          <div className="metric-period"><h3>{String(row.months).padStart(2,"0")}</h3><span className="eng-label muted">MONTHS</span></div>
          <p className="number">{formatPercent(row.wape)}</p><p className="small muted">加权绝对百分比误差</p><p className="small muted">误差阈值 ≤ {formatPercent(row.limits.wape,0)}</p>
          <div className="metric-bias"><span className="small muted">有符号偏差</span><strong className={"number-small"+(!row.numericComparison.biasWithinLimit ? " warning" : "")}>{formatPercent(row.signedBias)}</strong></div>
          <p className="small muted">偏差阈值 ±{formatPercent(row.limits.absoluteSignedBias,0)}</p>
          <Badge warning={row.numericComparison.status === "NUMERIC_LIMIT_EXCEEDED"}>{row.numericComparison.status === "NUMERIC_LIMIT_EXCEEDED" ? (!row.numericComparison.biasWithinLimit ? "偏差超限" : "误差超限") : row.historicalNonProspective ? "仅历史证据" : row.numericComparison.labelZh}</Badge>
          <div className="metric-coverage"><p className="small muted">案例覆盖率 {formatPercent(row.caseCoverage)}</p><p className="small muted">金额覆盖率：{row.revenueAmountCoverage == null ? "未披露" : formatPercent(row.revenueAmountCoverage)}</p></div>
        </article>)}</div>
        <p className="small muted">以上不是全模型共同同案；案例覆盖率不能代替金额覆盖率。稳定性与不确定性须分别判断。36 个月为历史多起点证据，尚未形成前瞻验证。</p>
      </section>
      <section className="section gates-section"><Chapter title="TWO GATES." subtitle="两种预测粒度 / 独立验收" />
        <div className="gates-grid"><article><h3 className="eng-label">WORK TOTAL</h3><p className="chinese-title">作品总额</p><Badge>开发验收证据待补齐</Badge><p>四个周期均需误差、偏差、金额覆盖、逐起点稳定性和不确定性证据。</p></article>
          <article><h3 className="eng-label">WORK × CHANNEL</h3><p className="chinese-title">作品 × 渠道</p><Badge>{data.grainGates.workChannel.status === "PARTIAL_NOT_ACTIVE" ? "部分证据，未激活" : data.grainGates.workChannel.labelZh}</Badge><p>当前不能作为完整渠道能力使用；不能由部分渠道证据反推作品总额通过。</p></article></div>
      </section>
      <AcceptanceEvidence data={data} />
      <FrozenResearchRoutes data={data} />
      <section className="section last-review"><Chapter title="THE LAST REVIEW." subtitle="最近独立评价 / 头部保护尾段修正模型" aside={latest.model.id} />
        <div className="review-grid"><div><p className="number">{formatPercent(latest.relativeFva,4)}</p><p className="small muted">相对基线改善 / 唯一独立评价</p></div><div><h3>{latest.labelZh}。</h3><p className="small muted">{latest.origin} 起点 · 动态 Core80 {latest.workCount} 部作品 · {formatNumber(latest.bootstrap.iterations)} 次作品聚类重采样，95% 区间{latest.bootstrap.crossesZero ? "跨 0" : "不跨 0"}。</p><p className="small muted">不追加第二独立起点，不据此启用生产。</p></div></div>
        <div className="source-links">{sources.filter(source=>["current-state","contract"].includes(source.id)).map(source=><a key={source.id} href={source.href} target="_blank" rel="noreferrer">{source.id==="current-state" ? "状态索引 v"+version : source.title} ↗</a>)}
          <details className="evidence-details"><summary>口径与完整来源</summary><div className="evidence-panel">
            <h3>模型角色与范围</h3><p>{data.roles.operationalFallback.nameZh}（{data.roles.operationalFallback.id}）是兼容性运行回退，不代表当前业务门禁已通过。</p>
            <p>{data.historicalEvaluation.currentInterpretationZh}。服务人口按每个预测起点重算，至少 {data.scope.minimumCompleteBillMonthsAtOrigin} 个完整账单月只是前提。</p>
            <h3>四周期证据完整性</h3><div className="table-scroll"><table><thead><tr><th>周期</th><th>合法 / 应有案例</th><th>作品数</th><th>金额覆盖</th><th>完整验收</th></tr></thead><tbody>{baseline.horizons.map(row=><tr key={row.months}><td>{row.months} 个月</td><td>{formatNumber(row.caseCount)} / {formatNumber(row.expectedCaseCount)}</td><td>{row.workCount}</td><td>未披露</td><td>{row.businessGate.labelZh}</td></tr>)}</tbody></table></div>
            <p>最近独立评价的 95% 相对改善区间：{formatPercent(latest.bootstrap.lower,4)} 至 {formatPercent(latest.bootstrap.upper,4)}。</p>
            <p>36 个月渠道合同拆分仍缺 {data.grainGates.workChannel.missingCaseCount} 个案例、{data.grainGates.workChannel.missingComponentCount} 个渠道分量；不影响作品总额基线的独立判定。</p>
            <ul>{data.caveats.map(caveat=><li key={caveat}>{caveat}</li>)}</ul>
            <h3>公开来源</h3><ul>{sources.map(source=><li key={source.id}><a href={source.href} target="_blank" rel="noreferrer">{source.title} ↗</a><p className="small muted">{source.path}{source.asOf ? " · 来源日期 "+source.asOf : ""}</p></li>)}</ul>
          </div></details>
        </div>
      </section>
    </>}
  </>;
}
