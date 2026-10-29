import React, { useEffect, useRef, useState } from "react";
import { useResource, listHref, detailHref, formatCash, formatMonth, formatNumber, dataStatusLabels, businessStatusLabels } from "../api.js";
import { Chapter, Cover, SourceNote, StatePanel, Badge, Action } from "../components/ui.jsx";

export default function Catalog({ params, dataset }) {
  const search = params.get("search") ?? "";
  const category = params.get("category") ?? "";
  const dataStatus = params.get("dataStatus") ?? "";
  const businessStatus = params.get("businessStatus") ?? "";
  const pageInput = Number(params.get("page"));
  const page = Number.isSafeInteger(pageInput) && pageInput > 0 ? pageInput : 1;
  const view = params.get("view") ?? "works";
  const [draft, setDraft] = useState(search);
  const tableRef = useRef(null);
  useEffect(() => setDraft(search), [search]);
  const filters = { search, category, dataStatus, businessStatus, page, view: view === "data" ? "data" : "" };
  const query = new URLSearchParams({search,category,dataStatus,businessStatus,page:String(page),pageSize:"6"});
  const resource = useResource("/api/workspace/works?" + query);
  const result = resource.data;
  const actualDataset = result?.dataset ?? dataset;
  const total = result?.pagination.total;
  const pages = Math.max(1, Math.ceil((total ?? 0) / 6));
  function update(patch) {
    window.location.hash = listHref({...filters,page:1,...patch});
  }
  function searchWorks(event) {
    event.preventDefault();
    update({search:draft.trim()});
    tableRef.current?.focus({preventScroll:true});
  }
  const hasFilters = Boolean(search || category || dataStatus || businessStatus);
  return <>
    <section className="hero section catalog-hero"><div className="catalog-heading"><div>
      <p className="micro">02 / AUDIOBOOK CATALOG</p><h1 className="hero-title">THE CATALOG.</h1><h2 className="chinese-title">作品库 / 每一部作品，都有自己的档案。</h2>
    </div><div className="catalog-count"><strong>{formatNumber(total)}</strong><span className="micro">TITLES / {actualDataset?.syntheticOnly ? "合成演示目录" : "作品目录"}</span></div></div>
      <SourceNote dataset={actualDataset}>{actualDataset?.syntheticOnly ? "以下作品、作者、金额及封面均为合成演示。" : "正式只读档案；名称、作者和分成现金未接入时保留为空。"}</SourceNote>
    </section>
    <section className="section catalog-section">
      <div className="featured-heading"><h2 className="eng-label">FEATURED / 从作品进入</h2><div className="view-switch" aria-label="作品展示方式"><button type="button" aria-pressed={view !== "data"} onClick={()=>update({view:""})}>作品视图</button><button type="button" aria-pressed={view === "data"} onClick={()=>update({view:"data"})}>数据视图</button></div></div>
      {view !== "data" && (result?.items.length ? <div className="featured-grid">{result.items.slice(0,3).map(work => <a className="featured-work" href={detailHref(work.id,listHref(filters))} key={work.id}>
        <Cover work={work} /><div className="featured-caption"><div><h3>{work.workName ?? work.id}</h3><p>{work.authorName ?? "作者未接入"}{work.syntheticOnly ? " · 虚构样例" : ""}</p></div><span aria-hidden="true">↗</span></div>
      </a>)}</div> : (resource.loading ? <div className="featured-loading" role="status">正在读取作品…</div> : null))}
      <div ref={tableRef} tabIndex="-1" className="catalog-index"><Chapter title="THE INDEX." subtitle="作品数据 / 金额、完整月与范围状态分开查看" />
        <form className="filter-bar" role="search" onSubmit={searchWorks}>
          <label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">搜索作品、作者或标准编号</span><input type="search" value={draft} placeholder="搜索作品、作者或标准编号" onChange={event=>setDraft(event.target.value)} /><button type="submit" aria-label="搜索作品">↵</button></label>
          <label><span className="sr-only">作品分类</span><select value={category} onChange={event=>update({category:event.target.value})}><option value="">全部分类 ↓</option>{(result?.facets.categories ?? []).map(value=><option key={value} value={value}>{value}</option>)}</select></label>
          <label><span className="sr-only">数据状态</span><select value={dataStatus} onChange={event=>update({dataStatus:event.target.value})}><option value="">数据状态 ↓</option>{Object.entries(dataStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="sr-only">业务状态</span><select value={businessStatus} onChange={event=>update({businessStatus:event.target.value})}><option value="">业务状态 ↓</option>{Object.entries(businessStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <span className="small muted cutoff">截至 {formatMonth(actualDataset?.cutoffMonth)}</span>
        </form>
        {hasFilters && <div className="filter-result"><span>搜索与筛选结果：{formatNumber(total)} 部作品</span><button type="button" onClick={()=>{setDraft("");update({search:"",category:"",dataStatus:"",businessStatus:""});}}>清除筛选 ×</button></div>}
        {resource.loading || resource.error ? <StatePanel resource={resource} /> : page > pages && total > 0 ? <div className="state-panel" role="status"><h3>页码超出当前结果范围</h3><p>当前共 {pages} 页，筛选条件已保留。</p><Action href={listHref({...filters,page:1})} variant="secondary">返回第一页</Action></div> : !result.items.length ? <StatePanel empty /> : <>
          <div className="table-scroll" role="region" aria-label="作品数据表，可横向滚动" tabIndex="0"><table className="works-table"><thead><tr><th>作品 / 标准编号</th><th>分类</th><th>完整账单月</th><th className="cash-column">近 12 月分成现金</th><th>范围状态</th><th>数据状态</th></tr></thead>
            <tbody>{result.items.map(work=><tr key={work.id}><td><a href={detailHref(work.id,listHref(filters))}>{work.workName ?? "名称未接入"}</a><p>{work.id}{work.authorName ? " · "+work.authorName : ""}</p></td><td>{work.category ?? "未接入"}</td><td className="number-small">{Number.isFinite(work.completeBillMonths) ? String(work.completeBillMonths).padStart(2,"0") : "—"}</td><td className="cash-column">{formatCash(work.salesShareCash12Months)}</td><td>{businessStatusLabels[work.businessStatus] ?? "未接入"}</td><td><Badge warning={work.dataStatus==="needs_review"}>{work.cashType==="pure_buyout" ? "仅审计展示" : dataStatusLabels[work.dataStatus] ?? "未接入"}</Badge></td></tr>)}</tbody>
          </table></div>
          <nav className="pagination" aria-label="作品分页"><p className="small muted">{String((page-1)*6+1).padStart(2,"0")}—{String(Math.min(page*6,total)).padStart(2,"0")} / {formatNumber(total)} · {actualDataset.syntheticOnly ? "合成样例" : "正式档案"}</p><div>
            {page>1 && <a href={listHref({...filters,page:page-1})} aria-label="上一页">← 上一页</a>}
            {[...new Set([1,page,Math.min(page+1,pages)])].map(p=><a key={p} href={listHref({...filters,page:p})} aria-current={page===p ? "page" : undefined} aria-label={"第 "+p+" 页"}>{String(p).padStart(2,"0")}</a>)}
            {page<pages && <a href={listHref({...filters,page:page+1})}>下一页 ↗</a>}
          </div></nav>
        </>}
        <SourceNote dataset={actualDataset}>完整月仅是一项前提；动态核心人口按预测起点判定。未生成与不适用不记作 0 元。</SourceNote>
      </div>
    </section>
  </>;
}
