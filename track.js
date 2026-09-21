/* 硕士申请状态跟进表 + 视图切换 + 在线保存状态条
 * 数据存取全部经 store.js（Qoder 站点走云端，静态站点走本机 + 导出导入）
 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const STATUS_LABEL = {
    not_started: "未开始", preparing: "准备材料", submitted: "已提交", interview: "面试中",
    offer: "已获 Offer", accepted: "已接受", rejected: "已拒", withdrawn: "已放弃"
  };
  const STATUS_ORDER = ["not_started", "preparing", "submitted", "interview", "offer", "accepted", "rejected", "withdrawn"];
  const PRIORITY_LABEL = { "": "未定", reach: "冲", match: "稳", safe: "保" };
  const MATERIAL_LABEL = {
    transcript: "成绩单", degree: "学位/在读", language: "语言成绩",
    reference: "推荐信", ps: "个人陈述", cv: "简历", other: "其他"
  };
  // 已提交之后的状态不再需要赶截止日期
  const DONE_STATUSES = new Set(["submitted", "interview", "offer", "rejected", "withdrawn", "accepted"]);
  const WARN_DAYS = 14;
  // 示例数据标记：刷新后仍要能看出当前是示例而不是真实记录
  const SEED_FLAG = "hk5_seed_v1";
  const isSeeded = () => { try { return localStorage.getItem(SEED_FLAG) === "1"; } catch { return false; } };
  const setSeeded = on => { try { on ? localStorage.setItem(SEED_FLAG, "1") : localStorage.removeItem(SEED_FLAG); } catch { /* 忽略 */ } };

  let view = "browse";

  const store = () => window.HK5Store;
  const app = () => window.HK5App;
  const T = k => (store().STATUSES || []).includes(k) ? k : "not_started";
  const MKEYS = () => store().MATERIALS || [];

  function deadlineInfo(track) {
    const d = track && track.deadline;
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const t = new Date(d + "T23:59:59");
    if (Number.isNaN(t.getTime())) return null;
    const days = Math.ceil((t.getTime() - Date.now()) / 86400000);
    const done = DONE_STATUSES.has(track.status);
    if (days < 0) return { days, tone: done ? "muted" : "bad", text: done ? `已于 ${d} 截止` : `已过期 ${-days} 天` };
    if (done) return { days, tone: "muted", text: `${d} 截止` };
    if (days <= WARN_DAYS) return { days, tone: "warn", text: `剩 ${days} 天（${d} 截止）` };
    return { days, tone: "ok", text: `${d} 截止（剩 ${days} 天）` };
  }

  /* ---------- 跟进表 ---------- */

  function trackRowHtml(r) {
    const p = r.prog;
    const t = r.track || (store().getTrack(r.id) || {});
    const info = deadlineInfo(t);
    const cls = ["st-" + T(t.status)];
    if (info && info.tone === "warn") cls.push("due-soon");
    if (info && info.tone === "bad") cls.push("due-past");
    const opts = (map, cur) => Object.keys(map).map(k => `<option value="${app().esc(k)}"${(cur || "") === k ? " selected" : ""}>${app().esc(map[k])}</option>`).join("");
    const mats = t.materials || {};
    return `<tr class="${cls.join(" ")}" data-row="${app().esc(r.id)}">
      <td class="c-prog" data-label="项目">
        <div class="pname">${p ? app().esc(p.nameCn) : "（该项目已不在库中）"}</div>
        <div class="psub">${app().esc(p ? p.uni : "—")} · ${app().esc(p ? p.nameEn : r.id)}</div>
        ${info ? `<div class="flag tone-${info.tone}">${app().esc(info.text)}</div>` : ""}
        ${r.inWish ? "" : `<div class="flag tone-muted">已不在志愿单，仅保留跟进记录</div>`}
      </td>
      <td class="c-rank" data-label="名次"><input type="number" data-act="rank" data-id="${app().esc(r.id)}" value="${t.rank == null ? "" : app().esc(t.rank)}" min="1" max="999" step="1" inputmode="numeric" placeholder="—" aria-label="名次"/></td>
      <td class="c-prio" data-label="优先级"><select data-act="priority" data-id="${app().esc(r.id)}" aria-label="优先级">${opts(PRIORITY_LABEL, t.priority)}</select></td>
      <td class="c-status" data-label="申请状态"><select data-act="status" data-id="${app().esc(r.id)}" aria-label="申请状态">${opts(STATUS_LABEL, t.status)}</select></td>
      <td class="c-date" data-label="截止日期"><label class="dlab"><span>截止</span><input type="date" data-act="deadline" data-id="${app().esc(r.id)}" value="${app().esc(t.deadline || "")}" aria-label="截止日期"/></label></td>
      <td class="c-date" data-label="提交日期"><label class="dlab"><span>提交</span><input type="date" data-act="submittedAt" data-id="${app().esc(r.id)}" value="${app().esc(t.submittedAt || "")}" aria-label="提交日期"/></label></td>
      <td class="c-date" data-label="面试日期"><label class="dlab"><span>面试</span><input type="date" data-act="interviewAt" data-id="${app().esc(r.id)}" value="${app().esc(t.interviewAt || "")}" aria-label="面试日期"/></label></td>
      <td class="c-date" data-label="出结果"><label class="dlab"><span>出结果</span><input type="date" data-act="resultAt" data-id="${app().esc(r.id)}" value="${app().esc(t.resultAt || "")}" aria-label="出结果日期"/></label></td>
      <td class="c-mat" data-label="材料清单">${MKEYS().map(m => `<label class="mat"><input type="checkbox" data-act="mat" data-id="${app().esc(r.id)}" data-mat="${app().esc(m)}"${mats[m] ? " checked" : ""}/> ${app().esc(MATERIAL_LABEL[m] || m)}</label>`).join("")}</td>
      <td class="c-note" data-label="备注"><textarea data-act="note" data-id="${app().esc(r.id)}" rows="2" placeholder="面试形式、材料缺口、offer 条件…">${app().esc(t.note || "")}</textarea></td>
      <td class="c-act" data-label="">
        ${r.inWish ? `<button type="button" class="btn ghost sm" data-act="unwish" data-id="${app().esc(r.id)}">移出志愿</button>` : ""}
        <button type="button" class="btn ghost sm" data-act="clear" data-id="${app().esc(r.id)}">清空跟进</button>
      </td>
    </tr>`;
  }

  function rows() {
    const a = app(), s = store();
    const wish = a.getWish();
    const byId = new Map(a.programmes.map(p => [p.id, p]));
    const seen = new Set(wish.map(w => w.id));
    const out = wish.map((w, i) => ({ id: w.id, order: i, inWish: true, prog: byId.get(w.id), track: s.getTrack(w.id) }));
    for (const id of Object.keys(s.tracks)) {
      if (seen.has(id)) continue;
      out.push({ id, order: out.length, inWish: false, prog: byId.get(id), track: s.getTrack(id) });
    }
    return out;
  }

  function renderTrack() {
    if (!window.HK5Store || !app()) return;
    let list = rows();
    const f = $("#tFilter").value, s = $("#tSort").value;
    if (f) list = list.filter(r => ((r.track || {}).status || "not_started") === f);
    if (s === "rank") {
      // 名次小的在前，未填名次的排最后；同名次保持志愿单顺序
      list.sort((a, b) => {
        const ra = (a.track || {}).rank;
        const rb = (b.track || {}).rank;
        const na = Number.isSafeInteger(ra) ? ra : Infinity;
        const nb = Number.isSafeInteger(rb) ? rb : Infinity;
        return na - nb || a.order - b.order;
      });
    } else if (s === "priority") {
      // 冲 → 稳 → 保，未标优先级的排最后；同级内保持志愿单顺序
      const pRank = { reach: 0, match: 1, safe: 2 };
      list.sort((a, b) => {
        const pa = pRank[(a.track || {}).priority] ?? 3;
        const pb = pRank[(b.track || {}).priority] ?? 3;
        return pa - pb || a.order - b.order;
      });
    } else if (s === "deadline") {
      // 比较器必须对相等返回 0，否则排序结果不稳定
      list.sort((a, b) => {
        const da = (a.track || {}).deadline || "9999-12-31";
        const db = (b.track || {}).deadline || "9999-12-31";
        return da < db ? -1 : da > db ? 1 : a.order - b.order;
      });
    } else if (s === "status") {
      const rank = { preparing: 0, not_started: 1, submitted: 2, interview: 3, offer: 4, accepted: 5, rejected: 6, withdrawn: 7 };
      list.sort((a, b) => (rank[(a.track || {}).status] ?? 9) - (rank[(b.track || {}).status] ?? 9) || a.order - b.order);
    } else {
      list.sort((a, b) => a.order - b.order);
    }

    const all = rows(), counts = {};
    for (const k of STATUS_ORDER) counts[k] = 0;
    let soon = 0, past = 0;
    for (const r of all) {
      counts[((r.track || {}).status) || "not_started"]++;
      const d = deadlineInfo(r.track);
      if (d && d.tone === "warn") soon++;
      if (d && d.tone === "bad") past++;
    }
    $("#trackSummary").innerHTML = `<span class="pill">跟进中 <strong>${all.length}</strong></span>`
      + STATUS_ORDER.filter(k => counts[k]).map(k => `<span class="pill">${app().esc(STATUS_LABEL[k])} <strong>${counts[k]}</strong></span>`).join("")
      + (past ? `<span class="pill tone-bad">已过期未提交 <strong>${past}</strong></span>` : "")
      + (soon ? `<span class="pill tone-warn">${WARN_DAYS} 天内截止 <strong>${soon}</strong></span>` : "");
    $("#trackBody").innerHTML = list.length
      ? list.map(trackRowHtml).join("")
      : `<tr><td colspan="11" class="tempty">${f ? `没有符合「${app().esc(STATUS_LABEL[f] || f)}」的项目。` : "跟进表还是空的。先在「浏览选校」里把项目加入志愿单，它们会自动出现在这里；也可以点右上角「载入示例数据」看效果。"}</td></tr>`;
    app().renderTabCount();
  }

  /* ---------- 视图切换 ---------- */

  function setView(v) {
    view = v;
    $$("[data-view]").forEach(b => {
      const on = b.dataset.view === v;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $("#viewBrowse").hidden = v !== "browse";
    $("#viewTrack").hidden = v !== "track";
    if (v === "track") renderTrack();
    else app().renderTabCount();
    try { localStorage.setItem("hk5_view_v2", v); } catch { /* 忽略 */ }
  }

  // app.js 通过这两个钩子知道当前视图并回调重绘
  window.HK5IsTrackView = () => view === "track";
  window.HK5RefreshTrack = () => renderTrack();

  /* ---------- 在线保存状态条 ---------- */

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
      b.className = "btn " + cls;
      b.textContent = label;
      b.onclick = fn;
      acts.append(b);
    };
    if (st.mode === "cloud" && st.user) {
      if (st.sync === "conflict" || st.sync === "unknown" || st.sync === "error") {
        mk("重新读取云端", "ghost", async () => {
          const r = await store().reloadFromCloud();
          if (r.ok) { renderTrack(); app().toast("已与云端对账"); }
        });
      }
      mk("立即保存", "ghost", async () => { await store().saveNow(); renderTrack(); });
    }
    mk("导出备份", "ghost", () => store().exportAll());
    const imp = document.createElement("label");
    imp.className = "btn ghost import-label";
    imp.textContent = "导入备份";
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "application/json,.json";
    file.onchange = async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const text = await f.text();
      const r = store().importAll(text);
      if (r.ok) { renderTrack(); app().toast(`已导入：志愿 ${r.wish} 条、跟进 ${r.tracks} 条`); }
      else app().toast("导入失败：" + r.error);
      file.value = "";
    };
    imp.append(file);
    acts.append(imp);
  }

  /* ---------- 导出 ---------- */

  function exportTrackCsv() {
    const list = rows();
    if (!list.length) return app().toast("跟进表为空，无法导出");
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["名次", "顺序", "学校", "中文名", "英文名", "方向", "优先级", "申请状态",
      "截止日期", "提交日期", "面试日期", "出结果日期",
      ...MKEYS().map(m => "材料·" + (MATERIAL_LABEL[m] || m)), "备注", "官网"];
    const lines = [header.map(q).join(",")];
    list.forEach((r, i) => {
      const p = r.prog, t = r.track || {}, mats = t.materials || {};
      lines.push([Number.isSafeInteger(t.rank) ? t.rank : "", i + 1, p ? p.uni : "—", p ? p.nameCn : "（已不在库中）", p ? p.nameEn : r.id,
        p ? p.category : "—", PRIORITY_LABEL[t.priority || ""] || "", STATUS_LABEL[t.status || "not_started"] || "",
        t.deadline || "", t.submittedAt || "", t.interviewAt || "", t.resultAt || "",
        ...MKEYS().map(m => (mats[m] ? "已备" : "")), t.note || "", p ? p.website : ""].map(q).join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `申请跟进表-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    app().toast("已导出跟进表 CSV");
  }

  /* ---------- 事件 ---------- */

  function bind() {
    $$("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

    $("#trackBody").addEventListener("change", e => {
      const el = e.target, act = el.dataset && el.dataset.act;
      if (!act) return;
      const id = el.dataset.id;
      if (act === "mat") {
        const cur = store().getTrack(id) || {};
        const mats = Object.assign({}, cur.materials || {});
        mats[el.dataset.mat] = el.checked;
        store().setTrack(id, { materials: mats });
        renderTrack();
        return;
      }
      // 名次是数字输入：必须转成整数再存，否则会被 sanitizeTrack 当成非法值丢弃
      if (act === "rank") {
        const n = parseInt(el.value, 10);
        store().setTrack(id, { rank: Number.isFinite(n) && n >= 1 && n <= 999 ? n : null });
        renderTrack();
        return;
      }
      store().setTrack(id, { [act]: el.value });
      renderTrack();
    });

    let noteTimer;
    $("#trackBody").addEventListener("input", e => {
      const el = e.target;
      if (!el.dataset || el.dataset.act !== "note") return;
      const id = el.dataset.id, v = el.value;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { store().setTrack(id, { note: v }); }, 600);
    });

    $("#trackBody").addEventListener("click", e => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.act === "unwish") {
        app().replaceWish(app().getWish().filter(w => w.id !== id), false);
        renderTrack();
        app().toast("已移出志愿单，跟进记录保留");
      } else if (btn.dataset.act === "clear") {
        store().removeTrack(id);
        renderTrack();
        app().toast("已清空该项目的跟进记录");
      }
    });

    $("#tFilter").addEventListener("change", renderTrack);
    $("#tSort").addEventListener("change", renderTrack);
    $("#tExportCsv").addEventListener("click", exportTrackCsv);

    $("#tSeed").addEventListener("click", () => {
      const seed = [
        { id: "hku-mfin", rank: 2, status: "submitted", priority: "reach", dl: 9, sub: -3, note: "已提交，等面试邀请", all: 1 },
        { id: "cuhk-mscfin", rank: 1, status: "interview", priority: "match", dl: 4, iv: 6, note: "面试形式待确认", all: 1 },
        { id: "hkust-msac", rank: 4, status: "preparing", priority: "match", dl: -2, note: "截止日期已过，确认是否还能补交", some: 1 },
        { id: "cityudg-msc-data-science", rank: 3, status: "offer", priority: "safe", dl: -20, sub: -40, res: -5, note: "有条件录取，需补最终成绩单", all: 1 },
        { id: "xjtlu-finance", rank: 6, status: "not_started", priority: "reach", dl: 25 },
        { id: "nus-msc-business-analytics", rank: 5, status: "rejected", priority: "safe", dl: -30, sub: -50, res: -8, all: 1 }
      ].filter(x => app().byId(x.id));
      if (!seed.length) return app().toast("示例项目不在当前库中");
      const d = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      const wish = seed.map((x, i) => ({ id: x.id, addedAt: Date.now() - (seed.length - i) * 60000 }));
      app().replaceWish(wish, false);
      for (const x of seed) {
        const mats = {};
        for (const m of MKEYS()) mats[m] = !!(x.all || (x.some && (m === "transcript" || m === "language")));
        store().setTrack(x.id, {
          status: x.status, priority: x.priority, rank: x.rank,
          deadline: x.dl !== undefined ? d(x.dl) : "",
          submittedAt: x.sub !== undefined ? d(x.sub) : "",
          interviewAt: x.iv !== undefined ? d(x.iv) : "",
          resultAt: x.res !== undefined ? d(x.res) : "",
          note: x.note || "", materials: mats
        });
      }
      setSeeded(true);
      $("#seedNote").hidden = false;
      renderTrack();
      app().toast(`已载入 ${seed.length} 条示例数据（非真实申请记录）`);
    });

    $("#tClearAll").addEventListener("click", () => {
      const n = rows().length;
      if (!n) return app().toast("已经是空的");
      if (!confirm(`清空志愿单与全部 ${n} 条跟进记录？此操作不可撤销，建议先用「导出备份」留存。`)) return;
      store().clearAllTracks();
      app().replaceWish([], false);
      setSeeded(false);
      $("#seedNote").hidden = true;
      renderTrack();
      app().toast("已清空");
    });
  }

  /* ---------- 启动 ---------- */

  function start() {
    if (!window.HK5Store || !window.HK5App) return;
    bind();
    store().onStatus(renderSyncBar);
    store().onTracks(() => { app().renderTabCount(); if (view === "track") renderTrack(); });
    app().onWishChange(() => {
      // 志愿单变更同样要标记为待同步，否则云端收不到纯志愿单的改动
      store().markDirty();
      if (view === "track") renderTrack(); else app().renderTabCount();
    });
    let v = "browse";
    try { v = localStorage.getItem("hk5_view_v2") || "browse"; } catch { /* 忽略 */ }
    $('#seedNote').hidden = !isSeeded();
    setView(v === "track" ? "track" : "browse");
    // 探测后端并与云端对账；失败时 store 内部已降级为本机保存并给出提示
    store().init().catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
