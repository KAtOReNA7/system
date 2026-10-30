import React, { useEffect, useRef } from "react";
import { useResource, useRoute } from "./api.js";
import { Footer } from "./components/ui.jsx";
import Home from "./pages/Home.jsx";
import Catalog from "./pages/Catalog.jsx";
import WorkDetail from "./pages/WorkDetail.jsx";
import Research from "./pages/Research.jsx";

export default function App() {
  const route = useRoute();
  const context = useResource("/api/workspace/context");
  const research = useResource("/api/m2/public/research-summary");
  const mainRef = useRef(null);
  const active = route.path.startsWith("/works") ? "works" : route.path === "/research" ? "research" : "home";
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.title = ({ home: "工作台", works: "作品库", research: "研究结果" }[active]) + " · SYSTEM.";
    mainRef.current?.focus({ preventScroll: true });
  }, [route.path, active]);
  const dataset = context.data?.dataset;
  const modeLabel = context.loading ? "读取数据模式…" : context.error ? "数据模式不可用" : dataset?.syntheticOnly ? "合成演示 v0.2" : dataset?.sourceLabelZh ?? "正式数据 · 只读";
  return <div className="app">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); mainRef.current?.focus(); }}>跳到主要内容</a>
    <header className="site-header"><a className="brand" href="#/" aria-label="SYSTEM 工作台">SYSTEM.</a><span className="brand-description">有声书业务系统</span>
      <nav aria-label="主导航">{[["01","工作台","#/","home"],["02","作品库","#/works","works"],["03","研究结果","#/research","research"]].map(([number,label,href,key]) => <a key={key} href={href} aria-current={active === key ? "page" : undefined}><span>{number}</span>{label}</a>)}</nav>
      <span className="mode-badge" data-testid="data-mode">{modeLabel}</span>
    </header>
    <main id="main-content" ref={mainRef} tabIndex="-1">
      {dataset?.kind === "RAW_LEDGER_AUDIT" && route.path !== "/research" && <section className="audit-banner section" role="status" data-testid="audit-banner"><h2>原始账单核对 / 对账尚未通过</h2><p>拆分账单与总账存在差异。此处仅供查看原始记录和核对资料，金额待核对，不用于正式财务汇总、预测或业务验收。</p><p className="small">总账侧未匹配 {dataset.reconciliation?.missingRowCount ?? "—"} 条；拆分侧多出 {dataset.reconciliation?.extraRowCount ?? "—"} 条。候选归并未应用。</p><p className="small">{Object.entries(dataset.reconciliation?.extraByMonth ?? {}).map(([month,count])=>month+"：拆分多出 "+count+" 条").join("；")}</p></section>}
      {route.path === "/" ? <Home dataset={dataset} research={research} /> :
        route.path === "/works" ? <Catalog params={route.params} dataset={dataset} /> :
          route.path.startsWith("/works/") ? <WorkDetail encodedId={route.path.slice(7)} back={route.params.get("back")} dataset={dataset} /> :
            route.path === "/research" ? <Research resource={research} /> :
              <section className="section state-panel"><h1>页面不存在</h1><a href="#/">返回工作台 ↗</a></section>}
    </main>
    <Footer path={route.path}>{route.path === "/research" ? "公开历史研究 · 四周期分别判断 · 当前未启用生产。" : dataset?.syntheticOnly ? "作品与金额为合成演示，研究状态另行标注。" : dataset?.kind === "RAW_LEDGER_AUDIT" ? "原始账单待核对 · 不用于正式财务或模型。" : dataset?.source === "local-reviewed-ledger-snapshot" ? "本地真实账单 · 只读浏览 · 数据治理状态分别标注。" : "正式只读接口 · 未接入字段留空。"}</Footer>
  </div>;
}
