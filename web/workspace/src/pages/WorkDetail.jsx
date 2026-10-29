import React, { useState } from "react";
import { useResource, formatCash, formatMonth, formatNumber, businessStatusLabels } from "../api.js";
import { Action, Chapter, Cover, SourceNote, StatePanel } from "../components/ui.jsx";

export default function WorkDetail({ encodedId, back, dataset }) {
  let id;
  try { id = decodeURIComponent(encodedId); } catch { id = ""; }
  const resource = useResource("/api/workspace/works/" + encodeURIComponent(id));
  const [showHistory, setShowHistory] = useState(false);
  const work = resource.data?.item;
  const actualDataset = resource.data?.dataset ?? dataset;
  const backHref = back?.startsWith("#/works") && !back.startsWith("#/works/") ? back : "#/works";
  if (resource.loading || resource.error) return <section className="section"><Action href={backHref} variant="secondary">← 返回作品库</Action><StatePanel resource={resource} /></section>;
  const first = work.syntheticOnly && work.id === "DEMO-W001";
  const monthly = work.monthlyCash?.slice(-6) ?? [];
  const maximum = Math.max(29000,...monthly.map(row=>row.amount ?? 0));
  return <>
    <section className="hero section detail-hero"><a className="back-link" href={backHref}>← 返回作品库 / {work.syntheticOnly ? "合成作品档案" : "作品档案"}</a>
      <div className="detail-hero-grid"><figure className="detail-art"><Cover work={work} /><figcaption className="micro">{work.id} / {first ? "原创概念封面 · 非正式出版物" : work.syntheticOnly ? "合成演示作品" : "作品资料"}</figcaption></figure>
        <div className="detail-copy"><p className="micro">WORK {first ? "001 / FICTION" : "/ ARCHIVE"}</p><h1 className="display-title">{first ? <>SEA<br />LETTERS.</> : <>WORK<br />ARCHIVE.</>}</h1>
          <h2 className="chinese-title">{work.workName ?? "作品名称未接入"}</h2><p className="hero-description">{work.authorName ?? "作者未接入"}{work.syntheticOnly ? " · 虚构作者" : ""} / {first ? "文学 · 中国文学 · 当代小说" : work.category ?? "分类未接入"}</p>
          <div className="detail-facts"><div><strong>{formatNumber(work.completeBillMonths)}</strong><span>完整账单月</span></div><div><strong>{Number.isFinite(work.channelCount) ? String(work.channelCount).padStart(2,"0") : "—"}</strong><span>已有渠道</span></div><div><strong>{work.cashType==="pure_buyout" ? "买断" : work.cashType==="sales_share" ? "分成" : "未接入"}</strong><span>业务形态</span></div></div>
          <p className="small fog">{work.dataStatus === "complete" ? "资料状态完整" : work.dataStatus === "unknown" ? "资料状态未接入" : "资料待核对"} · 服务范围仍需按预测起点判定。</p>
          <div className="actions"><Action href="#/research">查看研究口径 ↗</Action><Action href={backHref} variant="dark">返回作品库</Action></div>
        </div>
      </div>
    </section>
    <section className="section summary-band detail-summary"><SourceNote dataset={actualDataset}>{work.syntheticOnly ? "作品身份、历史现金与渠道均为合成样例；当前未生成任何正式预测。" : "正式只读资料；历史分成现金与渠道尚未接入，当前未生成正式预测。"}</SourceNote>
      <div className="detail-summary-grid"><div><p className="number">{formatCash(work.salesShareCash12Months)}</p><p className="small muted">近 12 个月分成现金 / 买断不计入</p></div><div><h3>账单来源 / {work.cashType === "pure_buyout" ? "买断审计资料（合成示例）" : work.syntheticOnly ? "人工拆分的分成账单（合成示例）" : "尚未接入现金类型权威"}</h3>
        <p className="small muted">{work.channels?.length ? work.channels.map(c=>c.name).join(" · ") : "渠道未提供"} / 截至 {formatMonth(actualDataset.cutoffMonth)}</p><p className="small muted">成熟作品与已有渠道的资格，需要在同一预测起点判断。</p></div></div>
    </section>
    <section className="section history-section"><Chapter title="THE CASH RECORD." subtitle="收入历史 / 已发生的分成现金" aside={<span>最近 6 个月{work.syntheticOnly ? " · 合成示例" : ""}</span>} />
      {monthly.some(row=>Number.isFinite(row.amount)) ? <div className="cash-chart" role="img" aria-label={"最近六个月历史分成现金：" + monthly.map(row=>row.month+" "+formatCash(row.amount)).join("，")}>{monthly.map((row,index)=><div className="cash-bar-group" key={row.month}><p className="number-small">{Number.isFinite(row.amount) ? (row.amount/10000).toFixed(1)+" 万" : "—"}</p><div className={"cash-bar"+(index===monthly.length-1 ? " cash-bar--latest" : "")} style={{height:Number.isFinite(row.amount) ? Math.max(2,row.amount/maximum*116) : 0}} /><span className="micro muted">{formatMonth(row.month)}</span></div>)}</div> :
        <div className="state-panel"><p>{work.cashType==="pure_buyout" ? "纯买断不属于分成现金预测范围，历史分成现金保持为空。" : "当前没有可展示的历史分成现金。"}</p></div>}
      <p className="history-caption small muted">历史现金记录不包含预测结果。</p>
    </section>
    <section className="section forecast-section"><Chapter title="WHAT COMES NEXT." subtitle="未来分成现金 / 四个周期分别交付" />
      <div className="prediction-grid">{(work.predictions ?? []).map(prediction=><div className="prediction" key={prediction.horizonMonths}><div><strong>{String(prediction.horizonMonths).padStart(2,"0")}</strong><span>—</span></div><p>{prediction.horizonMonths} 个月 / {work.cashType==="pure_buyout" ? "不适用" : "尚未生成"}</p><p className="small muted">预测区间 — / 模型版本 —</p></div>)}</div>
      <p className="small muted">尚无活动候选与自动化批准；未生成显示为空。作品 × 渠道结果仍未激活。</p>
    </section>
    <section className="section source-history"><div><h2 className="eng-label">SOURCE & HISTORY</h2><button type="button" aria-expanded={showHistory} onClick={()=>setShowHistory(value=>!value)}>资料与变更记录 {showHistory ? "−" : "↗"}</button></div><p className="small muted">{work.syntheticOnly ? "合成资料 / 来源记录可追溯" : "正式只读资料 / 尚未接入完整变更记录"}</p>
      {showHistory && <div className="source-detail"><dl><div><dt>作品编号</dt><dd>{work.id}</dd></div><div><dt>数据来源</dt><dd>{actualDataset.source}</dd></div><div><dt>范围状态</dt><dd>{businessStatusLabels[work.businessStatus]}</dd></div></dl><ul>{(work.notices ?? []).map((notice,index)=><li key={index}>{typeof notice==="string" ? notice : notice.messageZh ?? notice.message ?? notice.code}</li>)}</ul></div>}
    </section>
  </>;
}
