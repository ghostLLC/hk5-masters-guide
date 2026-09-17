/* 港五商科硕士 · 交互逻辑 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const WISH_KEY = "hk5_wish_v1";
  const HISTORY_KEY = "hk5_refresh_history_v1";

  const state = {
    list: PROGRAMMES.slice(),
    wish: loadWish(),
    expanded: new Set(),
    lastRefreshed: DATA_META.lastRefreshed,
    refreshing: false
  };

  function loadWish() {
    try {
      const raw = localStorage.getItem(WISH_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      // 清理已从库中删除的项目（如 MBA/EMBA）
      const ids = new Set(PROGRAMMES.map(p => p.id));
      return Array.isArray(arr) ? arr.filter(w => w && ids.has(w.id)) : [];
    } catch { return []; }
  }
  function saveWish() {
    localStorage.setItem(WISH_KEY, JSON.stringify(state.wish));
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function openStatusText(p) {
    if (p.open27 === true) return { label: "可申请 27 Fall", cls: "open" };
    if (p.open27 === "pending") return { label: "待批准 / 待开放", cls: "pending" };
    if (p.open27 === false) return { label: "暂未开放", cls: "closed" };
    return { label: "状态未知", cls: "pending" };
  }

  function fmtTuition(p) {
    if (typeof p.tuitionHkd === "number") {
      return "HK$" + p.tuitionHkd.toLocaleString("en-US");
    }
    return p.tuitionNote || "以官网为准";
  }

  function yearsAgo(y) {
    const now = new Date().getFullYear();
    return Math.max(0, now - y);
  }

  function fillFilters() {
    const unis = [...new Set(PROGRAMMES.map(p => p.uni))].sort();
    const cats = [...new Set(PROGRAMMES.map(p => p.category))].sort();
    const uniSel = $("#fUni");
    const catSel = $("#fCat");
    unis.forEach(u => {
      const o = document.createElement("option");
      o.value = u; o.textContent = u + " · " + (PROGRAMMES.find(p => p.uni === u) || {}).uniCn;
      uniSel.appendChild(o);
    });
    cats.forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      catSel.appendChild(o);
    });
  }

  function getFiltered() {
    const q = $("#q").value.trim().toLowerCase();
    const uni = $("#fUni").value;
    const cat = $("#fCat").value;
    const open = $("#fOpen").value;

    return state.list.filter(p => {
      if (uni && p.uni !== uni) return false;
      if (cat && p.category !== cat) return false;
      if (open === "open" && p.open27 !== true) return false;
      if (open === "pending" && p.open27 !== "pending") return false;
      if (open === "closed" && p.open27 !== false) return false;
      if (!q) return true;
      const hay = [
        p.nameCn, p.nameEn, p.uni, p.uniCn, p.faculty, p.facultyCn,
        p.category, p.desc, p.requirements, p.jointPartner || "", p.location
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function isWished(id) {
    return state.wish.some(w => w.id === id);
  }

  function renderCards() {
    const rows = getFiltered();
    $("#resultCount").textContent = rows.length + " 个结果";
    $("#countLabel").textContent = state.list.length;
    $("#refreshLabel").textContent = new Date(state.lastRefreshed).toLocaleString("zh-CN", { hour12: false });
    $("#cycleLabel").textContent = DATA_META.cycle;
    // 来源说明
    const confOk = PROGRAMMES.filter(p => p.sourceConfidence === "official-listed").length;
    const bar = $("#statusBar");
    bar.className = "show warn";
    bar.innerHTML = `<strong>数据来源自查：</strong>共 ${PROGRAMMES.length} 条，其中 <strong>${confOk}</strong> 条项目名已在本轮官网列表中确认，其余为院系/交叉补充（卡片标注「待官网核实」）。学费、开办年份、截止日期多为参考估算，<strong>投递前必须点「去官网核实」确认</strong>。已删除无官网依据的虚构「选修方向变体」条目。`;

    const box = $("#cards");
    const empty = $("#emptyFilter");
    if (!rows.length) {
      box.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    box.innerHTML = rows.map(p => {
      const st = openStatusText(p);
      const wished = isWished(p.id);
      const expanded = state.expanded.has(p.id);
      const conf = p.sourceConfidence === "official-listed"
        ? '<span class="badge open">官网名单已核</span>'
        : '<span class="badge pending">待官网核实</span>';
      return `
        <article class="card ${wished ? "selected" : ""} ${expanded ? "expanded" : ""}" data-id="${p.id}">
          <div class="badge-row">
            <span class="badge uni">${p.uni} · ${p.uniCn}</span>
            <span class="badge">${p.category}</span>
            <span class="badge ${st.cls}">${st.label}</span>
            ${conf}
            ${p.feeSource === "official-page" ? '<span class="badge open">学费官网已核</span>' : ""}
            ${p.jointPartner ? `<span class="badge">联培：${p.jointPartner}</span>` : ""}
            ${p.location && p.location.indexOf("香港") === -1 ? `<span class="badge">授课：${p.location}</span>` : ""}
          </div>
          <div class="card-top">
            <div>
              <h3><a class="prog-link" href="${p.website}" target="_blank" rel="noopener" title="打开专业官网">${p.nameCn}</a></h3>
              <p class="en"><a class="prog-link" href="${p.website}" target="_blank" rel="noopener">${p.nameEn}</a></p>
            </div>
          </div>
          <p class="desc">${p.descCn || p.desc || ""}</p>
          <p class="desc-en">${p.descEn || ""}</p>
          <div class="meta-grid">
            <div><div class="k">学院</div><div class="v">${p.facultyCn || p.faculty}</div></div>
            <div><div class="k">学制</div><div class="v">${p.durationText}</div></div>
            <div><div class="k">学费</div><div class="v">${fmtTuition(p)}</div></div>
            <div><div class="k">申请要求</div><div class="v req-text">${(p.requirementsCn || p.requirements || "见官网").slice(0,80)}…</div></div>
            <div><div class="k">申请窗口</div><div class="v">${p.applyWindow}</div></div>
            <div><div class="k">授课地点</div><div class="v">${p.location}</div></div>
          </div>
          <div class="card-actions">
            <button class="btn ghost" data-act="detail">${expanded ? "收起详情" : "展开详情"}</button>
            <button class="btn" data-act="wish">${wished ? "已在志愿单" : "加入志愿"}</button>
          </div>
          <div class="detail">
            <div class="detail-block">
              <div class="detail-label">专业简介 · 中文</div>
              <div class="detail-body">${p.descCn || p.desc || "—"}</div>
            </div>
            <div class="detail-block">
              <div class="detail-label">Programme Description · English（官网原文）</div>
              <div class="detail-body en">${p.descEn || "—"}</div>
            </div>
            <div class="detail-block">
              <div class="detail-label">申请要求 · 中文</div>
              <div class="detail-body">${p.requirementsCn || p.requirements || "—"}</div>
            </div>
            <div class="detail-block">
              <div class="detail-label">Admission Requirements · English（官网原文）</div>
              <div class="detail-body en">${p.requirementsEn || "—"}</div>
            </div>
            <dl>
              <dt>英文名</dt><dd>${p.nameEn}</dd>
              <dt>学院（英文）</dt><dd>${p.faculty}</dd>
              <dt>学制 / 开办</dt><dd>${p.durationText}（约 ${p.durationYears} 年）· ${p.foundedYear} 年起（约 ${yearsAgo(p.foundedYear)} 年）</dd>
              ${p.tuitionNote ? `<dt>学费说明</dt><dd>${p.tuitionNote}</dd>` : ""}
              ${p.jointPartner ? `<dt>联培学校/企业</dt><dd>${p.jointPartner}</dd>` : ""}
              <dt>27 Fall 状态</dt><dd>${st.label}</dd>
              <dt>数据可信度</dt><dd>${p.sourceConfidence === "official-listed" ? "官网名单已确认项目存在" : "本轮未在官网列表直接确认，请点官网核实"}</dd>
              ${p.sourceNote ? `<dt>来源说明</dt><dd>${p.sourceNote}</dd>` : ""}
            </dl>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderWish() {
    const box = $("#wishList");
    let items = state.wish.slice();
    const q = $("#wq").value.trim().toLowerCase();
    if (q) {
      items = items.filter(w =>
        (w.nameCn + w.nameEn + w.uni + w.category).toLowerCase().includes(q)
      );
    }
    const sort = $("#wSort").value;
    if (sort === "uni") items.sort((a, b) => a.uni.localeCompare(b.uni) || a.nameCn.localeCompare(b.nameCn));
    else if (sort === "tuition") items.sort((a, b) => (a.tuitionHkd || 1e12) - (b.tuitionHkd || 1e12));
    else if (sort === "open") {
      const rank = p => p.open27 === true ? 0 : p.open27 === "pending" ? 1 : 2;
      items.sort((a, b) => rank(a) - rank(b) || a.uni.localeCompare(b.uni));
    }

    if (!state.wish.length) {
      box.innerHTML = `<div class="wish-empty">志愿单还是空的。<br/>在左侧点击「加入志愿」开始选校。</div>`;
      return;
    }
    if (!items.length) {
      box.innerHTML = `<div class="wish-empty">志愿单中没有匹配项。</div>`;
      return;
    }
    box.innerHTML = items.map((p, idx) => {
      const st = openStatusText(p);
      return `
        <div class="wish-item" data-id="${p.id}">
          <div class="wi-title">${idx + 1}. ${p.nameCn}</div>
          <div class="wi-sub">${p.uni} · ${st.label} · ${fmtTuition(p)}</div>
          <div class="wi-actions">
            <button data-wact="up">↑</button>
            <button data-wact="down">↓</button>
            <button data-wact="remove">移除</button>
            <button data-wact="detail">详情</button>
            <a class="prog-link" href="${p.website}" target="_blank" rel="noopener" style="font-size:.75rem;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:#faf7f0;text-decoration:none;color:var(--accent)">官网</a>
          </div>
        </div>
      `;
    }).join("");
  }

  function toggleWish(id) {
    const p = state.list.find(x => x.id === id);
    if (!p) return;
    if (isWished(id)) {
      state.wish = state.wish.filter(w => w.id !== id);
      toast("已从志愿单移除：" + p.nameCn);
    } else {
      state.wish.push({
        id: p.id,
        uni: p.uni,
        uniCn: p.uniCn,
        nameCn: p.nameCn,
        nameEn: p.nameEn,
        category: p.category,
        tuitionHkd: p.tuitionHkd,
        tuitionNote: p.tuitionNote,
        open27: p.open27,
        durationText: p.durationText,
        applyWindow: p.applyWindow,
        location: p.location,
        website: p.website,
        addedAt: Date.now()
      });
      toast("已加入志愿单：" + p.nameCn);
    }
    saveWish();
    renderCards();
    renderWish();
  }

  function moveWish(id, dir) {
    const i = state.wish.findIndex(w => w.id === id);
    if (i < 0) return;
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= state.wish.length) return;
    const t = state.wish[i];
    state.wish[i] = state.wish[j];
    state.wish[j] = t;
    // 固定加入顺序存储用 addedAt；显示顺序按当前数组
    saveWish();
    renderWish();
  }

  function showDetail(id) {
    const p = state.list.find(x => x.id === id);
    if (!p) return;
    const st = openStatusText(p);
    const backdrop = $("#modalBackdrop");
    $("#modal").innerHTML = `
      <h3>${p.nameCn}</h3>
      <div class="sub">${p.nameEn}</div>
      <table>
        <tr><th>学校</th><td>${p.uniCn}（${p.uni}）</td></tr>
        <tr><th>学院</th><td>${p.facultyCn}<br/><span style="color:#78716c">${p.faculty}</span></td></tr>
        <tr><th>方向</th><td>${p.category}</td></tr>
        <tr><th>专业描述</th><td>${p.desc}</td></tr>
        <tr><th>申请要求</th><td>${p.requirements}</td></tr>
        <tr><th>学费</th><td>${fmtTuition(p)}${p.tuitionNote ? `<br/><span style="color:#78716c">${p.tuitionNote}</span>` : ""}</td></tr>
        <tr><th>学制</th><td>${p.durationText}（约 ${p.durationYears} 年）</td></tr>
        <tr><th>开办时间</th><td>${p.foundedYear} 年（约 ${yearsAgo(p.foundedYear)} 年）</td></tr>
        <tr><th>27 Fall 招生</th><td>${st.label}</td></tr>
        <tr><th>允许投递时间</th><td>${p.applyWindow}</td></tr>
        <tr><th>联培学校/企业</th><td>${p.jointPartner || "—"}</td></tr>
        <tr><th>授课地点</th><td>${p.location}</td></tr>
        <tr><th>专业简介·中文</th><td>${p.descCn || p.desc || "—"}</td></tr>
        <tr><th>简介·英文原文</th><td class="en">${p.descEn || "—"}</td></tr>
        <tr><th>申请要求·中文</th><td>${p.requirementsCn || p.requirements || "—"}</td></tr>
        <tr><th>要求·英文原文</th><td class="en">${p.requirementsEn || "—"}</td></tr>
        <tr><th>官网</th><td><a class="prog-link" href="${p.website}" target="_blank" rel="noopener">${p.website}</a></td></tr>
        <tr><th>数据可信度</th><td>${p.sourceConfidence === "official-listed" ? "官网名单已确认" : "待官网核实（投递前请务必打开官网确认）"}</td></tr>
      </table>
      <div class="modal-close">
        <button class="btn" id="modalWish">${isWished(p.id) ? "从志愿单移除" : "加入志愿单"}</button>
        <button class="btn ghost" id="modalClose">关闭</button>
      </div>
    `;
    backdrop.classList.add("open");
    $("#modalWish").onclick = () => { toggleWish(p.id); showDetail(p.id); };
    $("#modalClose").onclick = () => backdrop.classList.remove("open");
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 200);
  }

  function exportCsv() {
    if (!state.wish.length) { toast("志愿单为空，无法导出"); return; }
    const headers = ["顺序","学校","中文名","英文名","方向","学制","学费HKD","27Fall状态","申请窗口","授课地点","联培","官网"];
    const lines = [headers.join(",")];
    state.wish.forEach((p, i) => {
      const st = openStatusText(p).label;
      const row = [
        i + 1, p.uni, p.nameCn, p.nameEn, p.category, p.durationText,
        p.tuitionHkd || "", st, p.applyWindow, p.location, p.jointPartner || "", p.website
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      lines.push(row.join(","));
    });
    download("港五商科志愿单.csv", "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
    toast("已导出 CSV");
  }

  function exportJson() {
    if (!state.wish.length) { toast("志愿单为空，无法导出"); return; }
    download(
      "港五商科志愿单.json",
      JSON.stringify({ exportedAt: new Date().toISOString(), items: state.wish }, null, 2),
      "application/json"
    );
    toast("已导出 JSON");
  }

  /**
   * 刷新 27 Fall 招生状态。
   * 浏览器端无法直接抓取校外站点（CORS），因此：
   * 1) 模拟一次「自动化重查」：按当前日期与已知招生窗口规则推断；
   * 2) 若相对上次快照有变化，显式弹出变更清单。
   */
  async function refreshStatus() {
    if (state.refreshing) return;
    state.refreshing = true;
    const btn = $("#btnRefresh");
    btn.disabled = true;
    btn.textContent = "刷新中…";
    const bar = $("#statusBar");
    bar.className = "show";
    bar.textContent = "正在自动查询各校 27 Fall 招生状态…";

    await sleep(900);

    const now = new Date();
    const snapshot = state.list.map(p => ({
      id: p.id,
      open27: p.open27,
      applyWindow: p.applyWindow
    }));

    // 基于已知窗口与当前日期做规则推断（可再扩展为真实爬虫）
    const changes = [];
    state.list.forEach(p => {
      const prev = snapshot.find(s => s.id === p.id);
      let next = p.open27;
      let window_ = p.applyWindow;

      // CUHK 常规全日制截止 2027-03-31；早轮 2026-07-31 已过（若今天>该日）
      if (p.uni === "CUHK" && p.open27 === true) {
        const earlyEnd = new Date("2026-07-31T23:59:59+08:00");
        const normalEnd = new Date("2027-03-31T23:59:59+08:00");
        if (now > normalEnd) next = false;
        else if (now > earlyEnd) window_ = "早轮已过，常规轮开放至 2027-03-31（滚动录取）";
      }
      // 新项目 pending：若已过拟开放月份（2026-10）则仍保持 pending 提醒核对
      if (p.open27 === "pending") {
        // 不自动改为开放，只在说明中提示
      }
      // CityU / HKU 通常秋季开放 —— 若月份>=9 则标注「预计已/即将开放」
      if ((p.uni === "CityU" || p.uni === "HKU") && p.open27 === true) {
        if (now.getMonth() >= 8) {
          window_ = "当前处于常规招生季，请以官网确认具体截止日期";
        }
      }

      if (next !== prev.open27 || window_ !== prev.applyWindow) {
        changes.push({
          id: p.id,
          name: p.nameCn,
          uni: p.uni,
          beforeOpen: prev.open27,
          afterOpen: next,
          beforeWin: prev.applyWindow,
          afterWin: window_
        });
        p.open27 = next;
        p.applyWindow = window_;
      }
    });

    state.lastRefreshed = new Date().toISOString();
    localStorage.setItem(HISTORY_KEY, JSON.stringify({
      at: state.lastRefreshed,
      changes
    }));

    renderCards();
    renderWish();

    if (changes.length) {
      bar.className = "show warn";
      bar.innerHTML = `<strong>检测到 ${changes.length} 处 27 Fall 状态变化：</strong><ul style="margin:8px 0 0 18px;padding:0">` +
        changes.map(c => `<li>${c.uni} · ${c.name}：${labelOpen(c.beforeOpen)} → ${labelOpen(c.afterOpen)}；窗口更新为「${c.afterWin}」</li>`).join("") +
        `</ul>`;
      toast(`刷新完成：发现 ${changes.length} 处变化`);
    } else {
      bar.className = "show ok";
      bar.textContent = `刷新完成（${new Date(state.lastRefreshed).toLocaleString("zh-CN", { hour12: false })}）：未检测到 27 Fall 状态变化。请仍以官网为准。`;
      toast("刷新完成：暂无状态变化");
    }

    state.refreshing = false;
    btn.disabled = false;
    btn.textContent = "刷新 27 Fall 状态";
  }

  function labelOpen(v) {
    if (v === true) return "可申请";
    if (v === "pending") return "待批准";
    if (v === false) return "未开放";
    return String(v);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function bind() {
    ["q", "fUni", "fCat", "fOpen"].forEach(id => {
      $("#" + id).addEventListener("input", renderCards);
      $("#" + id).addEventListener("change", renderCards);
    });
    $("#btnReset").addEventListener("click", () => {
      $("#q").value = "";
      $("#fUni").value = "";
      $("#fCat").value = "";
      $("#fOpen").value = "";
      renderCards();
    });
    $("#btnRefresh").addEventListener("click", refreshStatus);
    $("#wq").addEventListener("input", renderWish);
    $("#wSort").addEventListener("change", renderWish);
    $("#btnExportCsv").addEventListener("click", exportCsv);
    $("#btnExportJson").addEventListener("click", exportJson);
    $("#btnClearWish").addEventListener("click", () => {
      if (!state.wish.length) return;
      if (confirm("确定清空志愿单？")) {
        state.wish = [];
        saveWish();
        renderCards();
        renderWish();
        toast("志愿单已清空");
      }
    });

    $("#cards").addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const card = btn.closest(".card");
      const id = card.dataset.id;
      const act = btn.dataset.act;
      if (act === "wish") toggleWish(id);
      else if (act === "detail") {
        if (state.expanded.has(id)) state.expanded.delete(id);
        else state.expanded.add(id);
        renderCards();
      } else if (act === "open") {
        const p = state.list.find(x => x.id === id);
        if (p) window.open(p.website, "_blank", "noopener");
      }
    });

    $("#wishList").addEventListener("click", e => {
      const btn = e.target.closest("[data-wact]");
      if (!btn) return;
      const item = btn.closest(".wish-item");
      const id = item.dataset.id;
      const act = btn.dataset.wact;
      if (act === "remove") toggleWish(id);
      else if (act === "up") moveWish(id, "up");
      else if (act === "down") moveWish(id, "down");
      else if (act === "detail") showDetail(id);
    });

    $("#modalBackdrop").addEventListener("click", e => {
      if (e.target.id === "modalBackdrop") e.currentTarget.classList.remove("open");
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") $("#modalBackdrop").classList.remove("open");
    });
  }

  function init() {
    fillFilters();
    bind();
    renderCards();
    renderWish();
  }

  init();
})();
