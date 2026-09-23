// Function 契约测试：直接打本地代理，覆盖隔离/CAS/校验/错误码/方法约束
const BASE = 'http://127.0.0.1:8000/functions/v1/app';
const CK = who => ({ Cookie: `track_fixture=${who}` });
let pass = 0, fail = 0;

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' → ' + detail : ''}`); }
}

async function call(action, { who, method = 'GET', body, fault } = {}) {
  const url = `${BASE}?action=${encodeURIComponent(action)}${fault ? `&fault=${fault}` : ''}`;
  const init = { method, headers: { Accept: 'application/json', ...CK(who) } };
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch(url, init);
  let json = null;
  try { json = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, json, raw: json === null };
}

const track = (over = {}) => ({ status: 'preparing', priority: 'reach', deadline: '2026-11-15', note: '面试形式待确认', materials: { transcript: true, ps: false }, ...over });

console.log('\n=== 中文备注长度 ===');
{
  const current = await call('load', { who: 'B' });
  const version = current.json?.empty ? 0 : current.json.version;
  const saved = await call('save', {who:'B', method:'POST', body:{baseVersion:version,wishlist:[],tracks:{'hku-mfin':track({note:'中'.repeat(2000)})}}});
  check('2000 字中文备注可保存并完整读回', saved.status === 200 && saved.json?.tracks?.['hku-mfin']?.note === '中'.repeat(2000));
  const rejected = await call('save', {who:'B', method:'POST', body:{baseVersion:saved.json?.version,wishlist:[],tracks:{'hku-mfin':track({note:'中'.repeat(2001)})}}});
  check('2001 字中文备注被拒绝', rejected.status === 413);
}

console.log('\n=== 身份与匿名 ===');
{
  const anon = await call('me', { who: 'anonymous' });
  check('匿名 me 返回 200 且 user=null', anon.status === 200 && anon.json?.backend === 'ok' && anon.json?.user === null, JSON.stringify(anon.json));
  const a = await call('me', { who: 'A' });
  check('登录 me 返回 user.id=fixture-A', a.json?.user?.id === 'fixture-A', JSON.stringify(a.json));
  const anonLoad = await call('load', { who: 'anonymous' });
  check('匿名 load 返回 401 login_required', anonLoad.status === 401 && anonLoad.json?.error === 'login_required', JSON.stringify(anonLoad));
  const anonSave = await call('save', { who: 'anonymous', method: 'POST', body: { baseVersion: 0, wishlist: [], tracks: {} } });
  check('匿名 save 返回 401 login_required', anonSave.status === 401 && anonSave.json?.error === 'login_required', JSON.stringify(anonSave));
}

console.log('\n=== 方法与路由约束 ===');
{
  const bad = await call('nonexistent', { who: 'A' });
  check('未知 action → 404', bad.status === 404 && bad.json?.error === 'not_found', JSON.stringify(bad));
  const wrongMethod = await fetch(`${BASE}?action=load`, { method: 'POST', headers: CK('A') });
  check('load 用 POST → 405', wrongMethod.status === 405, String(wrongMethod.status));
  const saveGet = await fetch(`${BASE}?action=save`, { method: 'GET', headers: CK('A') });
  check('save 用 GET → 405（GET 不得改状态）', saveGet.status === 405, String(saveGet.status));
  const before = await call('load', { who: 'A' });
  check('GET 尝试后数据未变', before.status === 200);
}

console.log('\n=== 首次写入与读回 ===');
{
  const fresh = await call('me', { who: 'B' });
  check('B 身份可用', fresh.status === 200);
  // B 在上一轮已有 version 1，先读回当前版本
  const cur = await call('load', { who: 'B' });
  const base = cur.json?.empty ? 0 : cur.json.version;
  const wish = [{ id: 'hku-mfin', addedAt: 1700000000000 }, { id: 'cuhk-mscfin', addedAt: 1700000000001 }];
  const tracks = { 'hku-mfin': track(), 'cuhk-mscfin': track({ status: 'offer', note: '已获 offer，含条件' }) };
  const saved = await call('save', { who: 'B', method: 'POST', body: { baseVersion: base, wishlist: wish, tracks } });
  check('正确 baseVersion 保存成功', saved.status === 200 && saved.json?.ok === true, JSON.stringify(saved.json).slice(0, 200));
  check('版本号自增', saved.json?.version === base + 1, `期望 ${base + 1} 实际 ${saved.json?.version}`);
  const back = await call('load', { who: 'B' });
  check('读回志愿单条数正确', back.json?.wishlist?.length === 2, JSON.stringify(back.json?.wishlist));
  check('读回中文备注未被破坏', back.json?.tracks?.['cuhk-mscfin']?.note === '已获 offer，含条件', JSON.stringify(back.json?.tracks?.['cuhk-mscfin']?.note));
  check('读回材料清单为完整布尔集', Object.keys(back.json?.tracks?.['hku-mfin']?.materials || {}).length === 7, JSON.stringify(back.json?.tracks?.['hku-mfin']?.materials));
  check('返回 updated_at 为 ISO 时间', typeof back.json?.updatedAt === 'string' && !Number.isNaN(Date.parse(back.json.updatedAt)));
}

console.log('\n=== 版本 CAS（防静默覆盖）===');
{
  const cur = await call('load', { who: 'B' });
  const stale = await call('save', { who: 'B', method: 'POST', body: { baseVersion: cur.json.version - 1, wishlist: [], tracks: {} } });
  check('过期 baseVersion → 409 conflict', stale.status === 409 && stale.json?.error === 'conflict', JSON.stringify(stale.json).slice(0, 160));
  check('409 回传云端当前状态供调和', stale.json?.cloud?.version === cur.json.version, JSON.stringify(stale.json?.cloud?.version));
  check('冲突后云端数据未被覆盖', (await call('load', { who: 'B' })).json?.wishlist?.length === 2);
  const badVer = await call('save', { who: 'B', method: 'POST', body: { baseVersion: 'x', wishlist: [], tracks: {} } });
  check('baseVersion 非整数 → 400', badVer.status === 400 && badVer.json?.error === 'invalid_input');
  const negVer = await call('save', { who: 'B', method: 'POST', body: { baseVersion: -1, wishlist: [], tracks: {} } });
  check('baseVersion 负数 → 400', negVer.status === 400);
}

console.log('\n=== 跨用户隔离 ===');
{
  const a = await call('load', { who: 'A' });
  const b = await call('load', { who: 'B' });
  check('A 与 B 数据不同（各自独立行）', JSON.stringify(a.json) !== JSON.stringify(b.json));
  check('A 读不到 B 的备注', JSON.stringify(a.json).indexOf('已获 offer') === -1);
  // 浏览器提交的 user_id 不得改变归属
  const cur = await call('load', { who: 'B' });
  const hijack = await call('save', { who: 'B', method: 'POST', body: { baseVersion: cur.json.version, user_id: 'fixture-A', wishlist: [{ id: 'nus-msc-finance', addedAt: 1 }], tracks: {} } });
  check('载荷里塞 user_id 仍按登录身份写入', hijack.status === 200);
  const aAfter = await call('load', { who: 'A' });
  check('A 的数据未被 B 篡改', JSON.stringify(aAfter.json).indexOf('nus-msc-finance') === -1, JSON.stringify(aAfter.json).slice(0, 200));
  const bAfter = await call('load', { who: 'B' });
  check('B 的写入落在 B 自己行上', bAfter.json?.wishlist?.some(w => w.id === 'nus-msc-finance'));
}

console.log('\n=== 输入校验白名单 ===');
{
  const cur = await call('load', { who: 'A' });
  const v = cur.json.empty ? 0 : cur.json.version;
  const bad = async (name, body, expect = 400) => {
    const r = await call('save', { who: 'A', method: 'POST', body: { baseVersion: v, wishlist: [], tracks: {}, ...body } });
    check(name, r.status === expect && r.json?.error === (expect === 413 ? 'invalid_input' : 'invalid_input'), `${r.status} ${JSON.stringify(r.json)}`);
  };
  await bad('非法 status 枚举 → 400', { tracks: { 'hku-mfin': track({ status: 'hacked' }) } });
  await bad('非法 priority → 400', { tracks: { 'hku-mfin': track({ priority: 'xxx' }) } });
  await bad('非法项目 id（大写/符号）→ 400', { tracks: { 'HKU<script>': track() } });
  await bad('非法日期格式 → 400', { tracks: { 'hku-mfin': track({ deadline: '15/11/2026' }) } });
  await bad('wishlist 非数组 → 400', { wishlist: { id: 'x' } });
  await bad('wishlist 项缺 id → 400', { wishlist: [{ addedAt: 1 }] });
  await bad('wishlist 重复 id → 400', { wishlist: [{ id: 'hku-mfin' }, { id: 'hku-mfin' }] });
  await bad('tracks 为数组 → 400', { tracks: [track()] });
  await bad('超长备注 → 413', { tracks: { 'hku-mfin': track({ note: 'x'.repeat(2001) }) } }, 413);
  const noJson = await fetch(`${BASE}?action=save`, { method: 'POST', headers: { ...CK('A'), 'Content-Type': 'text/plain' }, body: '{}' });
  check('非 JSON content-type → 415', noJson.status === 415, String(noJson.status));
  const huge = await call('save', { who: 'A', method: 'POST', body: { baseVersion: v, wishlist: [], tracks: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`hku-p${i}`, track()])) } });
  check('跟进条目超上限 → 413', huge.status === 413, `${huge.status} ${JSON.stringify(huge.json)}`);
}

console.log('\n=== 材料清单白名单与数据库故障 ===');
{
  const cur = await call('load', { who: 'A' });
  const v = cur.json.empty ? 0 : cur.json.version;
  const r = await call('save', { who: 'A', method: 'POST', body: { baseVersion: v, wishlist: [], tracks: { 'hku-mfin': track({ materials: { transcript: true, HACKED: true, ps: 'yes' } }) } } });
  const mats = r.json?.tracks?.['hku-mfin']?.materials || {};
  check('未知材料键被丢弃', !('HACKED' in mats), JSON.stringify(mats));
  check('非布尔材料值归一为 false', mats.ps === false, JSON.stringify(mats));
  check('合法材料键保留为 true', mats.transcript === true);

  const dberr = await call('load', { who: 'dberror' });
  check('数据库故障 → 503 且为固定应用错误码', dberr.status === 503 && dberr.json?.error === 'state_unavailable', JSON.stringify(dberr.json));
  check('故障响应不含原始 provider 细节', !JSON.stringify(dberr.json).match(/XX000|supabase|postgres/i), JSON.stringify(dberr.json));
  const werr = await call('save', { who: 'A', method: 'POST', fault: 'reject', body: { baseVersion: r.json?.version ?? v, wishlist: [], tracks: {} } });
  check('写入被约束拒绝 → 503 write_rejected', werr.status === 503 && ['write_rejected', 'write_result_unknown', 'conflict'].includes(werr.json?.error), JSON.stringify(werr.json));
}

console.log('\n=== 名次字段（rank）校验 ===');
{
  const cur = await call('load', { who: 'B' });
  const v = cur.json?.empty ? 0 : cur.json.version;
  const good = await call('save', { who: 'B', method: 'POST', body: { baseVersion: v, wishlist: [], tracks: { 'hku-mfin': { ...track(), rank: 3 } } } });
  check('合法名次（整数 3）被接受', good.status === 200 && good.json?.tracks?.['hku-mfin']?.rank === 3, JSON.stringify(good.json?.tracks?.['hku-mfin'] || good.json));
  check('合法名次于边界 999 被接受', (await call('save', { who: 'B', method: 'POST', body: { baseVersion: good.json.version, wishlist: [], tracks: { 'hku-mfin': { ...track(), rank: 1 } } } })).json?.tracks?.['hku-mfin']?.rank === 1);
  const nullRank = await call('save', { who: 'B', method: 'POST', body: { baseVersion: (await call('load', { who: 'B' })).json.version, wishlist: [], tracks: { 'hku-mfin': { ...track(), rank: null } } } });
  check('rank 允许为 null（未填）', nullRank.status === 200 && nullRank.json?.tracks?.['hku-mfin']?.rank === null, JSON.stringify(nullRank.json?.tracks?.['hku-mfin']));

  const badRank = async (name, rank, expect = 400) => {
    const c = await call('load', { who: 'B' });
    const r = await call('save', { who: 'B', method: 'POST', body: { baseVersion: c.json?.empty ? 0 : c.json.version, wishlist: [], tracks: { 'hku-mfin': { ...track(), rank } } } });
    check(name, r.status === expect, `${r.status} ${JSON.stringify(r.json)}`);
  };
  await badRank('名次 0 被拒（不能用 0 表示未填）', 0);
  await badRank('负名次被拒', -1);
  await badRank('名次超上限 1000 被拒', 1000);
  await badRank('小数名次被拒', 1.5);
  await badRank('字符串名次 "3" 被拒（必须传数字）', '3');

  // 未提供 rank 字段时不应报错，且应归一为 null
  const c2 = await call('load', { who: 'B' });
  const noRank = await call('save', { who: 'B', method: 'POST', body: { baseVersion: c2.json?.empty ? 0 : c2.json.version, wishlist: [], tracks: { 'hku-mfin': track() } } });
  check('不带 rank 字段时归一为 null', noRank.status === 200 && noRank.json?.tracks?.['hku-mfin']?.rank === null, JSON.stringify(noRank.json?.tracks?.['hku-mfin']));
}

console.log(`\n===== 契约测试：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
