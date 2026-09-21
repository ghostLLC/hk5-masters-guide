/* 港五 + 新二 + 中外合办 商科授课硕士 · 浏览与检索逻辑
 * 版式取自 V2 重构方案：左侧分面筛选 + 卡片/表格双视图 + 志愿单抽屉 + 渐进加载
 * 本文件负责：项目数据的读取与格式化、筛选与排序、列表渲染、志愿单、详情弹窗、导出
 * 不负责：云端持久化（store.js）、申请跟进表与视图切换（track.js）
 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const WISH_KEY = "hk5_wish_v2";
  const WISH_KEY_LEGACY = "hk5_wish_v1";
  const UNVERIFIED = "官网未提供，待核实";
  const HK5 = new Set(["HKU", "CUHK", "HKUST", "CityU", "PolyU"]);
  const PAGE_STEP = 30;

  const state = {
    list: PROGRAMMES.slice(),
    wish: loadWish(),
    expanded: new Set(),
    q: "",
    uni: new Set(),
    cat: new Set(),
    open: new Set(),
    fee: new Set(),
    sort: "default",
    shown: PAGE_STEP,
    mode: "card"
  };

  // 志愿单变更订阅者：store.js 推云端、track.js 重绘跟进表
  const wishListeners = [];

  /* ---------- 输出安全 ---------- */

  function esc(v) {
    if (v === undefined || v === null || v === "") return "";
    return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const nf = n => (typeof n === "number" ? n.toLocaleString("en-US") : "");
  const clip = (s, n) => {
    const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n).replace(/[\s，,、;；。.!！?？]+$/, "") + "…" : t;
  };
  function progLink(p, cls, text) {
    const u = String(p.website || "").trim();
    if (!/^https?:\/\//i.test(u)) return `<span class="${cls}">${esc(text)}</span>`;
    return `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  }

  /* ---------- 字段读取 ---------- */

  const descCnOf = p => p.descCn || p.desc || "";
  const descEnOf = p => p.descEn || p.desc || "";
  const reqCnOf = p => p.requirementsCn || p.requirements || "";
  const reqEnOf = p => p.requirementsEn || p.requirements || "";
  // 34 条早期条目缺中英对照，且 requirements 是压缩改写而非官网逐字原文，必须可被识别
  const REQ_PLACEHOLDER = /未能获取|请点官网核实/;
  const reqOk = p => !!p.requirementsCn && !!p.requirementsEn
    && !REQ_PLACEHOLDER.test(p.requirementsCn) && !REQ_PLACEHOLDER.test(p.requirementsEn);
  const open27Of = p => p.open27 === true ? "open" : p.open27 === "pending" ? "pending" : "closed";
  const OPEN27 = { open: "可申请", pending: "待批准/待开放", closed: "未开放" };

  function tuitionParts(p) {
    const cny = typeof p.tuitionCny === "number" ? p.tuitionCny : null;
    if (typeof p.tuitionPerCredit === "number" && typeof p.tuitionCredits === "number") {
      return { primary: `HK$${nf(p.tuitionPerCredit)}/学分 × ${p.tuitionCredits}`, cny, estimate: true, kind: "per-credit" };
    }
    if (typeof p.tuitionRmbPerYear === "number") {
      const yrs = p.durationYears ? ` × ${p.durationYears} 年` : "";
      return { primary: `¥${nf(p.tuitionRmbPerYear)}/学年${yrs}`, cny: typeof p.tuitionRmb === "number" ? p.tuitionRmb : null, estimate: true, kind: "per-year" };
    }
    if (typeof p.tuitionPerModuleMinSgd === "number") {
      return { primary: `S$${nf(p.tuitionPerModuleMinSgd)}–${nf(p.tuitionPerModuleMaxSgd)}/模块`, cny, estimate: false, kind: "per-module" };
    }
    const bits = [];
    if (typeof p.tuitionHkd === "number") bits.push("HK$" + nf(p.tuitionHkd));
    if (typeof p.tuitionSgd === "number") bits.push("S$" + nf(p.tuitionSgd));
    if (typeof p.tuitionRmb === "number") return { primary: "¥" + nf(p.tuitionRmb), cny: null, estimate: false, kind: "rmb" };
    if (!bits.length) return { primary: "", cny: null, estimate: false, kind: p.feeSource === "unverified" ? "unverified" : "none" };
    return { primary: bits.join(" / "), cny, estimate: false, kind: "multi" };
  }

  function tuitionSortValue(p) {
    if (typeof p.tuitionCny === "number") return p.tuitionCny;
    if (typeof p.tuitionRmb === "number") return p.tuitionRmb;
    const fx = (DATA_META && DATA_META.fx) || {};
    if (typeof p.tuitionHkd === "number" && fx.HKD_CNY) return p.tuitionHkd * fx.HKD_CNY;
    if (typeof p.tuitionSgd === "number" && fx.SGD_CNY) return p.tuitionSgd * fx.SGD_CNY;
    return null;
  }
  // 官网未列费用的无论升降序都排最后
  function cmpTuition(a, b, dir) {
    const x = tuitionSortValue(a), y = tuitionSortValue(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * (dir === "desc" ? -1 : 1);
  }

  const FEE_BADGE = {
    "official-page": { text: "学费官网已核", tone: "ok" },
    "official-per-credit": { text: "按学分计费·总额为估算", tone: "warn" },
    "official-per-year": { text: "按学年计费·总额为估算", tone: "warn" },
    "official-per-module": { text: "按模块计费", tone: "warn" },
    "official-installments": { text: "学费官网已核·按学期分项", tone: "ok" },
    "official-other-intake": { text: "官网仅列其他入学周期", tone: "warn" },
    "official-pending-approval": { text: "官网学费待审批", tone: "warn" },
    "unverified": { text: "学费待核实", tone: "bad" }
  };
  const FEE_DESC = {
    "official-page": "已对照官网项目页核实",
    "official-per-credit": "官网按学分计费，未列全程总额，总额为估算",
    "official-per-year": "官网按学年计费，未列全程总额，总额为估算",
    "official-per-module": "官网按模块计费，未列模块数",
    "official-installments": "官网按学期分项列示，不自行加总",
    "official-pending-approval": "官网标注为待审批，非最终金额",
    "official-other-intake": "官网仅列明其他入学周期，本周期费用须向项目确认",
    "unverified": "未经官网核实，投递前务必打开官网确认"
  };

  /* ---------- 志愿单存取 ---------- */

  // 只存 id 与加入时间，展示/导出时回查 PROGRAMMES，避免快照与数据库脱节
  function loadWish() {
    const ids = new Set(PROGRAMMES.map(p => p.id));
    const read = key => {
      try {
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    };
    const normalize = arr => arr
      .map(w => (typeof w === "string" ? { id: w } : w))
      .filter(w => w && ids.has(w.id))
      .map(w => ({ id: w.id, addedAt: w.addedAt || 0 }));

    const current = normalize(read(WISH_KEY));
    if (current.length) return current;
    return normalize(read(WISH_KEY_LEGACY));
  }

  function saveWish(silent) {
    try { localStorage.setItem(WISH_KEY, JSON.stringify(state.wish)); }
    catch { /* 隐私模式或配额满：数据仍在内存，交给 store.js 的状态条提示 */ }
    if (silent) return;
    for (const fn of wishListeners) {
      try { fn(); } catch (e) { console.error(e); }
    }
  }

  const isWished = id => state.wish.some(w => w.id === id);
  function toggleWish(id) {
    if (isWished(id)) state.wish = state.wish.filter(w => w.id !== id);
    else state.wish.push({ id, addedAt: Date.now() });
    saveWish();
    renderWish();
    renderList();
    renderTabCount();
  }
  function removeWish(id) {
    state.wish = state.wish.filter(w => w.id !== id);
    saveWish();
    renderWish();
    renderList();
    renderTabCount();
  }
  function clearWish() {
    state.wish = [];
    saveWish();
    renderWish();
    renderList();
    renderTabCount();
  }
  function moveWish(id, dir) {
    const items = wishItems();
    const ids = items.map(p => p.id);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const byId = new Map(state.wish.map(w => [w.id, w]));
    state.wish = ids.map(x => byId.get(x)).filter(Boolean);
    saveWish();
    renderWish();
    renderTabCount();
  }
  function wishItems() {
    const m = new Map(state.list.map(p => [p.id, p]));
    return state.wish.map(w => m.get(w.id)).filter(Boolean);
  }

  /* ---------- 筛选 ---------- */

  function haystack(p) {
    return [p.uni, p.uniCn, p.nameCn, p.nameEn, p.faculty, p.facultyCn, p.category,
      descCnOf(p), descEnOf(p), reqCnOf(p), reqEnOf(p), p.tuitionNote, p.applyWindow,
      p.location, p.jointPartner].filter(Boolean).join(" \u0001 ").toLowerCase();
  }
  const HAY = new WeakMap();
  const hayOf = p => { let h = HAY.get(p); if (!h) { h = haystack(p); HAY.set(p, h); } return h; };

  function filtered() {
    const terms = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return state.list.filter(p => {
      if (state.uni.size && !state.uni.has(p.uni)) return false;
      if (state.cat.size && !state.cat.has(p.category)) return false;
      if (state.open.size && !state.open.has(open27Of(p))) return false;
      if (state.fee.size && !state.fee.has(p.feeSource || "unverified")) return false;
      if (terms.length) { const h = hayOf(p); if (!terms.every(t => h.includes(t))) return false; }
      return true;
    });
  }

  function sorted(items) {
    const k = state.sort.replace(/^-/, ""), dir = state.sort.startsWith("-") ? -1 : 1;
    if (!k || k === "default") return items;
    if (k === "fee") return items.slice().sort((a, b) => cmpTuition(a, b, dir === -1 ? "desc" : "asc"));
    const by = {
      uni: p => p.uni, name: p => p.nameCn, cat: p => p.category,
      open: p => ({ open: 0, pending: 1, closed: 2 })[open27Of(p)]
    }[k];
    if (!by) return items;
    return items.slice().sort((a, b) => {
      const x = by(a), y = by(b);
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "zh-Hans-CN")) * dir;
    });
  }

  function facetCounts(key, map) {
    const counts = new Map();
    for (const p of filtered()) {
      const k = map ? map(p) : p[key];
      if (k == null || k === "") continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }

  /* ---------- 徽章与单元格 ---------- */

  function tagsOf(p) {
    const st = open27Of(p);
    const fee = FEE_BADGE[p.feeSource || "unverified"] || FEE_BADGE.unverified;
    const out = [
      `<span class="tag uni">${esc(p.uni)}</span>`,
      `<span class="tag tone-${st === "open" ? "ok" : st === "pending" ? "warn" : "pend"}">${esc(OPEN27[st])}</span>`,
      `<span class="tag tone-${fee.tone}">${esc(fee.text)}</span>`
    ];
    if (p.sourceConfidence !== "official-listed") out.push(`<span class="tag tone-warn">存在性待核实</span>`);
    if (!reqOk(p)) out.push(`<span class="tag tone-warn">申请要求非官网原文</span>`);
    return out.join("");
  }

  function feeCell(p) {
    const t = tuitionParts(p);
    if (!t.primary) return `<span class="badge tone-${t.kind === "unverified" ? "bad" : "pend"}">${esc(t.kind === "unverified" ? "学费待核实" : "见官网")}</span>`;
    return `${esc(t.primary)}${t.cny ? ` ≈ ¥${nf(t.cny)}` : ""}${t.estimate ? ` <span class="est">估算</span>` : ""}`;
  }

  /* ---------- 列表渲染 ---------- */

  function cardHtml(p) {
    return `<article class="pc${isWished(p.id) ? " wished" : ""}" data-id="${esc(p.id)}">
      <div class="top">
        <div style="min-width:0">
          <h3>${progLink(p, "", p.nameCn)}</h3>
          <p class="en">${esc(p.nameEn)} · ${esc(p.uniCn)} · ${esc(p.category)}</p>
        </div>
      </div>
      <div class="tags">${tagsOf(p)}</div>
      <p class="d">${esc(clip(descCnOf(p), 200))}</p>
      <div class="kv">
        <span>学费 <b>${feeCell(p)}</b></span>
        <span>学制 <b>${esc(p.durationYears ? p.durationYears + " 年" : "见官网")}</b></span>
        ${p.location && !HK5.has(p.uni) ? `<span>授课 <b>${esc(p.location)}</b></span>` : ""}
      </div>
      <div class="foot">
        <button type="button" class="btn ghost sm" data-act="modal">完整信息</button>
        <button type="button" class="btn ${isWished(p.id) ? "ghost" : ""} sm" data-act="wish">${isWished(p.id) ? "已在志愿单" : "加入志愿"}</button>
      </div>
    </article>`;
  }

  const TCOLS = [
    { k: "uni", label: "学校" }, { k: "name", label: "项目" }, { k: "cat", label: "方向" },
    { k: "fee", label: "学费", num: true }, { k: null, label: "学制" },
    { k: "open", label: "27 Fall" }, { k: null, label: "授课地" }, { k: null, label: "" }
  ];

  function tableHtml(items) {
    const arrow = k => !k ? "" : (state.sort === k ? " ↓" : state.sort === "-" + k ? " ↑" : "");
    return `<div class="twrap"><table class="dtable">
      <caption class="sr">专业列表</caption>
      <thead><tr>${TCOLS.map(c => `<th scope="col"${c.num ? ' class="num"' : ""}>${c.k
        ? `<button type="button" data-sort="${esc(c.k)}">${esc(c.label)}${arrow(c.k)}</button>` : esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${items.map(p => {
        const st = open27Of(p);
        return `<tr data-id="${esc(p.id)}">
          <td><span class="sub">${esc(p.uni)}</span></td>
          <td><span class="nm">${progLink(p, "", p.nameCn)}</span><br/><span class="sub">${esc(clip(p.nameEn, 46))}</span></td>
          <td><span class="sub">${esc(p.category)}</span></td>
          <td class="num">${feeCell(p)}</td>
          <td class="num"><span class="sub">${esc(p.durationYears ? p.durationYears + " 年" : "见官网")}</span></td>
          <td><span class="tag tone-${st === "open" ? "ok" : st === "pending" ? "warn" : "pend"}">${esc(OPEN27[st])}</span></td>
          <td><span class="sub">${esc(p.location || "—")}</span></td>
          <td style="white-space:nowrap">
            <button type="button" class="btn ghost sm" data-act="modal">详情</button>
            <button type="button" class="btn ${isWished(p.id) ? "ghost" : ""} sm" data-act="wish">${isWished(p.id) ? "已选" : "选"}</button>
          </td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function renderList() {
    const items = sorted(filtered());
    const slice = items.slice(0, state.shown);
    $("#resCount").innerHTML = `<strong>${items.length}</strong> 条结果${items.length > slice.length ? `，已显示 ${slice.length}` : ""}`;
    const host = $("#results");
    if (!items.length) {
      host.innerHTML = `<div class="empty">没有符合条件的项目。<br/>试试移除部分筛选条件，或清空搜索关键词。</div>`;
      $("#moreWrap").innerHTML = "";
      return;
    }
    host.innerHTML = state.mode === "card"
      ? `<div class="grid">${slice.map(cardHtml).join("")}</div>`
      : tableHtml(slice);
    $("#moreWrap").innerHTML = items.length > state.shown
      ? `<button type="button" class="btn ghost" id="btnMore">再显示 ${Math.min(PAGE_STEP, items.length - state.shown)} 条</button>
         <div class="hint">已显示 ${slice.length} / ${items.length} 条</div>`
      : (items.length > PAGE_STEP ? `<div class="hint">已显示全部 ${items.length} 条</div>` : "");
    const bm = $("#btnMore");
    if (bm) bm.addEventListener("click", () => { state.shown += PAGE_STEP; renderList(); });
  }

  /* ---------- 分面与筛选标签 ---------- */

  function facetGroup(id, title, entries, selected, open) {
    const total = [...entries.values()].reduce((a, b) => a + b, 0);
    return `<details class="fgroup"${open ? " open" : ""}>
      <summary>${esc(title)} <span class="fn">${selected.size ? `已选 ${selected.size}` : total}</span></summary>
      <div class="fopts">${[...entries].length ? [...entries].map(([k, n]) => `<label class="fopt">
        <input type="checkbox" data-facet="${esc(id)}" value="${esc(k)}"${selected.has(k) ? " checked" : ""}/>
        <span title="${esc(k)}">${esc(k)}</span><i>${n}</i></label>`).join("") : `<div class="fopt" style="color:var(--muted)">当前筛选下无结果</div>`}
      </div>
    </details>`;
  }

  function renderFacets() {
    const uniCn = new Map(state.list.map(p => [p.uni, p.uniCn]));
    const uni = new Map([...facetCounts("uni")].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, n]) => [`${k} · ${uniCn.get(k) || k}`, n]));
    // 分面键要保持原始 uni 值，标签才好看；这里用 data-value 承载真实值
    const uniEntries = new Map();
    for (const [k, n] of facetCounts("uni")) uniEntries.set(k, n);
    const uniSorted = new Map([...uniEntries].sort((a, b) => a[0].localeCompare(b[0])));
    const catEntries = new Map([...facetCounts("category")].sort((a, b) => b[1] - a[1]));

    const openMap = new Map(Object.keys(OPEN27).map(k => [k, 0]));
    for (const p of filtered()) {
      const k = open27Of(p);
      openMap.set(k, (openMap.get(k) || 0) + 1);
    }
    const feeMap = new Map(Object.keys(FEE_BADGE).map(k => [k, 0]));
    for (const p of filtered()) {
      const k = p.feeSource || "unverified";
      feeMap.set(k, (feeMap.get(k) || 0) + 1);
    }

    $("#facets").innerHTML =
      facetGroup("uni", "学校", uniSorted, state.uni, true)
      + facetGroup("cat", "方向", catEntries, state.cat, true)
      + `<details class="fgroup" open><summary>27 Fall 状态 <span class="fn">${state.open.size ? `已选 ${state.open.size}` : ""}</span></summary>
          <div class="fopts">${[...openMap].map(([k, n]) => `<label class="fopt">
            <input type="checkbox" data-facet="open" value="${esc(k)}"${state.open.has(k) ? " checked" : ""}/>
            <span>${esc(OPEN27[k])}</span><i>${n}</i></label>`).join("")}</div></details>`
      + `<details class="fgroup"><summary>学费核实状态 <span class="fn">${state.fee.size ? `已选 ${state.fee.size}` : ""}</span></summary>
          <div class="fopts">${[...feeMap].map(([k, n]) => `<label class="fopt">
            <input type="checkbox" data-facet="fee" value="${esc(k)}"${state.fee.has(k) ? " checked" : ""}/>
            <span>${esc(FEE_BADGE[k].text)}</span><i>${n}</i></label>`).join("")}</div></details>`
      + `<button type="button" class="fclear" id="btnClearFacets">清除全部筛选</button>`;
    void uni;
    $("#btnClearFacets").addEventListener("click", resetAll);
  }

  function renderChips() {
    const chips = [];
    const push = (facet, key, label) => chips.push(`<span class="fchip">${esc(label)}<button type="button" data-chip="${esc(facet)}" data-key="${esc(key)}" aria-label="移除筛选 ${esc(label)}">×</button></span>`);
    if (state.q.trim()) chips.push(`<span class="fchip">搜索「${esc(clip(state.q.trim(), 24))}」<button type="button" data-chip="q" aria-label="清除搜索">×</button></span>`);
    for (const k of state.uni) push("uni", k, k);
    for (const k of state.cat) push("cat", k, k);
    for (const k of state.open) push("open", k, OPEN27[k]);
    for (const k of state.fee) push("fee", k, (FEE_BADGE[k] || {}).text || k);
    $("#chips").innerHTML = chips.join("");
  }

  function resetAll() {
    state.q = ""; state.uni.clear(); state.cat.clear(); state.open.clear(); state.fee.clear();
    state.sort = "default"; state.shown = PAGE_STEP;
    $("#q").value = ""; $("#sortSel").value = "default";
    renderFacets(); renderChips(); renderList();
    toast("已清除全部筛选");
  }

  /* ---------- 志愿单抽屉 ---------- */

  let drawerOpen = false;
  function setDrawer(open) {
    drawerOpen = open;
    $("#drawer").classList.toggle("open", open);
    $("#drawer").setAttribute("aria-hidden", open ? "false" : "true");
    $("#scrim").classList.toggle("open", open);
    $("#btnWish").setAttribute("aria-expanded", open ? "true" : "false");
    if (open) $("#drawerClose").focus();
  }

  function renderWish() {
    const items = wishItems();
    const wq = ($("#wq").value || "").trim().toLowerCase();
    const sort = $("#wSort").value;
    let list = items.slice();
    if (wq) list = list.filter(p => (p.nameCn + p.nameEn + p.uni + p.uniCn + p.category).toLowerCase().includes(wq));
    if (sort === "uni") list.sort((a, b) => a.uni.localeCompare(b.uni));
    else if (sort === "tuition") list.sort((a, b) => cmpTuition(a, b, "asc"));
    else if (sort === "open") { const r = { open: 0, pending: 1, closed: 2 }; list.sort((a, b) => r[open27Of(a)] - r[open27Of(b)]); }

    $("#wishN").textContent = items.length ? String(items.length) : "";
    $("#btnWish").disabled = false;
    const host = $("#wishList");
    if (!list.length) {
      host.innerHTML = `<div class="drawer-empty">${items.length ? "没有匹配的志愿。" : "志愿单还是空的。<br/>在项目卡片或表格里点「加入志愿」。"}</div>`;
      return;
    }
    const order = new Map(items.map((p, i) => [p.id, i]));
    const tr = id => (window.HK5Store ? window.HK5Store.getTrack(id) : null);
    host.innerHTML = list.map(p => {
      const t = tuitionParts(p);
      const tk = tr(p.id);
      return `<div class="wi" data-id="${esc(p.id)}">
        <div class="t">${order.get(p.id) + 1}. ${progLink(p, "", p.nameCn)}</div>
        <div class="s">${esc(p.uni)} · ${esc(OPEN27[open27Of(p)])}${t.cny ? ` · ≈¥${nf(t.cny)}` : t.primary ? ` · ${esc(t.primary)}` : ""}${tk && tk.status !== "not_started" ? ` · ${esc((window.HK5Store.STATUSES || {})[tk.status] || tk.status)}` : ""}</div>
        <div class="a">
          <button type="button" data-act="up" aria-label="上移">↑</button>
          <button type="button" data-act="down" aria-label="下移">↓</button>
          <button type="button" data-act="unwish">移除</button>
          <button type="button" data-act="modal">详情</button>
        </div>
      </div>`;
    }).join("");
  }

  function renderTabCount() {
    const el = $("#trackCount");
    if (!el) return;
    const n = wishItems().length + Math.max(0, Object.keys((window.HK5Store && window.HK5Store.tracks) || {}).length - state.wish.length);
    el.textContent = n ? String(n) : "";
  }

  /* ---------- 详情弹窗 ---------- */

  function block(label, text, en) {
    if (!text) return "";
    return `<tr><th scope="row">${esc(label)}</th><td class="${en ? "en" : ""}">${esc(text)}</td></tr>`;
  }
  function openModal(id) {
    const p = state.list.find(x => x.id === id);
    if (!p) return;
    const t = tuitionParts(p);
    $("#modal").innerHTML = `
      <h3>${esc(p.nameCn)}</h3>
      <div class="sub">${esc(p.nameEn)} · ${esc(p.uniCn)} · ${esc(p.category)}</div>
      <table><tbody>
        ${block("学院", p.facultyCn || p.faculty)}
        ${block("学费", t.primary ? t.primary + (t.cny ? ` ≈ ¥${nf(t.cny)}` : "") + (t.estimate ? "（总额估算）" : "") : "官网未提供，待核实")}
        ${block("学制", p.durationText || (p.durationYears ? p.durationYears + " 年" : "官网未提供"))}
        ${block("开办年份", p.foundedYear ? p.foundedYear + " 年" : "官网未列，不推算")}
        ${block("27 Fall", OPEN27[open27Of(p)])}
        ${block("联培学校/企业", p.jointPartner || "—")}
        ${block("授课地点", p.location || "—")}
        ${block("简介 · 中文", descCnOf(p) || "官网未提供，待核实")}
        ${block(descEnOf(p) && p.descEn ? "简介 · 英文原文" : "简介 · 英文（本条暂无英文，此处显示中文）", descEnOf(p), true)}
        ${block(reqOk(p) ? "申请要求 · 中文" : "申请要求 · 中文（本条暂无中文，此处显示英文摘要）", reqCnOf(p) || "官网未提供，待核实")}
        ${block(reqOk(p) ? "要求 · 英文原文" : "要求 · 英文（早期压缩摘要，非官网逐字原文，投递前务必点官网核对）", reqEnOf(p), true)}
        ${block("学费说明", p.tuitionNote || "—")}
        ${block("允许投递时间", p.applyWindow || "—")}
        <tr><th scope="row">官网</th><td>${progLink(p, "", p.website || "—")}</td></tr>
        ${block("数据可信度", (p.sourceConfidence === "official-listed" ? "官网名单已确认" : "项目存在性待官网核实")
          + "；学费" + (FEE_DESC[p.feeSource] || "未经官网核实")
          + (reqOk(p) ? "" : "；申请要求为早期压缩摘要，非官网逐字原文"))}
        ${block("来源说明", p.sourceNote || "—")}
      </tbody></table>
      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn" data-act="wish" data-id="${esc(p.id)}">${isWished(p.id) ? "已在志愿单（点击移除）" : "加入志愿单"}</button>
        <button type="button" class="btn ghost" id="modalClose">关闭</button>
      </div>`;
    $("#backdrop").classList.add("open");
    $("#modalClose").addEventListener("click", closeModal);
    $("#modalClose").focus();
  }
  const closeModal = () => $("#backdrop").classList.remove("open");

  /* ---------- 来源提示条 ---------- */

  function renderSourceBar() {
    const P = state.list, total = P.length;
    const n = f => P.filter(f).length;
    const conf = n(p => p.sourceConfidence === "official-listed");
    const byFee = k => n(p => (p.feeSource || "unverified") === k);
    const feeOk = byFee("official-page");
    const feeBad = byFee("unverified");
    const reqBad = n(p => !reqOk(p));
    const fx = DATA_META.fx || {};
    $("#sourceBody").innerHTML =
      `<strong>项目存在性：</strong>${conf} 条已在官网名单确认，${total - conf} 条待核实（均为港五条目）。<br/>` +
      `<strong>学费：</strong>${feeOk} 条取自官网项目页；${byFee("official-per-credit")} 条按学分计费（总额 = 官网单价 × 官网最低毕业学分，属估算）；` +
      `${byFee("official-per-year")} 条按学年计费（总额 = 学年单价 × 官网学制，属估算）；${byFee("official-installments")} 条按学期分项列示；` +
      `${byFee("official-other-intake")} 条官网仅列其他入学周期；${byFee("official-pending-approval")} 条官网标注待审批；${feeBad} 条未能核实。<br/>` +
      `<strong>申请要求：</strong>${total - reqBad} 条为官网逐字原文并附中文对照，${reqBad} 条为早期压缩摘要（卡片与详情中已标注）。<br/>` +
      `<strong>27 Fall：</strong>可申请 ${n(p => p.open27 === true)} 条、待批准或待开放 ${n(p => p.open27 === "pending")} 条、未开放 ${n(p => p.open27 === false)} 条。<br/>` +
      `<strong>人民币换算：</strong>${esc(fx.date || "")} 汇率 1 HKD = ${esc(fx.HKD_CNY)}、1 SGD = ${esc(fx.SGD_CNY)}（来源 ${esc(fx.source || "")}），取整到百元，仅为参考、非各校官网数字；官网原币值始终优先展示。身份档位按${esc(DATA_META.applicantResidency || "中国大陆")}申请者取。<br/>` +
      `<strong>投递前必须点专业名跳转官网确认学费、截止日期与语言要求。</strong>`;
    $("#sourceSummaryText").textContent = `数据来源自查（${(DATA_META.lastRefreshed || "").slice(0, 10)} 复核）：共 ${total} 条 · ${conf} 条官网名单已核 · ${feeBad} 条学费待核实 · ${reqBad} 条申请要求非官网原文`;
  }

  /* ---------- 提示与导出 ---------- */

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
  }

  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  const WISH_HEAD = ["顺序", "学校", "中文名", "英文名", "方向", "学院", "学制", "学费(官网原文)", "学费CNY(参考)", "是否估算总额", "27Fall状态", "申请窗口", "授课地点", "联培", "申请要求(中文)", "申请要求(英文)", "申请要求核实状态", "数据可信度", "官网"];
  const wishRow = (p, i) => {
    const t = tuitionParts(p);
    return [i + 1, p.uni, p.nameCn, p.nameEn, p.category, p.facultyCn || p.faculty,
      p.durationText || (p.durationYears ? p.durationYears + " 年" : ""), t.primary, t.cny ?? "",
      t.estimate ? "是" : "否", OPEN27[open27Of(p)], p.applyWindow || "", p.location || "", p.jointPartner || "",
      reqCnOf(p), reqEnOf(p), reqOk(p) ? "官网逐字原文并附中文对照" : "早期压缩摘要，非官网原文且无中文对照",
      p.sourceConfidence === "official-listed" ? "官网名单已核" : "待官网核实", p.website];
  };
  function exportWishCsv() {
    const items = wishItems();
    if (!items.length) return toast("志愿单为空，无法导出");
    download("商科硕士志愿单.csv", "\ufeff" + [WISH_HEAD.map(q).join(","), ...items.map((p, i) => wishRow(p, i).map(q).join(","))].join("\r\n"), "text/csv;charset=utf-8");
    toast("已导出志愿单 CSV");
  }
  function exportWishJson() {
    const items = wishItems();
    if (!items.length) return toast("志愿单为空，无法导出");
    download("商科硕士志愿单.json", JSON.stringify({ kind: "hk5-masters-guide/wishlist", exportedAt: new Date().toISOString(), items }, null, 2), "application/json;charset=utf-8");
    toast("已导出志愿单 JSON");
  }

  /* ---------- 事件 ---------- */

  function bind() {
    let debounce;
    $("#q").addEventListener("input", e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.q = e.target.value; state.shown = PAGE_STEP;
        renderChips(); renderFacets(); renderList();
      }, 140);
    });

    $("#facets").addEventListener("change", e => {
      const el = e.target;
      if (!el.dataset || !el.dataset.facet) return;
      const set = state[el.dataset.facet];
      el.checked ? set.add(el.value) : set.delete(el.value);
      state.shown = PAGE_STEP;
      renderChips(); renderFacets(); renderList();
    });
    $("#facets").addEventListener("click", e => {
      const b = e.target.closest("#btnClearFacets");
      if (b) resetAll();
    });

    $("#chips").addEventListener("click", e => {
      const b = e.target.closest("[data-chip]");
      if (!b) return;
      const f = b.dataset.chip;
      if (f === "q") { state.q = ""; $("#q").value = ""; }
      else state[f].delete(b.dataset.key);
      state.shown = PAGE_STEP;
      renderChips(); renderFacets(); renderList();
    });

    $$("[data-mode]").forEach(b => b.addEventListener("click", () => {
      state.mode = b.dataset.mode;
      $$("[data-mode]").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
      state.shown = PAGE_STEP;
      renderList();
      try { localStorage.setItem("hk5_mode_v1", state.mode); } catch { /* 忽略 */ }
    }));

    $("#sortSel").addEventListener("change", e => { state.sort = e.target.value; state.shown = PAGE_STEP; renderList(); });

    $("#results").addEventListener("click", e => {
      const sortBtn = e.target.closest("[data-sort]");
      if (sortBtn) {
        const k = sortBtn.dataset.sort;
        state.sort = state.sort === k ? "-" + k : state.sort === "-" + k ? "default" : k;
        const sel = $("#sortSel");
        sel.value = [...sel.options].some(o => o.value === state.sort) ? state.sort : "default";
        renderList();
        return;
      }
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const host = e.target.closest("[data-id]");
      if (!host) return;
      const id = host.dataset.id;
      if (btn.dataset.act === "modal") openModal(id);
      else if (btn.dataset.act === "wish") {
        toggleWish(id);
        toast(isWished(id) ? "已加入志愿单" : "已移出志愿单");
      }
    });

    $("#btnWish").addEventListener("click", () => setDrawer(!drawerOpen));
    $("#drawerClose").addEventListener("click", () => setDrawer(false));
    $("#scrim").addEventListener("click", () => setDrawer(false));

    $("#wishList").addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      const item = e.target.closest(".wi");
      if (!btn || !item) return;
      const id = item.dataset.id, act = btn.dataset.act;
      if (act === "up") { moveWish(id, -1); renderList(); if (isTrackView()) renderTrack(); return; }
      if (act === "down") { moveWish(id, 1); renderList(); if (isTrackView()) renderTrack(); return; }
      if (act === "unwish") { removeWish(id); if (isTrackView()) renderTrack(); toast("已移出志愿单，跟进记录保留"); return; }
      if (act === "modal") { setDrawer(false); return openModal(id); }
    });
    $("#wq").addEventListener("input", renderWish);
    $("#wSort").addEventListener("change", renderWish);
    $("#btnWishCsv").addEventListener("click", exportWishCsv);
    $("#btnWishJson").addEventListener("click", exportWishJson);
    $("#btnWishClear").addEventListener("click", () => {
      if (!state.wish.length) return toast("志愿单已是空的");
      if (confirm(`清空志愿单里的 ${state.wish.length} 个项目？跟进记录会保留。`)) {
        clearWish();
        if (isTrackView()) renderTrack();
        toast("已清空志愿单");
      }
    });

    $("#backdrop").addEventListener("click", e => { if (e.target.id === "backdrop") closeModal(); });
    $("#modal").addEventListener("click", e => {
      const b = e.target.closest('[data-act="wish"]');
      if (!b) return;
      toggleWish(b.dataset.id);
      openModal(b.dataset.id);
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeModal(); if (drawerOpen) setDrawer(false); }
    });
  }

  // track.js 会覆盖这两个钩子，用来判断当前是否在跟进视图并触发其重绘
  function isTrackView() { return typeof window.HK5IsTrackView === "function" ? window.HK5IsTrackView() : false; }
  function renderTrack() { if (typeof window.HK5RefreshTrack === "function") window.HK5RefreshTrack(); }

  /* ---------- 对外桥接：store.js 与 track.js 使用 ---------- */

  window.HK5App = {
    programmes: PROGRAMMES,
    byId(id) { return state.list.find(p => p.id === id) || null; },
    getWish() { return state.wish.map(w => ({ id: w.id, addedAt: w.addedAt || 0 })); },
    isWished,
    toast,
    esc,
    clip,
    nf,
    open27Of, OPEN27, FEE_BADGE, reqOk, descCnOf, descEnOf, reqCnOf, reqEnOf, tuitionParts, tuitionSortValue,
    refreshCards: () => { renderFacets(); renderChips(); renderList(); renderTabCount(); },
    refreshWish: renderWish,
    renderTabCount,
    onWishChange(fn) { wishListeners.push(fn); },
    // 云端对账后整体替换志愿单；silent=true 表示这次变更来自云端，不得再回推云端
    replaceWish(next, silent) {
      const ids = new Set(PROGRAMMES.map(p => p.id));
      state.wish = (Array.isArray(next) ? next : [])
        .filter(w => w && ids.has(w.id))
        .map(w => ({ id: w.id, addedAt: w.addedAt || 0 }));
      saveWish(silent);
      renderWish();
      renderList();
      renderTabCount();
    }
  };

  /* ---------- 启动 ---------- */

  function init() {
    $("#countLabel").textContent = PROGRAMMES.length;
    $("#refreshLabel").textContent = (DATA_META.lastRefreshed || "").slice(0, 10).replace(/-/g, "/");
    try {
      const m = localStorage.getItem("hk5_mode_v1");
      if (m === "table" || m === "card") {
        state.mode = m;
        $$("[data-mode]").forEach(x => x.setAttribute("aria-pressed", x.dataset.mode === m ? "true" : "false"));
      }
    } catch { /* 忽略 */ }
    bind();
    renderSourceBar();
    renderFacets();
    renderChips();
    renderList();
    renderWish();
    renderTabCount();
  }

  init();
})();
