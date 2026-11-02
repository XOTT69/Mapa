const CACHE='mapa-atlas-v12';
const CORE=['/','/index.html','/app.js','/alert-logic.js','/regions.js','/styles.css','/manifest.webmanifest','/icon.svg','/ukraine-oblasts.geojson','/ukraine-raions.geojson'];
const BORDERS=new Set(['/ukraine-oblasts.geojson','/ukraine-raions.geojson']);
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(BORDERS.has(url.pathname)){
   event.respondWith(caches.match(event.request).then(found=>found||fetch(event.request).then(res=>{
     if(res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
     return res;
   })));
   return;
 }
 event.respondWith(fetch(event.request).then(res=>{
   if(res.ok&&CORE.includes(url.pathname)){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
   return res;
 }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('/index.html'))));
});