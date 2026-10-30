import React, { useState } from "react";
import { formatPercent, formatNumber } from "../api.js";
import { Chapter, Badge } from "./ui.jsx";

function SourceLinks({ ids = [], sources }) {
  return <span className="matrix-source-links">{ids.map(id=>{
    const source = sources.find(item=>item.id===id);
    return source ? <a key={id} href={source.href} target="_blank" rel="noreferrer">{source.title} ↗</a> : null;
  })}</span>;
}

function MetricCell({ metric, absolute = false }) {
  if (!metric) return <td>此粒度未提供本项证据</td>;
  return <td>{Number.isFinite(metric.value) && <strong className="number-small">{formatPercent(metric.value)}</strong>}
    <p>{metric.labelZh}</p>{Number.isFinite(metric.limit) && <p className="small muted">{absolute ? "绝对值上限" : "上限"} {formatPercent(metric.limit,0)}</p>}</td>;
}

export function AcceptanceEvidence({ data }) {
  const [grain,setGrain] = useState("WORK_TOTAL");
  const evidence = data.acceptanceEvidence;
  const rows = evidence?.rows.filter(row=>row.grain===grain) ?? [];
  const sources = data.sources ?? [];
  if (!evidence) return null;
  return <section className="section acceptance-evidence">
    <Chapter title="THE ACCEPTANCE FILE." subtitle="验收证据矩阵 / 四个周期、两种粒度分别判断" />
    <p className="small muted">合同启用状态与模型通过状态是两回事。下表只陈列当前公开摘要能够支持的结论，未披露不代表整个项目没有证据。</p>
    <div className="acceptance-controls" aria-label="验收粒度">
      <button type="button" aria-pressed={grain==="WORK_TOTAL"} onClick={()=>setGrain("WORK_TOTAL")}>作品总额</button>
      <button type="button" aria-pressed={grain==="WORK_CHANNEL"} onClick={()=>setGrain("WORK_CHANNEL")}>作品×渠道</button>
    </div>
    <p className="small acceptance-basis">{grain==="WORK_TOTAL" ? "人工锚定可学习全局模型（LG01）的动态 Core80 自身可预测案例；与上方四张卡片同一证据组。" : "作品×渠道采用独立合同状态；不从作品总额或局部渠道排名反推通过。"}<br />表格可横向滚动查看全部证据维度。</p>
    <div className="table-scroll" role="region" aria-label="验收证据矩阵，可横向滚动" tabIndex="0">
      <table className="acceptance-table"><caption className="sr-only">{grain==="WORK_TOTAL" ? "作品总额" : "作品×渠道"}四周期验收证据</caption><thead><tr><th>预测周期</th><th>误差</th><th>偏差</th><th>金额覆盖</th><th>逐起点稳定性</th><th>不确定性</th><th>完整验收判定</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.horizonMonths} data-horizon={row.horizonMonths}><th scope="row">{row.horizonMonths} 个月</th>
          <MetricCell metric={row.metrics.wape}/><MetricCell metric={row.metrics.signedBias} absolute/>
          <MetricCell metric={row.metrics.amountCoverage}/><MetricCell metric={row.metrics.stability}/><MetricCell metric={row.metrics.uncertainty}/>
          <td><Badge warning>{row.acceptance.labelZh}</Badge>{Number.isSafeInteger(row.missingCaseCount) && <p className="small">仍缺 {formatNumber(row.missingCaseCount)} 个案例、{formatNumber(row.missingComponentCount)} 个渠道分量。</p>}{row.horizonMonths===36 && <p className="small muted">仅历史开发证据，尚非前瞻验证。</p>}</td>
        </tr>)}</tbody></table>
    </div>
    <details className="matrix-evidence-details"><summary>查看当前粒度的证据身份与出处</summary>
      {rows.map(row=><div className="matrix-identity" key={row.horizonMonths}><h3>{row.horizonMonths} 个月 · {grain==="WORK_TOTAL" ? "作品总额" : "作品×渠道"}</h3><p>{row.basisLabelZh}</p>
        <p className="small muted">证据标识：<code>{row.basisId}</code></p>
        <SourceLinks ids={row.sourceIds} sources={sources}/>
        {row.fieldPaths && <p className="micro muted">来源字段：{Array.isArray(row.fieldPaths) ? row.fieldPaths.join("；") : Object.entries(row.fieldPaths).map(([key,value])=>key+": "+value).join("；")}</p>}
      </div>)}
    </details>
    <p className="matrix-caveat small">金额覆盖不能由案例覆盖推算；候选优越性还需要同案改善、独立时间证据、稳定性和不确定性等条件共同满足。不同窗口、模型、人口或实际值口径的证据不能拼接。</p>
  </section>;
}

export function FrozenResearchRoutes({ data }) {
  if (!data.researchRoutes?.length) return null;
  return <section className="section research-routes"><Chapter title="WHERE THE RESEARCH STOPS." subtitle="研究路线 / 当前结论与执行边界" />
    <p className="small muted">以下是已冻结路线的当前权威解释。历史结果保留追溯，停止或阻断状态不因页面接入而改变。</p>
    <div className="research-route-list">{data.researchRoutes.map(route=><article className="research-route" key={route.modelId} data-model={route.modelId}>
      <div className="route-heading"><div><p className="micro muted">{route.modelId}</p><h3>{route.nameZh}</h3></div><Badge warning>{route.currentStatus.labelZh}</Badge></div>
      <p>{route.summaryZh}</p>
      <ul className="route-statuses">{route.detailStatuses?.map((status,index)=><li key={status.code ?? index}>{status.labelZh}</li>)}</ul>
      {route.historicalStatus && <p className="route-history small"><strong>历史结果 · 冻结保留：</strong>{route.historicalStatus.labelZh}。该历史状态不能替代上方现行判定。</p>}
      <p className="route-boundary"><strong>执行边界：</strong>{route.boundaryZh}</p>
      <details className="route-source-details"><summary>查看来源与机器状态</summary><p className="small">现行状态：<code>{route.currentStatus.code}</code></p>
        {route.historicalStatus && <p className="small">历史状态：<code>{route.historicalStatus.code}</code></p>}
        <p className="small">所属实验：{route.experimentNameZh}（<code>{route.experimentId}</code>）</p>
        <SourceLinks ids={route.sourceIds} sources={data.sources ?? []}/>
        {route.fieldPaths && <p className="micro muted">来源字段：{Array.isArray(route.fieldPaths) ? route.fieldPaths.join("；") : Object.entries(route.fieldPaths).map(([key,value])=>key+": "+value).join("；")}</p>}
      </details>
    </article>)}</div>
    <p className="small muted">后续工程审查应逐项对应合同要求、实现位置、测试与运行证据；这项要求不授予重跑、创建后继模型或开启独立评价的权限。</p>
  </section>;
}
