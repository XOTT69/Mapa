const CACHE='mapa-atlas-v19';
const CORE=['/','/index.html','/app.js','/user-features.js','/map-icons.js','/threats-layer.js','/vendor/leaflet/leaflet.js','/vendor/leaflet/leaflet.css','/alert-logic.js','/regions.js','/styles.css','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png','/apple-touch-icon.png','/ukraine-oblasts.geojson','/ukraine-raions.geojson'];
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
 }).catch(()=>caches.match(event.request).then(cached=>cached||(event.request.mode==='navigate'?caches.match('/index.html'):Response.error()))));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 let url=new URL('/',self.location.origin);
 try{const target=new URL(event.notification.data?.url||'/',self.location.origin);if(target.origin===self.location.origin)url=target}catch{}
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const client=windows.find(window=>new URL(window.url).origin===self.location.origin);
  if(client){await client.navigate(url.href);return client.focus()}
  return self.clients.openWindow(url.href);
 }));
});
