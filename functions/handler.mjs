// 业务处理器：志愿单 + 申请跟进状态的云端读写。
// 身份只取网关验证过的 x-qoder-user-context（requireUser），绝不接受浏览器提交的 user_id。
// 数据库行级安全无法按 owner 策略生效（平台适配器只支持匿名模式），
// 因此跨用户隔离完全由本文件的 user_id 作用域强制——所有查询都必须带 .eq('user_id', user.user_id)。
import { getUser, requireUser, UserContextError } from './auth.mjs';

const json = (value, status = 200, extra = {}) => Response.json(value, {
  status,
  headers: { 'cache-control': 'private, no-store', ...extra },
});

const MAX_BODY = 262144;      // 单次保存上限 256 KB
const MAX_WISH = 200;         // 志愿单条目上限
const MAX_TRACKS = 200;       // 跟进条目上限
const MAX_NOTE = 2000;        // 单条备注上限
const STATUSES = ['not_started', 'preparing', 'submitted', 'interview', 'offer', 'rejected', 'withdrawn', 'accepted'];
const PRIORITIES = ['', 'reach', 'match', 'safe'];
const MATERIALS = ['transcript', 'degree', 'language', 'reference', 'ps', 'cv', 'other'];
const PROG_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class InputError extends Error {
  constructor(status) { super('invalid_input'); this.status = status; }
}

// 只按实际流过的字节计数，不信客户端的 Content-Length
async function readBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError(400);
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new InputError(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new InputError(400); }
}

const str = (v, max) => typeof v === 'string' && new TextEncoder().encode(v).length <= max;
const optDate = (v) => v === null || v === undefined || v === '' || (typeof v === 'string' && DATE_RE.test(v));

function sanitizeWishlist(input) {
  if (!Array.isArray(input)) throw new InputError(400);
  if (input.length > MAX_WISH) throw new InputError(413);
  const out = [];
  const seen = new Set();
  for (const item of input) {
    if (!item || typeof item !== 'object') throw new InputError(400);
    const id = item.id;
    if (!str(id, 64) || !PROG_ID.test(id) || seen.has(id)) throw new InputError(400);
    seen.add(id);
    out.push({ id, addedAt: Number.isFinite(item.addedAt) ? Math.trunc(item.addedAt) : Date.now() });
  }
  return out;
}

function sanitizeTracks(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError(400);
  const keys = Object.keys(input);
  if (keys.length > MAX_TRACKS) throw new InputError(413);
  const out = {};
  for (const key of keys) {
    if (!str(key, 64) || !PROG_ID.test(key)) throw new InputError(400);
    const t = input[key];
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new InputError(400);
    if (!STATUSES.includes(t.status)) throw new InputError(400);
    if (!PRIORITIES.includes(t.priority ?? '')) throw new InputError(400);
    for (const f of ['deadline', 'submittedAt', 'interviewAt', 'resultAt']) {
      if (!optDate(t[f])) throw new InputError(400);
    }
    if (!str(t.note ?? '', MAX_NOTE)) throw new InputError(413);
    const materials = {};
    const src = t.materials && typeof t.materials === 'object' && !Array.isArray(t.materials) ? t.materials : {};
    for (const m of MATERIALS) materials[m] = src[m] === true;
    out[key] = {
      status: t.status,
      priority: t.priority ?? '',
      deadline: t.deadline || '',
      submittedAt: t.submittedAt || '',
      interviewAt: t.interviewAt || '',
      resultAt: t.resultAt || '',
      note: t.note ?? '',
      materials,
      updatedAt: Number.isFinite(t.updatedAt) ? Math.trunc(t.updatedAt) : Date.now(),
    };
  }
  return out;
}

// 只回传白名单字段，避免把数据库内部列泄给浏览器
const projectState = (row) => ({
  wishlist: row.wishlist,
  tracks: row.tracks,
  version: Number(row.version),
  updatedAt: row.updated_at,
});

