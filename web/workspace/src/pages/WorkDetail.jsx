import React, { useState } from "react";
import { useResource, formatCash, formatMonth, formatNumber, businessStatusLabels } from "../api.js";
import { Action, Chapter, Cover, SourceNote, StatePanel } from "../components/ui.jsx";

const issueFields = { cash:"现金记录", cashAuthority:"现金对账", standardWorkId:"作品编号", id:"作品编号", masterData:"基础资料", monthlyCash:"账单月份", authorName:"作者", category:"分类", classificationLevel1:"一级分类", classificationLevel2:"二级分类", classificationLevel3:"三级分类", rightsStartDate:"版权开始", rightsEndDate:"版权到期", rightsDates:"版权期限", firstSalesMonth:"首次实销", channels:"渠道", workName:"作品名称", workSource:"作品来源" };
function issueSummary(issue) {
  const severity = ({blocking:"阻断",warning:"待核对",error:"错误",info:"说明"})[issue.severity] ?? "待核对";
  return severity + " · " + (issueFields[issue.field] ?? "资料") + " · " + (issue.status === "confirmed" ? "已确认" : "待确认") + (issue.sourceLabel ? " · " + issue.sourceLabel : "");
}

function CashTable({ rows, local = false }) {
  const displayCash = value => local ? formatNumber(value) : formatCash(value);
  return <div className="table-scroll"><table className="cash-history-table" data-testid="cash-history-table"><thead><tr><th>账单月份</th><th>已记录分成现金</th><th>月份状态</th></tr></thead><tbody>{rows.map(row=><tr key={row.month}><td>{formatMonth(row.month)}</td><td className={row.amount < 0 ? "negative-cash" : ""}>{displayCash(row.amount)}</td><td>{row.complete === false ? "账单未完整 · 仅事实追溯" : Number.isFinite(row.amount) ? "已记录" : "未观察 · 不填零"}</td></tr>)}</tbody></table></div>;
}

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
  const local = actualDataset.source === "local-reviewed-ledger-snapshot";
  const displayCash = value => local ? formatNumber(value) : formatCash(value);
  const monthly = (work.monthlyCash ?? []).filter(row=>!actualDataset.cutoffMonth || row.month <= actualDataset.cutoffMonth).slice(-6);
  const issues = work.qualityIssues ?? [];
  const categories = work.categoryPath?.filter(Boolean).join(" · ") || work.category;
  const forms = (work.businessForms ?? []).map(form=>typeof form === "string" ? form : form.label ?? form.name ?? form.businessForm).filter(Boolean);
  const maximum = Math.max(29000,...monthly.map(row=>row.amount ?? 0));
  return <>
    <section className="hero section detail-hero"><a className="back-link" href={backHref}>← 返回作品库 / {work.syntheticOnly ? "合成作品档案" : "作品档案"}</a>
      <div className="detail-hero-grid"><figure className="detail-art"><Cover work={work} /><figcaption className="micro">{work.id} / {first ? "原创概念封面 · 非正式出版物" : work.syntheticOnly ? "合成演示作品" : "作品资料"}</figcaption></figure>
        <div className="detail-copy"><p className="micro">WORK {first ? "001 / FICTION" : "/ ARCHIVE"}</p><h1 className="display-title">{first ? <>SEA<br />LETTERS.</> : <>WORK<br />ARCHIVE.</>}</h1>
          <h2 className="chinese-title">{work.workName ?? work.billNames?.[0] ?? "作品名称未确认"}</h2><p className="hero-description">{work.authorName ?? "作者未确认"}{work.syntheticOnly ? " · 虚构作者" : ""} / {first ? "文学 · 中国文学 · 当代小说" : categories ?? "分类未确认"}</p>
          <div className="detail-facts"><div><strong>{formatNumber(work.completeBillMonths)}</strong><span>{local ? "已观察完整月" : "完整账单月"}</span></div><div><strong>{Number.isFinite(work.channelCount) ? String(work.channelCount).padStart(2,"0") : "—"}</strong><span>有记录渠道</span></div><div><strong>{work.cashType==="pure_buyout" ? "买断" : work.cashType==="mixed" ? "混合" : work.cashType==="sales_share" ? "分成" : "未接入"}</strong><span>现金类型</span></div></div>
          <p className="small fog">{work.dataStatus === "complete" ? "资料状态完整" : work.dataStatus === "unknown" ? "资料状态未接入" : "资料待核对"} · 服务范围仍需按预测起点判定。</p>
          <div className="actions"><Action href="#/research">查看研究口径 ↗</Action><Action href={backHref} variant="dark">返回作品库</Action></div>
        </div>
      </div>
    </section>
    {!work.workName && work.billNames?.length > 0 && <p className="section bill-name-note">当前显示原账单识别名称，标准名称待确认。账单名称记录：{work.billNames.join("；")}</p>}
    <section className="section summary-band detail-summary"><SourceNote dataset={actualDataset}>{work.syntheticOnly ? "作品身份、历史现金与渠道均为合成样例；当前未生成任何正式预测。" : local ? actualDataset.cashDefinitionLabelZh : "正式只读资料；历史分成现金与渠道尚未接入，当前未生成正式预测。"}</SourceNote>
      <div className="detail-summary-grid"><div><p className="number">{displayCash(work.salesShareCash12Months)}</p><p className="small muted">{actualDataset.kind === "RAW_LEDGER_AUDIT" ? "近 12 月原始分成记录 · 待核对" : local ? "近 12 月已记录分成现金" : "近 12 个月分成现金"} / 买断不计入</p>{work.cashCoverage && <p className="small muted">已观察 {work.cashCoverage.observedMonths} / {work.cashCoverage.expectedMonths} 个月；缺月不补零。金额单位沿用原账单，币种未提供。</p>}</div><div><h3>账单来源 / {work.cashType === "pure_buyout" ? "买断审计资料" + (work.syntheticOnly ? "（合成示例）" : "") : work.syntheticOnly ? "人工拆分的分成账单（合成示例）" : local ? "人工拆分的分成账单" : "尚未接入现金类型权威"}</h3>
        <p className="small muted">{work.channels?.length ? work.channels.map(c=>c.name).join(" · ") : "渠道未提供"} / 截至 {formatMonth(actualDataset.cutoffMonth)}</p><p className="small muted">成熟作品与已有渠道的资格，需要在同一预测起点判断。</p></div></div>
    </section>
    <section className="section history-section"><Chapter title="THE CASH RECORD." subtitle="收入历史 / 已发生的分成现金" aside={<span>最近 6 个月{work.syntheticOnly ? " · 合成示例" : ""}</span>} />
      {monthly.some(row=>row.amount < 0) ? <CashTable rows={monthly} local={local} /> : monthly.some(row=>Number.isFinite(row.amount)) ? <div className="cash-chart" role="img" aria-label={"最近六个月历史分成现金：" + monthly.map(row=>row.month+" "+displayCash(row.amount)).join("，")}>{monthly.map((row,index)=><div className="cash-bar-group" key={row.month}><p className="number-small">{Number.isFinite(row.amount) ? (row.amount/10000).toFixed(1)+" 万" : "—"}</p><div className={"cash-bar"+(index===monthly.length-1 ? " cash-bar--latest" : "")} style={{height:Number.isFinite(row.amount) && row.amount !== 0 ? Math.max(2,row.amount/maximum*116) : 0}} /><span className="micro muted">{formatMonth(row.month)}</span></div>)}</div> :
        <div className="state-panel"><p>{work.cashType==="pure_buyout" ? "纯买断不属于分成现金预测范围，历史分成现金保持为空。" : "当前没有可展示的历史分成现金。"}</p></div>}
      <p className="history-caption small muted">{local ? "按账单入账月显示净额，保留负数冲销；未做模型口径重述。未观察月保持空值。" : "历史现金记录不包含预测结果。"}</p>
      {local && work.monthlyCash?.length > 0 && <details><summary>查看全部账单月份</summary><CashTable rows={work.monthlyCash} local={local} /></details>}
    </section>
    {local && <section className="section work-metadata"><Chapter title="THE WORK FILE." subtitle="作品资料 / 有依据才填写，缺失或冲突保留为空" /><dl className="metadata-grid">{[["标准编号",work.id],["作者",work.authorName],["分类路径",categories],["作品来源",work.workSource],["业务形态",forms.join(" · ")],["版权开始",work.rightsStartDate],["版权到期",work.rightsEndDate],["首次正数实销月",work.firstSalesMonth],["作品状态",work.productStatus]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value || "未确认"}</dd></div>)}</dl><p className="small muted">待确认分册映射未自动应用。原财务编号：{work.rawWorkIds?.join("、") || "见来源记录"}。</p></section>}
    {local && <section className="section channel-record"><Chapter title="BY CHANNEL." subtitle="规范渠道 / 同期已记录分成现金" />{work.channels?.length ? <div className="table-scroll"><table><thead><tr><th>渠道</th><th>近 12 月已记录分成现金</th></tr></thead><tbody>{work.channels.map((channel,index)=><tr key={channel.uid ?? index}><td>{channel.name || "待核对"}</td><td>{displayCash(channel.amount)}</td></tr>)}</tbody></table></div> : <p>未提供分成渠道记录；不代表授权渠道为零。</p>}</section>}
    {local && work.buyoutAudit && <section className="section buyout-audit" data-testid="buyout-audit"><Chapter title="BUYOUT / AUDIT." subtitle="买断现金 / 独立历史审计" /><p className="number-small">{displayCash(work.buyoutAudit.cash12Months)}</p><p className="small muted">同期已记录买断现金；历史合计 {displayCash(work.buyoutAudit.totalCash)}，共 {formatNumber(work.buyoutAudit.recordCount)} 条。不计入分成现金与预测。</p></section>}
    {local && <section className="section quality-issues"><Chapter title="TO VERIFY." subtitle={"资料问题 / " + issues.length + " 条待确认记录"} />{issues.length ? <ul>{issues.map((issue,index)=><li key={index}><strong>{issue.messageZh ?? issue.code}</strong><p className="small muted">{issueSummary(issue)}</p></li>)}</ul> : <p>未列出读取问题，不等于完成全部 M1 验收。</p>}</section>}
    <section className="section forecast-section"><Chapter title="WHAT COMES NEXT." subtitle="未来分成现金 / 四个周期分别交付" />
      <div className="prediction-grid">{(work.predictions ?? []).map(prediction=><div className="prediction" key={prediction.horizonMonths}><div><strong>{String(prediction.horizonMonths).padStart(2,"0")}</strong><span>—</span></div><p>{prediction.horizonMonths} 个月 / {work.cashType==="pure_buyout" ? "不适用" : "尚未生成"}</p><p className="small muted">预测区间 — / 模型版本 —</p></div>)}</div>
      <p className="small muted">尚无活动候选与自动化批准；未生成显示为空。作品 × 渠道结果仍未激活。</p>
    </section>
    <section className="section source-history"><div><h2 className="eng-label">SOURCE & HISTORY</h2><button type="button" aria-expanded={showHistory} onClick={()=>setShowHistory(value=>!value)}>资料与变更记录 {showHistory ? "−" : "↗"}</button></div><p className="small muted">{work.syntheticOnly ? "合成资料 / 来源记录可追溯" : "正式只读资料 / 尚未接入完整变更记录"}</p>
      {showHistory && <div className="source-detail"><dl><div><dt>作品编号</dt><dd>{work.id}</dd></div><div><dt>数据来源</dt><dd>{actualDataset.source}</dd></div><div><dt>范围状态</dt><dd>{businessStatusLabels[work.businessStatus]}</dd></div></dl><ul>{(work.notices ?? []).map((notice,index)=><li key={index}>{typeof notice==="string" ? notice : notice.messageZh ?? notice.message ?? notice.code}</li>)}</ul></div>}
    </section>
  </>;
}
