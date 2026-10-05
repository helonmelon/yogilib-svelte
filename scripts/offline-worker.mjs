import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
async function walk(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true }))
    if (e.isDirectory()) result.push(...(await walk(join(dir, e.name))));
    else result.push(join(dir, e.name));
  return result;
}
const paths = await walk('static/offline');
const hash = createHash('sha256');
for (const p of paths) hash.update(await readFile(p));
const version = hash.digest('hex').slice(0, 16);
const urls = paths.map((p) => '/' + p.replace(/^static\//, ''));
await writeFile(
  'static/service-worker.js',
  `const CACHE='yogilib-offline-${version}',ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yogilib-offline-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;if(ASSETS.includes(u.pathname)){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));return;}if(e.request.mode==='navigate')e.respondWith(fetch(e.request).catch(()=>caches.match('/offline/index.html')));});
`,
);
console.log(
  'Offline shell prepared. Private server responses are never cached.',
);