export async function handleTrack({ request, supabase }) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'me') {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' });
    try {
      const user = getUser(request);   // 匿名访客返回 null，不报错：前端据此判断能否在线保存
      return json({ backend: 'ok', user: user ? { id: user.user_id, name: user.name, picture: user.picture } : null });
    } catch (error) {
      if (error instanceof UserContextError) return json({ error: error.code }, error.status);
      return json({ error: 'state_unavailable' }, 503);
    }
  }

  if (action !== 'load' && action !== 'save') return json({ error: 'not_found' }, 404);
  if (action === 'load' && request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' });
  if (action === 'save' && request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { allow: 'POST' });

  let writing = false;
  try {
    const user = requireUser(request);

    if (action === 'load') {
      const result = await supabase.from('track_state')
        .select('user_id,wishlist,tracks,version,updated_at')
        .eq('user_id', user.user_id)
        .maybeSingle();
      if (result.error) return json({ error: 'state_unavailable' }, 503);
      if (!result.data) return json({ empty: true, version: 0 });
      if (result.data.user_id !== user.user_id) return json({ error: 'state_unavailable' }, 503);
      return json({ empty: false, ...projectState(result.data) });
    }

    // ---- save ----
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      return json({ error: 'invalid_input' }, 415);
    }
    const input = await readBody(request, MAX_BODY);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError(400);
    const baseVersion = input.baseVersion;
    if (!Number.isSafeInteger(baseVersion) || baseVersion < 0) throw new InputError(400);
    const wishlist = sanitizeWishlist(input.wishlist);
    const tracks = sanitizeTracks(input.tracks);
    const now = new Date().toISOString();
    const nextVersion = baseVersion + 1;

    writing = true;
    // 版本化写入：同时按 user_id 与期望版本过滤，并检查受影响行数，
    // 版本不符说明另一台设备已写过，返回 409 让前端调和，绝不静默覆盖。
    const updated = await supabase.from('track_state')
      .update({ wishlist, tracks, version: nextVersion, updated_at: now })
      .eq('user_id', user.user_id)
      .eq('version', baseVersion)
      .select('user_id,wishlist,tracks,version,updated_at')
      .maybeSingle();
    if (updated.error) return json({ error: writeCode(updated.error.code) }, 503);

    if (updated.data) {
      if (updated.data.user_id !== user.user_id) return json({ error: 'state_unavailable' }, 503);
      return json({ ok: true, ...projectState(updated.data) });
    }

    // 未命中：要么行不存在（首次保存），要么版本已被推进（冲突）
    const current = await supabase.from('track_state')
      .select('user_id,wishlist,tracks,version,updated_at')
      .eq('user_id', user.user_id)
      .maybeSingle();
    if (current.error) return json({ error: 'write_result_unknown' }, 503);

    if (current.data) {
      if (current.data.user_id !== user.user_id) return json({ error: 'state_unavailable' }, 503);
      return json({ error: 'conflict', cloud: projectState(current.data) }, 409);
    }

    if (baseVersion !== 0) return json({ error: 'invalid_input' }, 400);
    const inserted = await supabase.from('track_state')
      .insert({ user_id: user.user_id, wishlist, tracks, version: nextVersion, updated_at: now })
      .select('user_id,wishlist,tracks,version,updated_at')
      .maybeSingle();
    if (inserted.error) {
      // 主键冲突＝并发首次写入，按冲突处理让前端重读，不自动重放写入
      return json({ error: inserted.error.code === '23505' ? 'conflict' : writeCode(inserted.error.code) },
        inserted.error.code === '23505' ? 409 : 503);
    }
    if (!inserted.data || inserted.data.user_id !== user.user_id) {
      return json({ error: 'write_result_unknown' }, 503);
    }
    return json({ ok: true, ...projectState(inserted.data) });
  } catch (error) {
    if (error instanceof InputError) return json({ error: 'invalid_input' }, error.status);
    if (error instanceof UserContextError) return json({ error: error.code }, error.status);
    // 写入阶段失败一律报「结果未知」：网络/超时无法区分是否已提交，前端不得自动重放
    return json({ error: writing ? 'write_result_unknown' : 'state_unavailable' }, 503);
  }
}

// 只暴露固定的应用级错误码，绝不回传 SQL、键值或原始 provider 报错
function writeCode(code) {
  return typeof code === 'string' && /^(22|23|42)[A-Z0-9]{3}$/.test(code) ? 'write_rejected' : 'write_result_unknown';
}
