const NAME='mapa-atlas-v7';
const OFFLINE=['/','/index.html','/app.js','/alert-logic.js','/regions.js','/styles.css','/manifest.webmanifest','/icon.svg','/ukraine-oblasts.geojson','/ukraine-raions.geojson'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(NAME).then(cache=>cache.addAll(OFFLINE)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==NAME).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html')));return}
 event.respondWith(caches.match(event.request).then(cache=>cache||fetch(event.request).then(response=>{
  if(response.ok&&OFFLINE.includes(url.pathname)){const clone=response.clone();caches.open(NAME).then(c=>c.put(event.request,clone))}
  return response
 })))
});