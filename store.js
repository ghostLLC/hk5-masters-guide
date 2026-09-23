/* 在线保存存储层
 *
 * 三种运行环境，同一份前端代码：
 *   1. Qoder 站点 + 已登录  → 云端持久化（Function + 数据库），本机 localStorage 作离线副本
 *   2. Qoder 站点 + 未登录  → 仅本机，提示登录后可在线保存
 *   3. GitHub Pages / file:// → 无后端，仅本机 + 导出/导入 JSON
 *
 * 原则：
 *   - 任何改动先落 localStorage 再推云端，云端失败绝不丢数据
 *   - 版本化写入（baseVersion CAS），云端更新时返回 409，由用户裁决，不静默覆盖
 *   - 写入结果未知（超时/断网）时挂起自动保存，只做「重新读取」对账，绝不自动重放写入
 */
(function () {
  const ENDPOINT = "/functions/v1/app";
  const TRACK_KEY = "hk5_track_v1";
  const SYNC_KEY = "hk5_sync_v1";
  const DEBOUNCE_MS = 1200;

  const STATUSES = ["not_started", "preparing", "submitted", "interview", "offer", "rejected", "withdrawn", "accepted"];
  const PRIORITIES = ["", "reach", "match", "safe"];
  const MATERIALS = ["transcript", "degree", "language", "reference", "ps", "cv", "other"];

  const status = {
    mode: "local",        // local | cloud
    user: null,           // {id,name,picture} | null
    sync: "idle",         // idle | saving | saved | error | conflict | unknown
    message: "正在检测在线保存…",
    lastSavedAt: 0,
    version: 0
  };

  // 本机模式下的常驻提示：静态站点与「有后端但未登录」措辞不同，不能混用
  let localMessage = "本机保存 · 数据只存在当前浏览器";

  let tracks = {};
  let meta = { version: 0, savedAt: 0, dirty: false, userId: "" };
  let saveTimer = null;
  let autoSaveSuspended = false;
  const statusListeners = [];
  const trackListeners = [];

  /* ---------- 本地读写 ---------- */

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? v : fallback;
    } catch { return fallback; }
  }

  function writeLocal() {
    try {
      localStorage.setItem(TRACK_KEY, JSON.stringify(tracks));
      localStorage.setItem(SYNC_KEY, JSON.stringify(meta));
    } catch {
      // 隐私模式/配额满：数据仍在内存中，但要让用户知道没能落盘
      emitStatus("error", "本机存储写入失败（可能是浏览器隐私模式或空间已满），改动仅存在内存中，请尽快导出备份");
    }
  }

  /* ---------- 校验：与 Function 端同一套白名单，避免写入被拒后才发现 ---------- */

  function sanitizeTrack(t) {
    const src = t && typeof t === "object" ? t : {};
    const materials = {};
    const srcM = src.materials && typeof src.materials === "object" ? src.materials : {};
    for (const m of MATERIALS) materials[m] = srcM[m] === true;
    const date = v => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : "";
    // 名次：1–999 的整数，未填为 null（用 null 而不是 0，避免与「第 0 名」混淆）
    const rank = Number.isSafeInteger(src.rank) && src.rank >= 1 && src.rank <= 999 ? src.rank : null;
    return {
      status: STATUSES.includes(src.status) ? src.status : "not_started",
      priority: PRIORITIES.includes(src.priority) ? src.priority : "",
      rank,
      deadline: date(src.deadline),
      submittedAt: date(src.submittedAt),
      interviewAt: date(src.interviewAt),
      resultAt: date(src.resultAt),
      note: typeof src.note === "string" ? src.note.slice(0, 2000) : "",
      materials,
      updatedAt: Number.isFinite(src.updatedAt) ? src.updatedAt : Date.now()
    };
  }

  /* ---------- 状态广播 ---------- */

  function emitStatus(sync, message) {
    status.sync = sync;
    if (message !== undefined) status.message = message;
    for (const fn of statusListeners) { try { fn(status); } catch { /* 忽略订阅者异常 */ } }
  }

  function emitTracks() {
    for (const fn of trackListeners) { try { fn(tracks); } catch { /* 忽略订阅者异常 */ } }
  }

  /* ---------- 云端请求 ---------- */

  async function callCloud(action, init) {
    const sep = action.includes("?") ? "&" : "?";
    let res;
    try {
      res = await fetch(ENDPOINT + sep + "action=" + encodeURIComponent(action), {
        ...init,
        credentials: "same-origin",
        headers: { Accept: "application/json", ...(init && init.headers || {}) }
      });
    } catch {
      // 断网/协议不支持：统一成带 code 的应用错误，便于区分「结果未知」与「无后端」
      const err = new Error("network_error");
      err.code = "network_error";
      throw err;
    }
    const ct = res.headers.get("content-type") || "";
    // GitHub Pages 对未知路径返回 HTML 404；据此判定「此站点没有后端」
    if (!ct.includes("application/json")) {
      const err = new Error("no_backend");
      err.code = res.status === 404 || res.status === 403 ? "no_backend" : "invalid_response";
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    if (!res.ok) {
      const err = new Error(body && typeof body.error === "string" ? body.error : "request_failed");
      err.code = err.message;
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  /* ---------- 初始化：探测后端 → 对账 ---------- */

  async function init() {
    tracks = normalizeTracks(readJson(TRACK_KEY, {}));
    const m = readJson(SYNC_KEY, null);
    if (m && typeof m === "object") {
      meta.version = Number.isSafeInteger(m.version) ? m.version : 0;
      meta.savedAt = Number.isFinite(m.savedAt) ? m.savedAt : 0;
      meta.dirty = m.dirty === true;
      // 记录本机缓存属于哪个账号，换账号时据此判断不能把缓存带过去
      meta.userId = typeof m.userId === "string" ? m.userId : "";
    }
    status.version = meta.version;
    status.lastSavedAt = meta.savedAt;

    let probe = null;
    // file:// 与 GitHub Pages 都没有 Function：前者连请求都发不出（TypeError 无 code），
    // 后者返回 HTML 404。两种都要判成「此站点无后端」，否则会误报「云端服务暂不可用」
    const staticHost = location.protocol !== "http:" && location.protocol !== "https:";
    if (staticHost) {
      status.backendMissing = true;
    } else {
      try {
        probe = await callCloud("me");
      } catch (err) {
        probe = null;
        status.backendMissing = !err || err.code === "no_backend" || err.code === "network_error";
      }
    }

    if (!probe || probe.backend !== "ok") {
      status.mode = "local";
      localMessage = status.backendMissing
        ? "本机保存 · 此站点为静态部署，数据只存在当前浏览器，可用「导出备份 / 导入备份」在设备间迁移"
        : "本机保存 · 云端服务暂不可用，改动已留在本机，可用「导出备份」留存";
      emitStatus("idle", localMessage);
      emitTracks();
      return;
    }

    if (!probe.user) {
      status.mode = "local";
      status.user = null;
      localMessage = "本机保存 · 登录 Qoder 账号后可开启在线保存（未登录时数据只存在当前浏览器）";
      emitStatus("idle", localMessage);
      emitTracks();
      return;
    }

    status.mode = "cloud";
    status.user = probe.user;
    // 同一浏览器换账号时，本机缓存属于上一个账号，绝不能推给新账号。
    // 只有在从未同步过任何账号（meta.userId 为空）时才允许把本机数据推上去，
    // 这样「先在静态站点用了一阵、再登录」的场景仍然能把已有数据带上来。
    const switched = !!meta.userId && meta.userId !== probe.user.id;
    try {
      await reconcileWithCloud({ switchedAccounts: switched });
      meta.userId = probe.user.id;
      writeLocal();
    } catch (err) {
      emitStatus("error", describeError(err) + "（改动仍保留在本机）");
    }
    emitTracks();
  }

  // 云端与本机对账：本机有未同步改动时交给用户裁决，否则以云端为准
  async function reconcileWithCloud({ switchedAccounts = false } = {}) {
    const cloud = await callCloud("load");
    if (cloud.empty) {
      status.version = 0;
      meta.version = 0;
      if (switchedAccounts) {
        // 新账号云端还没有数据，而本机缓存是别人账号留下的，只能留空并说明
        tracks = {};
        if (window.HK5App) window.HK5App.replaceWish([], true);
        meta.dirty = false;
        writeLocal();
        emitStatus("idle", "已切换到另一个账号，云端还没有该账号的数据。上一位账号留在本机的副本没有上传；如需找回那份数据，请切回该账号后再「导出备份」。");
        return;
      }
      // 云端还没有数据：把本机已有的志愿单与跟进表推上去
      await pushToCloud();
      return;
    }
    status.version = cloud.version;
    status.lastSavedAt = Date.parse(cloud.updatedAt) || meta.savedAt;
    meta.version = cloud.version;
    meta.savedAt = status.lastSavedAt;

    if (switchedAccounts) {
      // 换账号：以新账号的云端数据为准，本机旧账号的改动不带过去
      adoptCloud(cloud);
      meta.dirty = false;
      writeLocal();
      emitStatus("saved", cloudLabel() + "（已切换到该账号的云端数据，上一位账号留在本机的改动未上传）");
      return;
    }

    if (meta.dirty) {
      emitStatus("conflict", "本机有尚未同步到云端的改动，云端也存有数据，请选择保留哪一份");
      window.HK5Store.pendingCloud = cloud;
      renderReconcilePrompt(cloud);
      return;
    }
    adoptCloud(cloud);
    meta.dirty = false;
    writeLocal();
    emitStatus("saved", cloudLabel());
  }

  function adoptCloud(cloud) {
    tracks = normalizeTracks(cloud.tracks || {});
    if (window.HK5App) window.HK5App.replaceWish(cloud.wishlist || [], true);
    meta.version = cloud.version;
    status.version = cloud.version;
  }

  function normalizeTracks(obj) {
    const out = {};
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    for (const key of Object.keys(obj)) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(key)) continue;
      out[key] = sanitizeTrack(obj[key]);
    }
    return out;
  }

  function cloudLabel() {
    const who = status.user ? (status.user.name || "已登录") : "已登录";
    const when = status.lastSavedAt ? new Date(status.lastSavedAt).toLocaleString("zh-CN", { hour12: false }) : "—";
    return `在线保存已开启 · ${who} · 云端版本 v${status.version} · 上次保存 ${when}`;
  }

  /* ---------- 写入 ---------- */

  function markDirty() {
    meta.dirty = true;
    writeLocal();
    if (status.mode !== "cloud") {
      emitStatus("idle", localMessage);
      return;
    }
    if (autoSaveSuspended) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { pushToCloud().catch(() => { /* 已在内部处理状态 */ }); }, DEBOUNCE_MS);
    if (status.sync !== "conflict" && status.sync !== "unknown") {
      emitStatus("saving", "改动已存本机，正在同步到云端…");
    }
  }

  async function pushToCloud() {
    if (status.mode !== "cloud" || !status.user) return;
    const payload = {
      baseVersion: meta.version,
      wishlist: window.HK5App ? window.HK5App.getWish() : [],
      tracks
    };
    emitStatus("saving", "正在同步到云端…");
    try {
      const res = await callCloud("save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      meta.version = res.version;
      meta.savedAt = Date.parse(res.updatedAt) || Date.now();
      meta.dirty = false;
      status.version = res.version;
      status.lastSavedAt = meta.savedAt;
      writeLocal();
      emitStatus("saved", cloudLabel());
    } catch (err) {
      handleSaveError(err);
    }
  }

  function handleSaveError(err) {
    const code = err && err.code;
    if (code === "conflict") {
      autoSaveSuspended = true;
      const cloud = err.body && err.body.cloud;
      window.HK5Store.pendingCloud = cloud || null;
      emitStatus("conflict", "云端已有更新的版本（可能你在其他设备改过），已暂停自动同步以免覆盖");
      if (cloud) renderReconcilePrompt(cloud);
      return;
    }
    // 超时/断网/响应异常：无法判断这次写入是否已提交，绝不自动重放
    if (code === "network_error" || code === "write_result_unknown" || code === "invalid_response") {
      autoSaveSuspended = true;
      emitStatus("unknown", "云端保存结果未知（网络中断或超时），已暂停自动同步。请先「重新读取云端」对账后再继续编辑");
      return;
    }
    if (code === "login_required") {
      status.mode = "local";
      status.user = null;
      emitStatus("error", "登录状态已失效，改动已保留在本机，请重新登录后再同步");
      return;
    }
    if (code === "invalid_input" || code === "write_rejected") {
      autoSaveSuspended = true;
      emitStatus("error", "云端拒绝了这次保存（数据格式或长度超限），改动已保留在本机，可导出备份后联系维护者");
      return;
    }
    emitStatus("error", describeError(err) + "（改动已保留在本机，将自动重试）");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { pushToCloud().catch(() => {}); }, 6000);
  }

  function describeError(err) {
    const map = {
      no_backend: "此站点没有云端服务",
      access_denied: "没有访问权限，请确认站点访问权限并重新登录",
      state_unavailable: "云端数据暂时读不到",
      database_runtime_unavailable: "云端数据库运行时不可用",
      invalid_user_context: "登录凭证无效，请重新登录",
      request_failed: "云端请求失败"
    };
    return map[err && err.code] || "云端请求失败";
  }

  /* ---------- 冲突裁决 ---------- */

  function renderReconcilePrompt(cloud) {
    const host = document.getElementById("reconcileBar");
    if (!host) return;
    const when = cloud.updatedAt ? new Date(Date.parse(cloud.updatedAt)).toLocaleString("zh-CN", { hour12: false }) : "—";
    const ver = Number(cloud.version) || 0;

    // 用 DOM 构建而非 innerHTML：云端回传的字段一律走 textContent，不给注入留口子
    host.textContent = "";
    const box = document.createElement("div");
    box.className = "rec-in";
    const text = document.createElement("div");
    text.className = "rec-text";
    text.append(`云端存有一份数据（版本 v${ver}，保存于 ${when}），本机也有尚未同步的改动。两者不一致，请选择保留哪一份——被放弃的一方不会被自动恢复。`);
    const actions = document.createElement("div");
    actions.className = "rec-actions";
    const keepLocal = document.createElement("button");
    keepLocal.className = "btn ghost";
    keepLocal.type = "button";
    keepLocal.textContent = "用本机覆盖云端";
    const useCloud = document.createElement("button");
    useCloud.className = "btn";
    useCloud.type = "button";
    useCloud.textContent = "放弃本机，使用云端";
    actions.append(keepLocal, useCloud);
    box.append(text, actions);
    host.append(box);
    host.hidden = false;

    keepLocal.onclick = async () => {
      host.hidden = true;
      autoSaveSuspended = false;
      // 以云端最新版本号为基准重放本机内容，避免再次撞版本
      meta.version = ver;
      meta.dirty = true;
      writeLocal();
      await pushToCloud();
    };
    useCloud.onclick = () => {
      host.hidden = true;
      autoSaveSuspended = false;
      adoptCloud(cloud);
      meta.dirty = false;
      meta.savedAt = Date.parse(cloud.updatedAt) || meta.savedAt;
      status.lastSavedAt = meta.savedAt;
      writeLocal();
      emitStatus("saved", cloudLabel());
      emitTracks();
      if (window.HK5App) { window.HK5App.refreshWish(); window.HK5App.refreshCards(); }
    };
  }

  /* ---------- 跟进表数据操作 ---------- */

  function getTrack(id) {
    return tracks[id] ? { ...tracks[id], materials: { ...tracks[id].materials } } : null;
  }

  function ensureTrack(id) {
    if (!tracks[id]) tracks[id] = sanitizeTrack({});
    return tracks[id];
  }

  function setTrack(id, patch) {
    const cur = ensureTrack(id);
    const next = sanitizeTrack({ ...cur, ...patch });
    // 全是默认值且志愿单里也没有它 → 不必留一行空记录
    const empty = next.status === "not_started" && !next.priority && !next.deadline && !next.submittedAt
      && !next.interviewAt && !next.resultAt && !next.note && next.rank === null
      && MATERIALS.every(m => !next.materials[m]);
    if (empty && !(window.HK5App && window.HK5App.isWished(id))) {
      delete tracks[id];
    } else {
      next.updatedAt = Date.now();
      tracks[id] = next;
    }
    markDirty();
    emitTracks();
  }

  function removeTrack(id) {
    if (!tracks[id]) return;
    delete tracks[id];
    markDirty();
    emitTracks();
  }

  // 批量清空：逐条 removeTrack 会触发 N 次重绘，这里只发一次
  function clearAllTracks() {
    if (!Object.keys(tracks).length) return 0;
    const n = Object.keys(tracks).length;
    tracks = {};
    markDirty();
    emitTracks();
    return n;
  }

  /* ---------- 导出 / 导入 ---------- */

  function exportAll() {
    const blob = {
      kind: "hk5-masters-guide/state",
      schema: 1,
      exportedAt: new Date().toISOString(),
      cloudVersion: meta.version,
      wishlist: window.HK5App ? window.HK5App.getWish() : [],
      tracks
    };
    const stamp = new Date().toISOString().slice(0, 10);
    download(`申请跟进备份-${stamp}.json`, JSON.stringify(blob, null, 2), "application/json;charset=utf-8");
  }

  function importAll(text) {
    let blob;
    try { blob = JSON.parse(text); } catch { return { ok: false, error: "文件不是合法 JSON" }; }
    if (!blob || blob.kind !== "hk5-masters-guide/state") {
      return { ok: false, error: "不是本站导出的备份文件" };
    }
    if (blob.schema !== 1 || !Array.isArray(blob.wishlist) || !blob.tracks || typeof blob.tracks !== "object" || Array.isArray(blob.tracks)) {
      return { ok: false, error: "备份版本不支持或缺少必要字段，原有数据未改变" };
    }
    const nextTracks = normalizeTracks(blob.tracks || {});
    const nextWish = Array.isArray(blob.wishlist) ? blob.wishlist : [];
    tracks = nextTracks;
    if (window.HK5App) window.HK5App.replaceWish(nextWish, true);
    meta.dirty = true;
    writeLocal();
    emitTracks();
    if (status.mode === "cloud") {
      autoSaveSuspended = false;
      pushToCloud().catch(() => {});
    } else {
      emitStatus("idle", "已导入本机，改动只存在当前浏览器");
    }
    return { ok: true, wish: nextWish.length, tracks: Object.keys(nextTracks).length };
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------- 对外 ---------- */

  window.HK5Store = {
    STATUSES, PRIORITIES, MATERIALS,
    get status() { return { ...status }; },
    get tracks() { return tracks; },
    get meta() { return { ...meta }; },
    pendingCloud: null,
    init,
    getTrack,
    setTrack,
    removeTrack,
    clearAllTracks,
    markDirty,
    saveNow() { autoSaveSuspended = false; return pushToCloud(); },
    async reloadFromCloud() {
      if (status.mode !== "cloud") return { ok: false, error: "当前不是在线保存模式" };
      autoSaveSuspended = false;
      try {
        await reconcileWithCloud();
        emitTracks();
        return { ok: true };
      } catch (err) {
        emitStatus("error", describeError(err));
        return { ok: false, error: describeError(err) };
      }
    },
    exportAll,
    importAll,
    onStatus(fn) { statusListeners.push(fn); fn(status); },
    onTracks(fn) { trackListeners.push(fn); }
  };
})();
