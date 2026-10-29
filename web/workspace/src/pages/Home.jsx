import React from "react";
import chrome from "../../assets/chrome-book.png";
import { useResource, formatNumber, formatMonth, listHref } from "../api.js";
import { Action, Chapter, SourceNote, Badge, StatePanel, WorkTile } from "../components/ui.jsx";

export default function Home({ dataset, research }) {
  const resource = useResource("/api/workspace/overview");
  const summary = resource.data?.summary;
  const actualDataset = resource.data?.dataset ?? dataset;
  const permission = research.data?.permissions;
  return <>
    <section className="hero section home-hero"><div className="home-hero-copy">
      <p className="micro">01 / BUSINESS WORKSPACE</p>
      <h1 className="hero-title">WORK<br />SPACE.</h1>
      <h2 className="chinese-title">工作台 / 看见作品的每一步</h2>
      <p className="hero-description">从账单完整性到研究证据，<br />让每一项判断都能找到来源。</p>
      <div className="actions"><Action href="#/works">浏览作品库 ↗</Action><Action href="#/research" variant="dark">查看研究结果</Action></div>
    </div><figure className="chrome-art"><img src={chrome} alt="原创主视觉：在深色反光表面展开的金属书本" fetchPriority="high" /><figcaption className="micro">CHROME EDITION / 原创概念图</figcaption></figure></section>
    <section className="summary-band section">
      <SourceNote dataset={actualDataset} />
      {resource.loading || resource.error ? <StatePanel resource={resource} /> : <div className="stats-grid">
        {[
          ["作品总数", formatNumber(summary.workCount), actualDataset.syntheticOnly ? "演示目录" : "正式只读目录"],
          ["完整账单作品", formatNumber(summary.completeBillWorkCount), "至少 3 个完整月，不等于预测资格"],
          ["待处理问题", Number.isFinite(summary.needsReviewCount) ? String(summary.needsReviewCount).padStart(2,"0") : "—", "按作品主数据与渠道状态核对"],
          ["最近完整月", formatMonth(actualDataset.cutoffMonth), actualDataset.syntheticOnly ? "示例账单范围" : "待完整月权威接入"]
        ].map(([label,value,note]) => <div className="stat" key={label}><p>{label}</p><p className="number">{value}</p><p>{note}</p></div>)}
      </div>}
    </section>
    <section className="section next-section">
      <Chapter title="NEXT IN LINE." subtitle="优先处理 / 从可执行的事项开始" />
      <div className="next-grid">
        <div className="task-list">
          <a href="#/works" className="task"><span className="number-small muted">01</span><div><h3>检查作品主数据</h3><p>{Number.isFinite(summary?.needsMasterDataCount) ? summary.needsMasterDataCount + " 部作品存在主数据缺项" : "查看作品缺项，追踪待补全资料"}</p></div><Badge warning={summary?.needsMasterDataCount>0}>{summary?.needsMasterDataCount===0 ? "已完整" : "待核对"}</Badge></a>
          <a href={listHref({businessStatus:"needs_review"})} className="task"><span className="number-small muted">02</span><div><h3>核对本月账单差异</h3><p>{Number.isFinite(summary?.channelReviewCount) ? summary.channelReviewCount + " 部作品的渠道信息待核对" : "查看需要核对的渠道与数据状态"}</p></div><Badge warning>待复核</Badge></a>
          <a href="#/research" className="task"><span className="number-small muted">03</span><div><h3>查看最新研究结论</h3><p>四个周期、两种粒度分别判断</p></div><Badge>只读</Badge></a>
        </div>
        <aside className="research-teaser">
          <p className="eng-label signal">RESEARCH / PUBLIC</p>
          <h3>已有历史证据。<br />正式启用仍待验收。</h3>
          {research.loading ? <p role="status">正在读取公开研究状态…</p> : research.error ? <p>研究状态暂时不可用，请进入研究页重新读取。</p> :
            <p>{research.data?.roles?.activeCandidate == null ? "无活动候选" : "活动候选详见研究页"} · {permission?.automation ? "自动化状态详见研究页" : "自动化未批准"}<br />当前未具备生产资格</p>}
          <Action href="#/research">阅读研究结果 ↗</Action>
        </aside>
      </div>
    </section>
    <section className="section catalog-peek">
      <Chapter title="THE CATALOG." subtitle={actualDataset?.syntheticOnly ? "作品速览 / 三个合成样例" : "作品速览 / 当前档案"} aside={<a href="#/works">全部作品 ↗</a>} />
      {resource.data?.recentWorks?.length ? <div className="work-tiles">{resource.data.recentWorks.slice(0,3).map(work => <WorkTile key={work.id} work={work} />)}</div> :
        <StatePanel resource={resource} empty={Boolean(resource.data)} />}
    </section>
  </>;
}
