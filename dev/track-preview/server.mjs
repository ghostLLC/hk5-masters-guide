// 本地开发专用：静态站点 + 合成身份的 Function 代理。
// 内存存储，重启即清空；会丢弃调用方自带的身份头，只按 fixture cookie 注入。
// 不要部署此文件。用法：node dev/track-preview/server.mjs 8000
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.argv[2] ?? 8000);
const ROOT = resolve(import.meta.dirname, '..', '..');
const { handleTrack } = await import(pathToFileURL(resolve(ROOT, 'functions/handler.mjs')).href);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

// rows: user_id -> { user_id, wishlist, tracks, version, updated_at }
const rows = new Map();
let failNextWrite = null;   // 由 ?fault= 触发，用于测试写入失败/未知结果分支

const COLUMNS = ['user_id', 'wishlist', 'tracks', 'version', 'updated_at'];
const project = (row) => { const o = {}; for (const c of COLUMNS) o[c] = row[c]; return o; };

function fakeSupabase(who) {
  const makeQuery = () => {
    const q = {
      _filters: {}, _payload: null, _op: null,
      select() { return this; },
      eq(col, val) { this._filters[col] = val; return this; },
      update(payload) { this._op = 'update'; this._payload = payload; return this; },
      insert(payload) { this._op = 'insert'; this._payload = payload; return this; },
      async maybeSingle() {
        if (failNextWrite && this._op) { const f = failNextWrite; failNextWrite = null; return { data: null, error: f }; }
        if (this._op === 'insert') {
          const uid = this._payload.user_id;
          if (rows.has(uid)) return { data: null, error: { code: '23505' } };   // 主键冲突
          const row = { ...this._payload };
          rows.set(uid, row);
          return { data: project(row), error: null };
        }
        if (this._op === 'update') {
          const uid = this._filters.user_id;
          const cur = rows.get(uid);
          if (!cur) return { data: null, error: null };
          // 版本化 CAS：任一过滤条件不匹配即视为 0 行受影响
          for (const [k, v] of Object.entries(this._filters)) if (cur[k] !== v) return { data: null, error: null };
          Object.assign(cur, this._payload);
          return { data: project(cur), error: null };
        }
        const uid = this._filters.user_id;
        const cur = rows.get(uid);
        return { data: cur ? project(cur) : null, error: who === 'dberror' ? { code: 'XX000' } : null };
      }
    };
    return q;
  };
  return { from: () => makeQuery() };
}

const contextHeader = (who) => Buffer.from(JSON.stringify({
  user_id: `fixture-${who}`, site_id: 'fixture-site', host_id: 'fixture-host',
  name: `测试用户 ${who}`, picture: '', session_expires_at: Math.floor(Date.now() / 1000) + 600
})).toString('base64url');

async function handleFunction(incoming, url, outgoing) {
  // 切换身份：/functions/v1/app?action=me&fixture=A （A/B/anonymous/dberror）
  const fixture = url.searchParams.get('fixture');
  if (fixture && ['A', 'B', 'anonymous', 'dberror'].includes(fixture) && incoming.method === 'GET') {
    outgoing.writeHead(200, { 'set-cookie': `track_fixture=${fixture}; Path=/; SameSite=Strict`, 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end(`本地测试身份已切换为：${fixture}。回到页面刷新即可。`);
    return;
  }
  const fault = url.searchParams.get('fault');
  if (fault === 'timeout') failNextWrite = { code: '57014' };
  if (fault === 'reject') failNextWrite = { code: '23514' };

  const who = /(?:^|;\s*)track_fixture=(A|B|anonymous|dberror)(?:;|$)/.exec(incoming.headers.cookie ?? '')?.[1] ?? 'anonymous';
  const headers = new Headers({ 'content-type': incoming.headers['content-type'] ?? '' });
  // 只注入网关身份，丢弃调用方自带的任何 x-qoder-* / 租户头
  // dberror 也是已登录用户，只是数据库读会失败——否则测不到 503 分支
  if (who !== 'anonymous') headers.set('x-qoder-user-context', contextHeader(who));

  const chunks = [];
  let size = 0;
  for await (const chunk of incoming) { size += chunk.length; if (size > 1048576) { outgoing.writeHead(413); outgoing.end(); return; } chunks.push(chunk); }
  const init = { method: incoming.method, headers };
  if (incoming.method === 'POST') init.body = Buffer.concat(chunks);
  const request = new Request(url, init);

  const response = await handleTrack({ request, supabase: fakeSupabase(who) });
  const buf = Buffer.from(await response.arrayBuffer());
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(buf);
}

async function serveStatic(pathname, outgoing) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = resolve(ROOT, normalize(rel));
  // 路径穿越防护：必须仍在项目根目录内
  if (file !== ROOT && !file.startsWith(ROOT + sep)) { outgoing.writeHead(403); outgoing.end('Forbidden'); return; }
  try {
    const buf = await readFile(file);
    outgoing.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    outgoing.end(buf);
  } catch {
    outgoing.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end('Not found');
  }
}

createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname.startsWith('/functions/v1/app')) await handleFunction(incoming, url, outgoing);
    else await serveStatic(url.pathname, outgoing);
  } catch (err) {
    if (!outgoing.headersSent) outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end('本地测试服务异常：' + (err && err.message ? err.message : 'unknown'));
  }
}).listen(PORT, '127.0.0.1', function () {
  console.log(`本地预览（含 Function 代理）: http://127.0.0.1:${this.address().port}/`);
  console.log(`切换测试身份: /functions/v1/app?action=me&fixture=A | B | anonymous | dberror`);
  console.log(`注入写入故障: 在 save 请求上加 &fault=timeout（结果未知）或 &fault=reject（被拒）`);
});
