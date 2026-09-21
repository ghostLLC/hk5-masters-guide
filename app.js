/* 港五 + 新二 商科授课硕士 · 交互逻辑 */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  const WISH_KEY = "hk5_wish_v2";
  const WISH_KEY_LEGACY = "hk5_wish_v1";
  const UNVERIFIED = "官网未提供，待核实";
  const HK5 = new Set(["HKU", "CUHK", "HKUST", "CityU", "PolyU"]);

  const state = {
    list: PROGRAMMES.slice(),
    wish: loadWish(),
    expanded: new Set()
  };

  // 志愿单变更订阅者（store.js 推云端、track.js 重绘跟进表）
  const wishListeners = [];

  /* ---------- 输出安全 ---------- */

  function esc(v) {
    if (v === undefined || v === null || v === "") return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 官网链接只接受 http(s)，其余降级为纯文本，避免 javascript: 等注入
  function progLink(p, cls, text) {
    const u = String(p.website || "").trim();
    if (!/^https?:\/\//i.test(u)) return `<span class="${cls}">${esc(text)}</span>`;
    return `<a class="${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
  }

  /* ---------- 字段回退（港五用 desc/requirements，新二用 descCn/descEn） ---------- */

  const descCnOf = p => p.descCn || p.desc || "";
  const descEnOf = p => p.descEn || p.desc || "";
  const reqCnOf = p => p.requirementsCn || p.requirements || "";
  const reqEnOf = p => p.requirementsEn || p.requirements || "";

  // 34 条港五/NUS 早期条目缺中英对照：有的只有单一 requirements（压缩改写、非官网逐字原文），
  // 有的 requirementsCn 是「未能获取」占位。reqCnOf/reqEnOf 的回退会把同一段英文填进中英两栏，
  // 若不标注就会让改写文本看起来像已核实的双语原文。
  const REQ_PLACEHOLDER = /未能获取|请点官网核实/;
  const reqOk = p => !!p.requirementsCn && !!p.requirementsEn
    && !REQ_PLACEHOLDER.test(p.requirementsCn) && !REQ_PLACEHOLDER.test(p.requirementsEn);

  const REQ_CN_FALLBACK = "（本条暂无中文要求，此处显示的是英文摘要）";
  const REQ_EN_FALLBACK = "（本条为早期采集的压缩摘要，非官网逐字原文，投递前务必点官网核对）";
  const DESC_EN_FALLBACK = "（本条暂无英文简介，此处显示的是中文简介）";

  const reqCnLabel = p => "申请要求 · 中文" + (reqOk(p) ? "" : REQ_CN_FALLBACK);
  const reqEnLabel = p => "Admission Requirements · English" + (reqOk(p) ? "（官网原文）" : REQ_EN_FALLBACK);
  const descEnLabel = p => "Programme Description · English" + (p.descEn ? "（官网原文）" : DESC_EN_FALLBACK);

  function orUnverified(v) {
    return v || UNVERIFIED;
  }

  const nf = n => n.toLocaleString("en-US");
  const cnySuffix = p => typeof p.tuitionCny === "number" ? ` ≈ ¥${nf(p.tuitionCny)}` : "";

  // 官网原币值优先展示，人民币是按 DATA_META.fx 当日汇率换算的参考值，附在旁边
  function fmtTuition(p) {
    if (typeof p.tuitionPerCredit === "number" && typeof p.tuitionCredits === "number") {
      return `HK$${nf(p.tuitionPerCredit)}/学分 × ${p.tuitionCredits} 学分 ≈ HK$${nf(p.tuitionHkd)}${cnySuffix(p)}（总额估算）`;
    }
    // 官网按学年计费：保留学年单价原值，总额按官网学制估算并标注
    if (typeof p.tuitionRmbPerYear === "number") {
      const yrs = p.durationYears ? ` × ${p.durationYears} 年` : "";
      return `¥${nf(p.tuitionRmbPerYear)}/学年${yrs} ≈ ¥${nf(p.tuitionRmb)}（总额估算）`;
    }
    if (typeof p.tuitionPerModuleMinSgd === "number") {
      return `S$${nf(p.tuitionPerModuleMinSgd)}–${nf(p.tuitionPerModuleMaxSgd)}/模块${cnySuffix(p)}`;
    }
    const parts = [];
    if (typeof p.tuitionHkd === "number") parts.push("HK$" + nf(p.tuitionHkd));
    if (typeof p.tuitionSgd === "number") parts.push("S$" + nf(p.tuitionSgd));
    // 人民币原币（中外合办院校）：本身即原币，不再附加换算值
    if (typeof p.tuitionRmb === "number") return "¥" + nf(p.tuitionRmb);
    if (!parts.length) return p.tuitionNote || "以官网为准";
    return parts.join(" / ") + cnySuffix(p);
  }

  // 卡片格子窄，用紧凑形式（原币值 + 人民币），完整算式在展开详情与弹窗里
  function fmtTuitionShort(p) {
    if (typeof p.tuitionPerCredit === "number" && typeof p.tuitionCredits === "number") {
      return `≈HK$${nf(p.tuitionHkd)}${cnySuffix(p)}（按学分估算）`;
    }
    if (typeof p.tuitionRmbPerYear === "number") {
      return `¥${nf(p.tuitionRmbPerYear)}/学年 ≈ ¥${nf(p.tuitionRmb)}（估算）`;
    }
    if (typeof p.tuitionPerModuleMinSgd === "number") {
      return `S$${nf(p.tuitionPerModuleMinSgd)}–${nf(p.tuitionPerModuleMaxSgd)}/模块`;
    }
    const parts = [];
    if (typeof p.tuitionHkd === "number") parts.push("HK$" + nf(p.tuitionHkd));
    if (typeof p.tuitionSgd === "number") parts.push("S$" + nf(p.tuitionSgd));
    if (typeof p.tuitionRmb === "number") return "¥" + nf(p.tuitionRmb);
    return parts.length ? parts.join(" / ") + cnySuffix(p) : clip(p.tuitionNote || "以官网为准", 30);
  }

  // tuitionNote 常把金额又复述一遍；含相同金额时只留说明，避免「HK$468,000HK$468,000（…）」
  function tuitionCell(p) {
    const head = esc(fmtTuition(p));
    const note = (p.tuitionNote || "").trim();
    if (!note) return head;
    const squash = s => s.replace(/[\s,]/g, "");
    const amt = typeof p.tuitionHkd === "number" ? "HK$" + nf(p.tuitionHkd)
      : typeof p.tuitionSgd === "number" ? "S$" + nf(p.tuitionSgd) : "";
    if (amt && squash(note).includes(squash(amt))) return `<span style="color:#78716c">${esc(note)}</span>`;
    return `${head}<br/><span style="color:#78716c">${esc(note)}</span>`;
  }

  function durationOf(p) {
    const t = p.durationText || "";
    if (!t || t.indexOf("待核实") !== -1) return t || "待核实";
    return /\d/.test(t) ? t : `${t}（约 ${p.durationYears} 年）`;
  }

  function clip(s, n) {
    s = s || "";
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  function openStatusText(p) {
    if (p.open27 === true) return { label: "可申请 27 Fall", cls: "open" };
    if (p.open27 === "pending") return { label: "待批准 / 待开放", cls: "pending" };
    if (p.open27 === false) return { label: "暂未开放", cls: "closed" };
    return { label: "状态未知", cls: "pending" };
  }

  function yearsAgo(y) {
    if (!y) return null;
    return Math.max(0, new Date().getFullYear() - y);
  }

  /* ---------- 志愿单 ---------- */

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
    localStorage.setItem(WISH_KEY, JSON.stringify(state.wish));
    if (silent) return;
    for (const fn of wishListeners) {
      try { fn(); } catch { /* 订阅者失败不得影响本地保存 */ }
    }
  }

  // 按志愿单顺序解析出完整项目对象
  function wishItems() {
    const byId = new Map(state.list.map(p => [p.id, p]));
    return state.wish.map(w => byId.get(w.id)).filter(Boolean);
  }

  function isWished(id) {
    return state.wish.some(w => w.id === id);
  }

  /* ---------- 提示 ---------- */

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------- 筛选 ---------- */

  function fillFilters() {
    const uniCnByCode = new Map(PROGRAMMES.map(p => [p.uni, p.uniCn]));
    const cats = [...new Set(PROGRAMMES.map(p => p.category))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
    const uniSel = $("#fUni");
    [...uniCnByCode.keys()].sort().forEach(u => {
      const o = document.createElement("option");
      o.value = u;
      o.textContent = `${u} · ${uniCnByCode.get(u)}`;
      uniSel.appendChild(o);
    });
    cats.forEach(c => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      $("#fCat").appendChild(o);
    });
  }

  function getFiltered() {
    const q = $("#q").value.trim().toLowerCase();
    const uni = $("#fUni").value;
    const cat = $("#fCat").value;
    const open = $("#fOpen").value;
    // 空格分隔的多关键词需全部命中
    const terms = q ? q.split(/\s+/).filter(Boolean) : [];

    return state.list.filter(p => {
      if (uni && p.uni !== uni) return false;
      if (cat && p.category !== cat) return false;
      if (open === "open" && p.open27 !== true) return false;
      if (open === "pending" && p.open27 !== "pending") return false;
      if (open === "closed" && p.open27 !== false) return false;
      if (!terms.length) return true;
      const hay = [
        p.nameCn, p.nameEn, p.uni, p.uniCn, p.faculty, p.facultyCn, p.category,
        p.desc, p.descCn, p.descEn,
        p.requirements, p.requirementsCn, p.requirementsEn,
        p.tuitionNote, p.jointPartner, p.location, p.applyWindow
      ].join(" ").toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }

  /* ---------- 渲染 ---------- */

  function renderSourceBar() {
    const total = PROGRAMMES.length;
    const n = f => PROGRAMMES.filter(f).length;
    const confOk = n(p => p.sourceConfidence === "official-listed");
    const feeOk = n(p => p.feeSource === "official-page");
    const feeInst = n(p => p.feeSource === "official-installments");
    const feeCredit = n(p => p.feeSource === "official-per-credit");
    const feeModule = n(p => p.feeSource === "official-per-module");
    const feeYear = n(p => p.feeSource === "official-per-year");
    const feeOther = n(p => p.feeSource === "official-other-intake");
    const feePend = n(p => p.feeSource === "official-pending-approval");
    const feeBad = total - feeOk - feeInst - feeCredit - feeModule - feeYear - feeOther - feePend;
    const bar = $("#statusBar");
    bar.className = "show warn";
    bar.innerHTML =
      `<strong>数据来源自查（${esc(DATA_META.lastRefreshed.slice(0, 10))} 复核）：</strong>共 ${total} 条。` +
      `项目存在性：<strong>${confOk}</strong> 条已在官网名单确认，${total - confOk} 条待核实。` +
      `学费：<strong>${feeOk}</strong> 条取自官网项目页` +
      (feeInst ? `、<strong>${feeInst}</strong> 条官网按学期分项列示` : "") +
      (feeCredit ? `、<strong>${feeCredit}</strong> 条官网按学分计费（总额 = 官网单价 × 官网最低毕业学分，属估算）` : "") +
      (feeModule ? `、<strong>${feeModule}</strong> 条官网按模块计费（官网未列模块数，不给估算总额）` : "") +
      (feeYear ? `、<strong>${feeYear}</strong> 条官网按学年计费（总额 = 学年单价 × 官网学制，属估算）` : "") +
      (feeOther ? `、<strong>${feeOther}</strong> 条官网仅列其他入学周期` : "") +
      (feePend ? `、<strong>${feePend}</strong> 条官网学费标注待审批（非最终金额）` : "") +
      `、<strong>${feeBad}</strong> 条未能核实（卡片标注「学费待核实」）。` +
      `申请要求：<strong>${n(reqOk)}</strong> 条为官网逐字原文并附中文对照，` +
      `<strong>${n(p => !reqOk(p))}</strong> 条为早期采集的压缩摘要（非官网原文、暂无中文，卡片已标注）。` +
      `开办年份与截止日期多为参考，<strong>投递前必须点专业名跳转官网确认</strong>。` +
      (DATA_META.fx
        ? `<br/><strong>人民币换算：</strong>${esc(DATA_META.fx.date)} 汇率 1 HKD = ${DATA_META.fx.HKD_CNY}、1 SGD = ${DATA_META.fx.SGD_CNY}（来源 ${esc(DATA_META.fx.source)}），` +
          `取整到百元，<strong>仅为参考、非各校官网数字</strong>；官网原币值始终优先展示。` +
          `身份档位按${esc(DATA_META.applicantResidency || "中国大陆")}申请者取（如 NUS MSBA 取国际学生档 S$87,550）。`
        : "");
  }

  function renderCards() {
    const rows = getFiltered();
    $("#resultCount").textContent = rows.length + " 个结果";
    $("#countLabel").textContent = state.list.length;
    $("#refreshLabel").textContent = new Date(DATA_META.lastRefreshed).toLocaleString("zh-CN", { hour12: false });
    $("#cycleLabel").textContent = DATA_META.cycle;

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
      // 只有官网项目页明确列出本入学周期费用的，才允许标「已核」；其余一律显式标待核实
      const feeBadge = p.feeSource === "official-page"
        ? '<span class="badge open">学费官网已核</span>'
        : p.feeSource === "official-per-credit"
          ? '<span class="badge pending">官网按学分计费·总额为估算</span>'
          : p.feeSource === "official-per-module"
            ? '<span class="badge pending">官网按模块计费</span>'
            : p.feeSource === "official-per-year"
              ? '<span class="badge pending">官网按学年计费·总额为估算</span>'
              : p.feeSource === "official-installments"
              ? '<span class="badge open">学费官网已核·按学期分项</span>'
              : p.feeSource === "official-other-intake"
                ? '<span class="badge pending">官网仅列其他入学周期</span>'
                : p.feeSource === "official-pending-approval"
                  ? '<span class="badge pending">官网学费待审批</span>'
                  : '<span class="badge pending">学费待核实</span>';
      // 港五以外的院校一律显示授课地点徽章（旧逻辑按「location 含香港」判断，
      // 会把「深圳（香港中文大学（深圳）校区）」误判为香港而漏显示）
      const showLoc = !HK5.has(p.uni) && !!p.location;
      // jointPartner 可能带官网原文引证，徽章只取机构名，完整引证留在弹窗
      const jointShort = String(p.jointPartner || "").split("（")[0].trim();
      const reqSummary = clip(orUnverified(reqCnOf(p) || reqEnOf(p)), 80);

      return `
        <article class="card ${wished ? "selected" : ""} ${expanded ? "expanded" : ""}" data-id="${esc(p.id)}">
          <div class="badge-row">
            <span class="badge uni">${esc(p.uni)} · ${esc(p.uniCn)}</span>
            <span class="badge">${esc(p.category)}</span>
            <span class="badge ${st.cls}">${st.label}</span>
            ${conf}
            ${feeBadge}
            ${reqOk(p) ? "" : '<span class="badge pending">申请要求非官网原文·无中文</span>'}
            ${jointShort ? `<span class="badge">联培：${esc(jointShort)}</span>` : ""}
            ${showLoc ? `<span class="badge">授课：${esc(p.location)}</span>` : ""}
          </div>
          <div class="card-top">
            <div>
              <h3>${progLink(p, "prog-link", p.nameCn)}</h3>
              <p class="en">${progLink(p, "prog-link", p.nameEn)}</p>
            </div>
          </div>
          <p class="desc">${esc(descCnOf(p))}</p>
          <p class="desc-en">${esc(descEnOf(p))}</p>
          <div class="meta-grid">
            <div><div class="k">学院</div><div class="v">${esc(p.facultyCn || p.faculty)}</div></div>
            <div><div class="k">学制</div><div class="v">${esc(durationOf(p))}</div></div>
            <div><div class="k">学费</div><div class="v">${esc(fmtTuitionShort(p))}</div></div>
            <div><div class="k">${reqOk(p) ? "申请要求" : "申请要求（英文摘要，非官网原文）"}</div><div class="v req-text">${esc(reqSummary)}</div></div>
            <div><div class="k">申请窗口</div><div class="v">${esc(p.applyWindow)}</div></div>
            <div><div class="k">授课地点</div><div class="v">${esc(p.location)}</div></div>
          </div>
          <div class="card-actions">
            <button class="btn ghost" data-act="detail">${expanded ? "收起详情" : "展开详情"}</button>
            <button class="btn" data-act="wish">${wished ? "已在志愿单" : "加入志愿"}</button>
          </div>
          <div class="detail">
            <div class="detail-block">
              <div class="detail-label">专业简介 · 中文</div>
              <div class="detail-body">${esc(orUnverified(descCnOf(p)))}</div>
            </div>
            <div class="detail-block">
              <div class="detail-label">${esc(descEnLabel(p))}</div>
              <div class="detail-body en">${esc(orUnverified(descEnOf(p)))}</div>
            </div>
            <div class="detail-block">
              <div class="detail-label">${esc(reqCnLabel(p))}</div>
              <div class="detail-body">${esc(orUnverified(reqCnOf(p)))}</div>
            </div>
            <div class="detail-block">
              <div class="detail-label">${esc(reqEnLabel(p))}</div>
              <div class="detail-body en">${esc(orUnverified(reqEnOf(p)))}</div>
            </div>
            <dl>
              <dt>英文名</dt><dd>${esc(p.nameEn)}</dd>
              <dt>学院（英文）</dt><dd>${esc(p.faculty)}</dd>
              <dt>学制 / 开办</dt><dd>${esc(durationOf(p))}${p.foundedYear ? ` · ${esc(p.foundedYear)} 年起（约 ${yearsAgo(p.foundedYear)} 年）` : ""}</dd>
              ${p.tuitionNote ? `<dt>学费说明</dt><dd>${esc(p.tuitionNote)}</dd>` : ""}
              ${p.jointPartner ? `<dt>联培学校/企业</dt><dd>${esc(p.jointPartner)}</dd>` : ""}
              <dt>27 Fall 状态</dt><dd>${st.label}</dd>
              <dt>数据可信度</dt><dd>${p.sourceConfidence === "official-listed" ? "官网名单已确认项目存在" : "本轮未在官网列表直接确认，请点官网核实"}</dd>
              ${p.sourceNote ? `<dt>来源说明</dt><dd>${esc(p.sourceNote)}</dd>` : ""}
            </dl>
          </div>
        </article>
      `;
    }).join("");
  }

  function sortedWishItems() {
    const items = wishItems();
    const sort = $("#wSort").value;
    if (sort === "uni") {
      items.sort((a, b) => a.uni.localeCompare(b.uni) || a.nameCn.localeCompare(b.nameCn, "zh-Hans-CN"));
    } else if (sort === "tuition") {
      // 用人民币参考值排序，港币与新币项目才可比；无换算值的排最后
      items.sort((a, b) => (a.tuitionCny ?? Infinity) - (b.tuitionCny ?? Infinity));
    } else if (sort === "open") {
      const rank = p => p.open27 === true ? 0 : p.open27 === "pending" ? 1 : 2;
      items.sort((a, b) => rank(a) - rank(b) || a.uni.localeCompare(b.uni));
    }
    return items;
  }

  function renderWish() {
    const box = $("#wishList");
    if (!state.wish.length) {
      box.innerHTML = `<div class="wish-empty">志愿单还是空的。<br/>在左侧点击「加入志愿」开始选校。</div>`;
      return;
    }

    let items = sortedWishItems();
    const q = $("#wq").value.trim().toLowerCase();
    if (q) {
      items = items.filter(p =>
        (p.nameCn + p.nameEn + p.uni + p.uniCn + p.category + p.facultyCn).toLowerCase().includes(q)
      );
    }
    const manual = $("#wSort").value === "add";

    if (!items.length) {
      box.innerHTML = `<div class="wish-empty">志愿单中没有匹配项。</div>`;
      return;
    }

    box.innerHTML = items.map((p, idx) => {
      const st = openStatusText(p);
      return `
        <div class="wish-item" data-id="${esc(p.id)}">
          <div class="wi-title">${idx + 1}. ${esc(p.nameCn)}</div>
          <div class="wi-sub">${esc(p.uni)} · ${st.label} · ${esc(fmtTuition(p))}</div>
          <div class="wi-actions">
            <button data-wact="up" ${manual ? "" : 'title="点击后自动切换为「按加入顺序」再移动"'}>↑</button>
            <button data-wact="down" ${manual ? "" : 'title="点击后自动切换为「按加入顺序」再移动"'}>↓</button>
            <button data-wact="remove">移除</button>
            <button data-wact="detail">详情</button>
            ${progLink(p, "wi-site", "官网")}
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
      state.wish.push({ id: p.id, addedAt: Date.now() });
      toast("已加入志愿单：" + p.nameCn);
    }
    saveWish();
    renderCards();
    renderWish();
  }

  function moveWish(id, dir) {
    const sortSel = $("#wSort");
    if (sortSel.value !== "add") {
      // 先把当前显示顺序固化为基础顺序，这样切换排序时列表不会跳变，用户的移动也看得见
      const addedAtById = new Map(state.wish.map(w => [w.id, w.addedAt]));
      state.wish = sortedWishItems().map(p => ({ id: p.id, addedAt: addedAtById.get(p.id) || 0 }));
      sortSel.value = "add";
      saveWish();
      toast("已切换为「按加入顺序」以便手动排序");
    }
    const i = state.wish.findIndex(w => w.id === id);
    const j = i < 0 ? -1 : dir === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < state.wish.length) {
      [state.wish[i], state.wish[j]] = [state.wish[j], state.wish[i]];
      saveWish();
    }
    renderWish();
  }

  function showDetail(id) {
    const p = state.list.find(x => x.id === id);
    if (!p) return;
    const st = openStatusText(p);
    const founded = p.foundedYear ? `${esc(p.foundedYear)} 年（约 ${yearsAgo(p.foundedYear)} 年）` : "—";
    const row = (k, v, cls) => `<tr><th>${k}</th><td${cls ? ` class="${cls}"` : ""}>${v}</td></tr>`;

    $("#modal").innerHTML = `
      <h3>${esc(p.nameCn)}</h3>
      <div class="sub">${esc(p.nameEn)}</div>
      <table>
        ${row("学校", `${esc(p.uniCn)}（${esc(p.uni)}）`)}
        ${row("学院", `${esc(p.facultyCn || "—")}<br/><span style="color:#78716c">${esc(p.faculty)}</span>`)}
        ${row("方向", esc(p.category))}
        ${row("学费", tuitionCell(p))}
        ${row("学制", esc(durationOf(p)))}
        ${row("开办时间", founded)}
        ${row("27 Fall 招生", st.label)}
        ${row("允许投递时间", esc(orUnverified(p.applyWindow)))}
        ${row("联培学校/企业", esc(p.jointPartner || "—"))}
        ${row("授课地点", esc(p.location))}
        ${row("专业简介 · 中文", esc(orUnverified(descCnOf(p))))}
        ${row(descEnLabel(p), esc(orUnverified(descEnOf(p))), "en")}
        ${row(reqCnLabel(p), esc(orUnverified(reqCnOf(p))))}
        ${row(reqEnLabel(p), esc(orUnverified(reqEnOf(p))), "en")}
        ${row("官网", progLink(p, "prog-link", p.website))}
        ${row("数据可信度", (p.sourceConfidence === "official-listed" ? "官网名单已确认" : "项目存在性待官网核实")
          + "；学费" + (p.feeSource === "official-page" ? "已对照官网项目页核实"
            : p.feeSource === "official-per-credit" ? "官网按学分/模块计费，未列全程总额，已记官网单价"
            : p.feeSource === "official-per-year" ? "官网按学年计费，未列全程总额；总额按官网学制估算并已标注"
            : p.feeSource === "official-pending-approval" ? "官网标注为待审批，非最终金额，须以官网后续公布为准"
            : p.feeSource === "official-other-intake" ? "官网仅列明其他入学周期，本周期费用须向项目确认"
            : "未经官网核实，投递前务必打开官网确认")
          + (reqOk(p) ? "" : "；申请要求为早期采集的压缩摘要，非官网逐字原文，且暂无中文对照，投递前务必点官网核对"))}
        ${p.sourceNote ? row("来源说明", esc(p.sourceNote)) : ""}
      </table>
      <div class="modal-close">
        <button class="btn" id="modalWish">${isWished(p.id) ? "从志愿单移除" : "加入志愿单"}</button>
        <button class="btn ghost" id="modalClose">关闭</button>
      </div>
    `;
    $("#modalBackdrop").classList.add("open");
    $("#modalWish").onclick = () => { toggleWish(p.id); showDetail(p.id); };
    $("#modalClose").onclick = () => $("#modalBackdrop").classList.remove("open");
  }

  /* ---------- 导出 ---------- */

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
    const items = wishItems();
    if (!items.length) { toast("志愿单为空，无法导出"); return; }
    const headers = ["顺序", "学校", "中文名", "英文名", "方向", "学院", "学制",
      "学费(官网原文)", "学费HKD", "学费SGD", "学费RMB", "学费CNY(参考换算)", "是否估算总额", "学费说明",
      "27Fall状态", "申请窗口", "授课地点", "联培",
      "申请要求(中文)", "申请要求(英文原文)", "申请要求核实状态", "数据可信度", "官网"];
    const lines = [headers.join(",")];
    items.forEach((p, i) => {
      const row = [
        i + 1, p.uni, p.nameCn, p.nameEn, p.category, p.facultyCn || p.faculty, durationOf(p),
        fmtTuition(p),
        typeof p.tuitionHkd === "number" ? p.tuitionHkd : "",
        typeof p.tuitionSgd === "number" ? p.tuitionSgd : "",
        typeof p.tuitionRmb === "number" ? p.tuitionRmb : "",
        typeof p.tuitionCny === "number" ? p.tuitionCny : "",
        p.tuitionIsEstimate ? "是（官网学分单价×官网最低学分）" : "否",
        p.tuitionNote || "",
        openStatusText(p).label, p.applyWindow, p.location, p.jointPartner || "",
        reqCnOf(p), reqEnOf(p),
        reqOk(p) ? "官网逐字原文并附中文对照" : "早期采集的压缩摘要，非官网原文且暂无中文对照，须点官网核对",
        p.sourceConfidence === "official-listed" ? "官网名单已核" : "待官网核实",
        p.website
      ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`);
      lines.push(row.join(","));
    });
    download("商科硕士志愿单.csv", "\ufeff" + lines.join("\r\n"), "text/csv;charset=utf-8");
    toast("已导出 CSV");
  }

  function exportJson() {
    const items = wishItems();
    if (!items.length) { toast("志愿单为空，无法导出"); return; }
    download(
      "商科硕士志愿单.json",
      JSON.stringify({
        exportedAt: new Date().toISOString(),
        cycle: DATA_META.cycle,
        dataSourceRefreshedAt: DATA_META.lastRefreshed,
        count: items.length,
        items
      }, null, 2),
      "application/json"
    );
    toast("已导出 JSON");
  }

  /* ---------- 事件 ---------- */

  function bind() {
    ["q", "fUni", "fCat", "fOpen"].forEach(id => {
      $("#" + id).addEventListener("input", renderCards);
      $("#" + id).addEventListener("change", renderCards);
    });
    $("#btnReset").addEventListener("click", () => {
      ["q", "fUni", "fCat", "fOpen"].forEach(id => { $("#" + id).value = ""; });
      renderCards();
    });
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
      const id = btn.closest(".card").dataset.id;
      const act = btn.dataset.act;
      if (act === "wish") toggleWish(id);
      else if (act === "detail") {
        if (state.expanded.has(id)) state.expanded.delete(id);
        else state.expanded.add(id);
        renderCards();
      }
    });

    $("#wishList").addEventListener("click", e => {
      const btn = e.target.closest("[data-wact]");
      if (!btn) return;
      const id = btn.closest(".wish-item").dataset.id;
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

  /* ---------- 对外桥接：store.js（在线保存）与 track.js（申请跟进表）使用 ---------- */

  window.HK5App = {
    programmes: PROGRAMMES,
    byId(id) { return PROGRAMMES.find(p => p.id === id) || null; },
    getWish() { return state.wish.map(w => ({ id: w.id, addedAt: w.addedAt || 0 })); },
    isWished,
    toast,
    esc,
    refreshCards: renderCards,
    refreshWish: renderWish,
    onWishChange(fn) { wishListeners.push(fn); },
    // 云端对账后整体替换志愿单；silent=true 表示这次变更来自云端，不得再回推云端
    replaceWish(next, silent) {
      const ids = new Set(PROGRAMMES.map(p => p.id));
      state.wish = (Array.isArray(next) ? next : [])
        .filter(w => w && ids.has(w.id))
        .map(w => ({ id: w.id, addedAt: w.addedAt || 0 }));
      saveWish(silent);
      renderWish();
      renderCards();
    }
  };

  function init() {
    fillFilters();
    bind();
    renderSourceBar();
    renderCards();
    renderWish();
  }

  init();
})();
