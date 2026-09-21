// 原型预览用静态服务器。从项目根目录服务，使 prototypes/vX/ 下的 ../../data.js 能解析。
// 用法：node dev/proto-server.mjs 8010   然后打开 http://127.0.0.1:8010/prototypes/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';

const PORT = Number(process.argv[2] ?? 8010);
const ROOT = resolve(import.meta.dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = resolve(ROOT, normalize(rel));
    // 路径穿越防护：必须仍在项目根内
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403); res.end('Forbidden'); return; }
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', function () {
  console.log(`原型预览: http://127.0.0.1:${this.address().port}/prototypes/`);
});
