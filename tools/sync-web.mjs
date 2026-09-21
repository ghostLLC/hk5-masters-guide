// 生成 Qoder Sites 的发布目录 web/
//
// 为什么需要它：Qoder 的 prepare_site 要求 webDirectory 是「专门存放公开产物的目录」，
// 不能是项目根目录（根目录含 .scrape/、dev/、functions/ 等非公开内容）。
// 而 GitHub Pages 从 master 根目录托管，且 .scrape/ 下的采集脚本按 ../data.js 解析路径，
// 因此静态站点源文件必须留在根目录。web/ 只是发布用的产物副本，已 gitignore，
// prepare_site 按磁盘内容打包，不依赖它是否入库。
//
// 用法：node tools/sync-web.mjs
// 每次改动根目录静态文件后、部署 Qoder 前都要重跑。
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'web');
// 只放浏览器真正需要的文件；functions/ 由 functionDirectory 单独打包，dev/ 与 .scrape/ 不得进入
const FILES = ['index.html', 'styles.css', 'data.js', 'app.js', 'store.js', 'track.js'];

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

console.log('生成 Qoder 发布目录 web/：');
for (const name of FILES) {
  const src = resolve(ROOT, name);
  const buf = await readFile(src);
  await copyFile(src, resolve(OUT, name));
  console.log(`  ${name.padEnd(12)} ${(buf.length / 1024).toFixed(1).padStart(8)} KB  sha256:${sha(buf)}`);
}

// 发布前自检：产物必须完整且不含密钥/内部路径
const html = await readFile(resolve(OUT, 'index.html'), 'utf8');
const problems = [];
for (const f of FILES) {
  if (f.endsWith('.js') && !html.includes(`src="${f}"`)) problems.push(`index.html 未引用 ${f}`);
  if (f.endsWith('.css') && !html.includes(`href="${f}"`)) problems.push(`index.html 未引用 ${f}`);
}
// JS 依赖的关键节点，缺一个就会静默失效
const REQUIRED_IDS = [
  'results', 'facets', 'chips', 'resCount', 'moreWrap', 'sortSel',
  'trackBody', 'trackSummary', 'tFilter', 'tSort', 'tExportCsv',
  'syncBar', 'syncText', 'syncActions', 'reconcileBar',
  'sourceBody', 'sourceSummaryText', 'statusBar',
  'drawer', 'wishList', 'btnWish', 'backdrop', 'modal', 'toast'
];
for (const id of REQUIRED_IDS) {
  if (!html.includes(`id="${id}"`)) problems.push(`index.html 缺少必需节点 #${id}`);
}
for (const bad of ['SUPABASE_ANON_KEY', 'SUPABASE_URL', 'QODER_PAT', 'DATABASE_URL', '.scrape/', 'dev/track-preview', 'prototypes/']) {
  for (const f of FILES) {
    const t = await readFile(resolve(OUT, f), 'utf8');
    if (t.includes(bad)) problems.push(`${f} 含不应发布的内容：${bad}`);
  }
}
if (problems.length) {
  console.error('\n发布前自检未通过：');
  for (const p of problems) console.error('  ! ' + p);
  process.exit(1);
}
console.log(`\n自检通过：${FILES.length} 个文件齐备、脚本与样式引用完整、${REQUIRED_IDS.length} 个关键节点存在、无平台密钥与内部路径。`);
