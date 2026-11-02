import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function collect(folder, prefix = '') {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await collect(path.join(folder, entry.name), relative + '/'));
    else if (entry.name !== 'sw.js') files.push(relative);
  }
  return files;
}
const files = (await collect('dist')).sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(path.join('dist', file)));
const cache = `starship-${hash.digest('hex').slice(0, 16)}`;
const worker = `const CACHE=${JSON.stringify(cache)}, FILES=${JSON.stringify(['./', ...files.map(f => './' + f)])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('starship-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).catch(error=>{if(event.request.mode==='navigate')return caches.match('./index.html');throw error;})));});
`;
await writeFile(path.join('dist', 'sw.js'), worker);
console.log(`Offline cache generated: ${files.length} assets, ${cache}.`);
