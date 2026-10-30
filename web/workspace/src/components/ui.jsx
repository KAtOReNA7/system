import React from "react";
import ocean from "../../assets/ocean-letter.png";
import { detailHref, formatCash, formatNumber } from "../api.js";

export function Action({ href, children, variant = "primary", ...props }) {
  const className = "action action--" + variant;
  return href ? <a className={className} href={href} {...props}>{children}</a>
    : <button className={className} type="button" {...props}>{children}</button>;
}
export function Chapter({ title, subtitle, aside, children }) {
  return <div className="chapter"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}{children}</div>{aside && <div className="chapter-aside">{aside}</div>}</div>;
}
export function SourceNote({ dataset, children, isPublic = false }) {
  const fixture = dataset?.syntheticOnly === true;
  return <p className="source-note"><span className="micro">{isPublic ? "[ PUBLIC ]" : fixture ? "[ DEMO ]" : dataset?.source === "local-reviewed-ledger-snapshot" ? "[ LOCAL ]" : "[ FORMAL ]"}</span>
    <span>{children ?? (fixture ? "界面演示 · 作品、账单和金额均为合成样例；研究摘要另标公开来源。" : dataset?.source === "local-reviewed-ledger-snapshot" ? dataset.cashDefinitionLabelZh : "正式只读接口 · 未接入字段保留为空；不自动使用演示数据。")}</span></p>;
}
export function Badge({ children, warning = false }) {
  return <span className={"badge" + (warning ? " badge--warning" : "")}>{children}</span>;
}
export function StatePanel({ resource, title = "暂时无法读取数据", empty = false }) {
  if (resource?.loading) return <div className="state-panel" role="status"><span className="loading-line" />正在读取数据…</div>;
  if (empty) return <div className="state-panel"><h3>没有符合条件的作品</h3><p>调整搜索词或筛选条件后再试。</p></div>;
  const isDatabase = resource?.error?.status === 503;
  const notFound = resource?.error?.status === 404;
  const snapshot = resource?.error?.code?.startsWith("workspace_");
  return <div className="state-panel" role="alert"><p className="eng-label">{notFound ? "NOT FOUND" : "DATA UNAVAILABLE"}</p>
    <h3>{notFound ? "没有找到这部作品" : snapshot ? "本地真实数据暂不可用" : isDatabase ? "正式数据尚未连接" : title}</h3>
    <p>{snapshot ? "只读数据尚未准备、来源已变化或校验未通过。请更新本地数据后重新读取；研究结果仍可独立查阅。" : isDatabase ? "数据库未配置或当前不可用，这不等同于空库。公开研究结果仍可独立查阅。" : notFound ? "作品可能不存在，请返回作品库重新选择。" : "请求没有完成，已保留当前页面和筛选条件。"}</p>
    <div className="actions">{resource?.retry && <Action onClick={resource.retry} variant="secondary">重新读取</Action>}<Action href="#/research" variant="secondary">查看研究结果 ↗</Action></div>
  </div>;
}
const englishTitles = { "DEMO-W001": "SEA LETTERS.", "DEMO-W002": "SLOW JOURNEY", "DEMO-W003": "CITY LIGHTS" };
export function Cover({ work, compact = false }) {
  const original = work?.syntheticOnly === true && work?.id === "DEMO-W001";
  if (original) return <img className={"work-cover" + (compact ? " work-cover--compact" : "")} src={ocean} alt="《海边来信》原创概念封面：暗色海面上的银色信封" />;
  const bright = work?.id === "DEMO-W003";
  return <div className={"type-cover" + (bright ? " type-cover--signal" : "") + (compact ? " type-cover--compact" : "")}>
    <span className="micro">{work?.syntheticOnly ? "DEMO / AUDIOBOOK" : "WORK / ARCHIVE"}</span>
    <div><strong>{work?.workName ?? work?.billNames?.[0] ?? "名称待确认"}</strong><span className="eng-label">{englishTitles[work?.id] ?? "THE CATALOG."}</span></div>
    {!compact && <span className="cover-number">{(work?.syntheticOnly ? work.id?.replace(/^DEMO-W/, "").replace(/^0/, "") : work?.id) || "—"}</span>}
  </div>;
}
export function WorkTile({ work }) {
  return <a className="work-tile" href={detailHref(work.id)}>
    <Cover work={work} compact />
    <div className="work-tile-body"><span className="micro muted">{work.syntheticOnly ? "SYNTHETIC / DEMO" : "WORK / ARCHIVE"}</span>
      <h3>{work.workName ?? work.billNames?.[0] ?? work.id}</h3>{!work.workName && work.billNames?.length > 0 && <p className="small muted">账单识别名 · 待确认</p>}<p className="small muted">近 12 月{work.syntheticOnly ? "" : "已记录"}分成现金</p><p className="number-small">{work.syntheticOnly ? formatCash(work.salesShareCash12Months) : formatNumber(work.salesShareCash12Months)}</p><span>查看详情 ↗</span></div>
  </a>;
}
export function Footer({ children, path = "/" }) {
  return <footer className="site-footer"><p>READ THE SIGNAL.</p><span className="small">{children ?? "作品与金额为合成演示，研究状态另行标注。" }<br />只读工作台 · 非正式执行</span>
    {path !== "/" ? <Action href="#/" variant="dark">返回工作台 ↗</Action> : <Action href="/admin" variant="dark">原管理工具 ↗</Action>}
  </footer>;
}
