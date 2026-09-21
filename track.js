/* 硕士申请状态跟进表
 *
 * 以志愿单为行来源：加入志愿的项目自动出现在跟进表里。
 * 数据经 store.js 持久化（Qoder 站点走云端，静态站点走本机 + 导入导出）。
 */
(function () {
  const STATUS_LABEL = {
    not_started: "未开始",
    preparing: "准备材料",
    submitted: "已提交",
    interview: "面试中",
    offer: "已获 Offer",
    rejected: "已拒",
    withdrawn: "已放弃",
    accepted: "已接受"
  };
  // 已提交之后的状态不再需要赶截止日期
  const DONE_STATUSES = new Set(["submitted", "interview", "offer", "rejected", "withdrawn", "accepted"]);
  const PRIORITY_LABEL = { "": "未定", reach: "冲", match: "稳", safe: "保" };
  const MATERIAL_LABEL = {
    transcript: "成绩单", degree: "学位/在读", language: "语言成绩",
    reference: "推荐信", ps: "个人陈述", cv: "简历", other: "其他"
  };
  const WARN_DAYS = 14;

  let view = "browse";        // browse | track
  let filterStatus = "";
  let sortMode = "wish";      // wish | deadline | status

  const $ = s => document.querySelector(s);
  const app = () => window.HK5App;
  const store = () => window.HK5Store;

  function esc(v) {
    if (v === undefined || v === null || v === "") return "";
    return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- 截止日期计算 ---------- */

  function deadlineInfo(track) {
    const d = track && track.deadline;
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const target = new Date(d + "T23:59:59");
    if (Number.isNaN(target.getTime())) return null;
    const days = Math.ceil((target.getTime() - Date.now()) / 86400000);
    const done = DONE_STATUSES.has(track.status);
    if (days < 0) return { days, cls: done ? "past-done" : "past", text: done ? `已于 ${d} 截止` : `已过期 ${-days} 天` };
    if (done) return { days, cls: "ok", text: `${d} 截止（已提交）` };
    if (days <= WARN_DAYS) return { days, cls: "soon", text: `剩 ${days} 天（${d} 截止）` };
    return { days, cls: "ok", text: `${d} 截止（剩 ${days} 天）` };
  }

  /* ---------- 行来源：志愿单 + 有跟进记录但已移出志愿单的项目 ---------- */

  function rows() {
    const a = app();
    const s = store();
    if (!a || !s) return [];
    const wish = a.getWish();
    const seen = new Set(wish.map(w => w.id));
    const out = wish.map((w, i) => ({ id: w.id, order: i, inWish: true, prog: a.byId(w.id), track: s.getTrack(w.id) }));
    for (const id of Object.keys(s.tracks)) {
      if (seen.has(id)) continue;
      out.push({ id, order: out.length, inWish: false, prog: a.byId(id), track: s.getTrack(id) });
    }
    const list = out.filter(r => !filterStatus || (r.track ? r.track.status : "not_started") === filterStatus);
    if (sortMode === "deadline") {
      list.sort((x, y) => {
        const dx = x.track && x.track.deadline ? x.track.deadline : "9999-12-31";
        const dy = y.track && y.track.deadline ? y.track.deadline : "9999-12-31";
        return dx < dy ? -1 : dx > dy ? 1 : x.order - y.order;
      });
    } else if (sortMode === "status") {
      const rank = { preparing: 0, not_started: 1, submitted: 2, interview: 3, offer: 4, accepted: 5, rejected: 6, withdrawn: 7 };
      list.sort((x, y) => {
        const rx = rank[x.track ? x.track.status : "not_started"] ?? 9;
        const ry = rank[y.track ? y.track.status : "not_started"] ?? 9;
        return rx - ry || x.order - y.order;
      });
    } else {
      list.sort((x, y) => x.order - y.order);
    }
    return list;
  }

  /* ---------- 汇总 ---------- */

  function summary() {
    const list = rows();
    const counts = {};
    for (const k of Object.keys(STATUS_LABEL)) counts[k] = 0;
    let soon = 0, overdue = 0;
    for (const r of list) {
      const st = r.track ? r.track.status : "not_started";
      counts[st] = (counts[st] || 0) + 1;
      const info = deadlineInfo(r.track);
      if (info && info.cls === "soon") soon++;
      if (info && info.cls === "past") overdue++;
    }
    return { total: list.length, counts, soon, overdue };
  }

  /* ---------- 渲染 ---------- */

  function renderSummary() {
    const host = $("#trackSummary");
    if (!host) return;
    const s = summary();
    const chips = Object.keys(STATUS_LABEL)
      .filter(k => s.counts[k] > 0)
      .map(k => `<span class="tchip t-${esc(k)}">${esc(STATUS_LABEL[k])} <strong>${s.counts[k]}</strong></span>`)
      .join("");
    const alerts = [];
    if (s.overdue) alerts.push(`<span class="tchip t-rejected">已过期未提交 <strong>${s.overdue}</strong></span>`);
    if (s.soon) alerts.push(`<span class="tchip t-soon">${WARN_DAYS} 天内截止 <strong>${s.soon}</strong></span>`);
    host.innerHTML = `<span class="tchip">跟进中 <strong>${s.total}</strong></span>${chips}${alerts.join("")}`;
  }

  function renderTable() {
    const host = $("#trackBody");
    if (!host) return;
    const list = rows();
    if (!list.length) {
      host.innerHTML = `<tr><td colspan="10" class="track-empty">` +
        (filterStatus
          ? `没有符合「${esc(STATUS_LABEL[filterStatus] || filterStatus)}」的项目。`
          : `跟进表还是空的。先在「浏览选校」里把项目加入志愿单，它们会自动出现在这里。`) +
        `</td></tr>`;
      return;
    }
    host.innerHTML = list.map(r => rowHtml(r)).join("");
  }

  function rowHtml(r) {
    const p = r.prog;
    const t = r.track || { status: "not_started", priority: "", deadline: "", submittedAt: "", interviewAt: "", resultAt: "", note: "", materials: {} };
    const info = deadlineInfo(r.track);
    const name = p ? esc(p.nameCn) : "（该项目已不在库中）";
    const en = p ? esc(p.nameEn) : esc(r.id);
    const uni = p ? esc(p.uni) : "—";
    const link = p && /^https?:\/\//i.test(String(p.website || ""))
      ? `<a class="prog-link" href="${esc(p.website)}" target="_blank" rel="noopener noreferrer">${name}</a>`
      : `<span>${name}</span>`;

    const statusOpts = Object.keys(STATUS_LABEL)
      .map(k => `<option value="${esc(k)}"${t.status === k ? " selected" : ""}>${esc(STATUS_LABEL[k])}</option>`)
      .join("");
    const prioOpts = Object.keys(PRIORITY_LABEL)
      .map(k => `<option value="${esc(k)}"${(t.priority || "") === k ? " selected" : ""}>${esc(PRIORITY_LABEL[k])}</option>`)
      .join("");
    const mats = store().MATERIALS.map(m =>
      `<label class="mat"><input type="checkbox" data-act="mat" data-id="${esc(r.id)}" data-mat="${esc(m)}"${t.materials && t.materials[m] ? " checked" : ""}/>${esc(MATERIAL_LABEL[m] || m)}</label>`
    ).join("");

    const rowCls = ["track-row", `st-${esc(t.status || "not_started")}`];
    if (info && info.cls === "past") rowCls.push("row-overdue");
    else if (info && info.cls === "soon") rowCls.push("row-soon");
    if (!r.inWish) rowCls.push("row-orphan");

    return `<tr class="${rowCls.join(" ")}" data-row="${esc(r.id)}">
      <td class="c-prog">
        <div class="tp-name">${link}</div>
        <div class="tp-sub">${esc(uni)} · ${en}</div>
        ${info ? `<div class="tp-flag ${esc(info.cls)}">${esc(info.text)}</div>` : ""}
        ${r.inWish ? "" : `<div class="tp-flag orphan">已不在志愿单，仅保留跟进记录</div>`}
      </td>
      <td class="c-prio"><select data-act="priority" data-id="${esc(r.id)}">${prioOpts}</select></td>
      <td class="c-status"><select data-act="status" data-id="${esc(r.id)}" class="sel-${esc(t.status)}">${statusOpts}</select></td>
      <td class="c-date"><label>截止<input type="date" data-act="deadline" data-id="${esc(r.id)}" value="${esc(t.deadline || "")}"/></label></td>
      <td class="c-date"><label>提交<input type="date" data-act="submittedAt" data-id="${esc(r.id)}" value="${esc(t.submittedAt || "")}"/></label></td>
      <td class="c-date"><label>面试<input type="date" data-act="interviewAt" data-id="${esc(r.id)}" value="${esc(t.interviewAt || "")}"/></label></td>
      <td class="c-date"><label>出结果<input type="date" data-act="resultAt" data-id="${esc(r.id)}" value="${esc(t.resultAt || "")}"/></label></td>
      <td class="c-mat">${mats}</td>
      <td class="c-note"><textarea data-act="note" data-id="${esc(r.id)}" rows="2" placeholder="面试形式、材料缺口、offer 条件…">${esc(t.note || "")}</textarea></td>
      <td class="c-act">
        ${r.inWish ? `<button class="btn ghost sm" data-act="unwish" data-id="${esc(r.id)}">移出志愿</button>` : ""}
        <button class="btn ghost sm" data-act="clear" data-id="${esc(r.id)}">清空跟进</button>
      </td>
    </tr>`;
  }

  function render() {
    renderSummary();
    renderTable();
    renderTabCount();
  }

  function renderTabCount() {
    const el = $("#trackCount");
    if (!el) return;
    const a = app();
    const s = store();
    if (!a || !s) return;
    const n = new Set([...a.getWish().map(w => w.id), ...Object.keys(s.tracks)]).size;
    el.textContent = n ? String(n) : "";
  }

  /* ---------- 事件 ---------- */

  function bind() {
    const body = $("#trackBody");
    if (!body) return;

    body.addEventListener("change", e => {
      const el = e.target;
      const act = el.dataset && el.dataset.act;
      if (!act) return;
      const id = el.dataset.id;
      if (act === "mat") {
        const cur = store().getTrack(id) || {};
        const mats = { ...(cur.materials || {}) };
        mats[el.dataset.mat] = el.checked;
        store().setTrack(id, { materials: mats });
        return;
      }
      if (act === "status" || act === "priority" || act === "deadline" || act === "submittedAt" || act === "interviewAt" || act === "resultAt") {
        store().setTrack(id, { [act]: el.value });
        render();
      }
    });

    // 备注按输入防抖保存，避免每敲一个字就写一次
    let noteTimer = null;
    body.addEventListener("input", e => {
      const el = e.target;
      if (!el.dataset || el.dataset.act !== "note") return;
      const id = el.dataset.id;
      const value = el.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        store().setTrack(id, { note: value });
        renderSummary();
      }, 600);
    });

    body.addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      if (act === "unwish") {
        const next = app().getWish().filter(w => w.id !== id);
        app().replaceWish(next, false);
        store().markDirty();
        render();
        app().toast("已移出志愿单，跟进记录保留");
      } else if (act === "clear") {
        store().removeTrack(id);
        render();
        app().toast("已清空该项目的跟进记录");
      }
    });

    $("#tFilter").addEventListener("change", e => { filterStatus = e.target.value; render(); });
    $("#tSort").addEventListener("change", e => { sortMode = e.target.value; render(); });
    $("#tExportCsv").addEventListener("click", exportCsv);

    // 视图切换
    document.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
  }

  function switchView(next) {
    view = next;
    document.querySelectorAll("[data-view]").forEach(b => {
      const on = b.dataset.view === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("#viewBrowse").hidden = view !== "browse";
    $("#viewTrack").hidden = view !== "track";
    if (view === "track") render();
    else renderTabCount();
    try { localStorage.setItem("hk5_view_v1", view); } catch { /* 忽略 */ }
  }

  /* ---------- 导出 ---------- */

  function exportCsv() {
    const list = rows();
    if (!list.length) { app().toast("跟进表为空，无法导出"); return; }
    const headers = ["顺序", "学校", "中文名", "英文名", "方向", "优先级", "申请状态",
      "截止日期", "提交日期", "面试日期", "出结果日期",
      ...Object.keys(MATERIAL_LABEL).map(m => "材料·" + MATERIAL_LABEL[m]),
      "备注", "学费(官网原文)", "27Fall状态", "官网"];
    const lines = [headers.join(",")];
    list.forEach((r, i) => {
      const p = r.prog;
      const t = r.track || {};
      const mats = t.materials || {};
      const row = [
        i + 1, p ? p.uni : "—", p ? p.nameCn : "（已不在库中）", p ? p.nameEn : r.id,
        p ? p.category : "—", PRIORITY_LABEL[t.priority || ""] || "", STATUS_LABEL[t.status || "not_started"] || "",
        t.deadline || "", t.submittedAt || "", t.interviewAt || "", t.resultAt || "",
        ...Object.keys(MATERIAL_LABEL).map(m => (mats[m] ? "已备" : "")),
        t.note || "",
        p ? tuitionText(p) : "", p ? openText(p) : "", p ? p.website : ""
      ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`);
      lines.push(row.join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `申请跟进表-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    app().toast("已导出跟进表 CSV");
  }

  function tuitionText(p) {
    if (typeof p.tuitionRmbPerYear === "number") return `¥${p.tuitionRmbPerYear}/学年 ≈ ¥${p.tuitionRmb}（估算）`;
    if (typeof p.tuitionRmb === "number") return "¥" + p.tuitionRmb;
    const parts = [];
    if (typeof p.tuitionHkd === "number") parts.push("HK$" + p.tuitionHkd);
    if (typeof p.tuitionSgd === "number") parts.push("S$" + p.tuitionSgd);
    return parts.length ? parts.join(" / ") : (p.tuitionNote || "以官网为准");
  }

  function openText(p) {
    return p.open27 === true ? "可申请" : p.open27 === "pending" ? "待批准/待开放" : "未开放";
  }

  /* ---------- 同步状态条 ---------- */

  function renderSyncBar(st) {
    const bar = $("#syncBar");
    if (!bar) return;
    bar.className = "syncbar show sync-" + st.sync;
    const text = $("#syncText");
    if (text) text.textContent = st.message || "";
    const acts = $("#syncActions");
    if (!acts) return;
    acts.textContent = "";

    const mk = (label, cls, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn sm " + cls;
      b.textContent = label;
      b.onclick = fn;
      acts.append(b);
    };

    if (st.mode === "cloud" && st.user) {
      if (st.sync === "conflict" || st.sync === "unknown" || st.sync === "error") {
        mk("重新读取云端", "ghost", async () => {
          const r = await store().reloadFromCloud();
          if (r.ok) { render(); app().toast("已与云端对账"); }
        });
      }
      mk("立即保存", "ghost", async () => { await store().saveNow(); render(); });
    }
    mk("导出备份", "ghost", () => store().exportAll());
    const imp = document.createElement("label");
    imp.className = "btn sm ghost import-label";
    imp.textContent = "导入备份";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "application/json,.json";
    file.onchange = async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const text = await f.text();
      const r = store().importAll(text);
      if (r.ok) { render(); app().toast(`已导入：志愿 ${r.wish} 条、跟进 ${r.tracks} 条`); }
      else app().toast("导入失败：" + r.error);
      file.value = "";
    };
    imp.append(file);
    acts.append(imp);
  }

  /* ---------- 启动 ---------- */

  function start() {
    bind();
    store().onStatus(renderSyncBar);
    store().onTracks(() => { renderTabCount(); if (view === "track") render(); });
    app().onWishChange(() => {
      store().markDirty();
      renderTabCount();
      if (view === "track") render();
    });
    let saved = "browse";
    try { saved = localStorage.getItem("hk5_view_v1") || "browse"; } catch { /* 忽略 */ }
    switchView(saved === "track" ? "track" : "browse");
    // 探测后端并与云端对账；失败时 store 内部已降级为本机保存并给出提示
    store().init().catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
