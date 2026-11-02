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
const version = hash.digest('hex').slice(0, 16);
const worker = `const SCOPE=new URL(self.registration.scope), PREFIX='starship-'+encodeURIComponent(SCOPE.pathname)+'-';
const CACHE=PREFIX+${JSON.stringify(version)}, FILES=${JSON.stringify(['./', ...files.map(f => './' + f)])};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(event.request);
    if(hit)return hit;
    try{return await fetch(event.request);}
    catch(error){
      if(event.request.mode==='navigate'){
        const index=await cache.match(new URL('index.html',SCOPE));
        if(index)return index;
      }
      throw error;
    }
  }));
});
`;
await writeFile(path.join('dist', 'sw.js'), worker);
console.log(`Offline cache generated: ${files.length} assets, version ${version} (keys scoped to the deployment path).`);
