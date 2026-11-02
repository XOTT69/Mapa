import {regions as oblastAnchors} from './regions.js';
import {TYPES,THREATS,norm,validStart,duration,cleanAlerts,matchesFilter,classifyRegion,threatSummary} from './alert-logic.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const show=(id,value)=>{$(id).hidden=!value};
const formatClock=date=>new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
const typeLabel=alert=>TYPES[alert.alert_type]||'Інше повідомлення';
const threatLabel=code=>THREATS[code]||'Загроза: '+code;
const categoryColor={red:'#f04c69',yellow:'#eeb054',partial:'#eeb054',other:'#90a6e7',quiet:'#21496c'};
const debounce=(callback,ms)=>{let timer;return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>callback(...args),ms)}};
const state={mode:'oblast',filter:'all',tab:'alerts',alerts:[],updatedAt:null,stale:false,ready:false,drawer:false,
  geo:{oblast:null,raion:null},layers:{oblast:null,raion:null},selected:null,showThreats:true,tiles:false,
  showDemo:false,demoSpeed:1,demoEpoch:null,demoFrame:null,demoMarkers:[],demoLayer:null};
let toastTimer=null;
const map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true,minZoom:5,maxZoom:12}).setView([48.65,31.45],6);
L.control.zoom({position:'bottomright'}).addTo(map);
const tileLayer=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
  attribution:'© OpenStreetMap contributors · © CARTO',maxZoom:18
});
const threatLayer=L.layerGroup().addTo(map);
const nameLayer=L.layerGroup().addTo(map);
const demoLayer=L.layerGroup();
state.demoLayer=demoLayer;
const anchorMap=new Map(oblastAnchors.map(([name,lat,lng])=>[norm(name),[lat,lng]]));
const knownRegions=new Map();
const favoriteKey='mapa-favorites-v2';
function readFavorites(){try{const raw=JSON.parse(localStorage.getItem(favoriteKey)||'[]');return new Set(Array.isArray(raw)?raw.filter(x=>typeof x==='string'):[])}catch{return new Set()}}
const favorites=readFavorites();
function saveFavorites(){try{localStorage.setItem(favoriteKey,JSON.stringify([...favorites]))}catch{}}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('visible');if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),4000)}
function regionKey(region){return region.type+'|'+norm(region.oblast||'')+'|'+norm(region.name)}
function regionFromFeature(feature,mode){
  const name=String(feature.properties?.name||'Невідомий регіон');
  const oblast=mode==='oblast'?name:String(feature.properties?.oblast||'');
  return {name,oblast,type:mode};
}
function regionData(region){return classifyRegion(state.alerts,region,state.filter)}
function statusLabel(severity){return ({red:'Активна тривога',yellow:'Жовтий рівень загрози',partial:'Часткова тривога',other:'Інше активне повідомлення',quiet:'Активних повідомлень не знайдено'})[severity]}
function featureStyle(feature,mode){
 const stateFor=regionData(regionFromFeature(feature,mode));
 return {color:stateFor.severity==='quiet'?'#4e7a9e':'#b2d9ff',opacity:0.92,weight:map.getZoom()>7?1.55:1.15,
   fillColor:categoryColor[stateFor.severity],fillOpacity:stateFor.severity==='quiet'?.76:.88};
}
function registerLayer(data,mode){
 if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length<(mode==='oblast'?20:100))throw Error('Неповний GeoJSON');
 for(const feature of data.features){const region=regionFromFeature(feature,mode);knownRegions.set(regionKey(region),region)}
 const layer=L.geoJSON(data,{
   style:f=>featureStyle(f,mode),
   onEachFeature:(feature,shape)=>{
     const region=regionFromFeature(feature,mode);
     shape.bindTooltip(esc(region.name),{sticky:true,direction:'auto',className:'map-tooltip'});
     shape.on('click',()=>openRegion(region));
     shape.on('mouseover',()=>shape.setStyle({color:'#f0faff',weight:2.4}));
     shape.on('mouseout',()=>shape.setStyle(featureStyle(feature,mode)));
   }
 });
 return layer;
}
async function loadBoundaries(mode){
 if(state.layers[mode])return state.layers[mode];
 const file=mode==='oblast'?'/ukraine-oblasts.geojson':'/ukraine-raions.geojson';
 const response=await fetch(file,{cache:'force-cache'});
 if(!response.ok)throw Error('GeoJSON: '+response.status);
 const data=await response.json();
 state.geo[mode]=data;
 state.layers[mode]=registerLayer(data,mode);
 return state.layers[mode];
}
function recolor(){
 const layer=state.layers[state.mode];if(!layer)return;
 layer.eachLayer(l=>l.setStyle(featureStyle(l.feature,state.mode)));
 refreshLabels();refreshThreatMarkers();
}
async function switchMode(mode,first=false){
 if(mode!=='oblast'&&mode!=='raion')return;
 state.mode=mode;
 for(const m of ['oblast','raion']){$('mode-'+m).classList.toggle('on',m===mode);$('mode-'+m).setAttribute('aria-pressed',String(m===mode))}
 $('map-status').classList.remove('error');
 $('map-status').textContent=mode==='oblast'?'Завантаження областей…':'Завантаження 136 районів…';
 try{
   const target=await loadBoundaries(mode);
   for(const m of ['oblast','raion']){const layer=state.layers[m];if(layer&&map.hasLayer(layer))map.removeLayer(layer)}
   target.addTo(map);target.bringToFront();
   $('map-status').textContent=(mode==='oblast'?'25 областей':'136 районів')+' · межі завантажено';
   recolor();
   if(first){const bounds=target.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:7})}
   renderPanel();
 }catch(error){
   console.error('Region geometry failed:',error);
   $('map-status').classList.add('error');
   $('map-status').textContent='Межі недоступні — перевірте з’єднання';
   toast('Не вдалося завантажити межі. Спробуйте перемкнути шар.');
 }
}
function refreshLabels(){
 nameLayer.clearLayers();
 if(state.mode!=='oblast'||map.getZoom()<6||window.innerWidth<760)return;
 for(const [name,lat,lng] of oblastAnchors){
   if(name==='м. Київ'||name==='м. Севастополь')continue;
   const short=name.replace(/ область$/,'').replace(/^Автономна Республіка /,'');
   L.marker([lat,lng],{interactive:false,zIndexOffset:50,icon:L.divIcon({
    className:'region-label',html:'<span>'+esc(short)+'</span>',iconSize:[110,18],iconAnchor:[55,9]
   })}).addTo(nameLayer);
 }
}
function refreshThreatMarkers(){
 threatLayer.clearLayers();
 if(!state.showThreats||!state.ready)return;
 // Only regional categories from alerts.in.ua; these markers are NOT target positions.
 for(const [name,lat,lng] of oblastAnchors){
   const region={type:'oblast',name,oblast:name};
   const data=classifyRegion(state.alerts,region,'all');
   if(!data.count)continue;
   const threatTypes=threatSummary(data.alerts);
   let category=null,icon=null;
   if(threatTypes.includes('drones')){category='drone';icon='◇'}
   else if(threatTypes.some(t=>t.includes('missiles'))){category='missile';icon='⌁'}
   if(!category)continue;
   const label=category==='drone'?'БпЛА':'Ракети';
   const marker=L.marker([lat,lng],{zIndexOffset:260,icon:L.divIcon({
      className:'threat-icon',html:'<div class="threat-bubble '+category+'">'+icon+' '+label+'</div>',
      iconSize:[78,25],iconAnchor:[39,14]
    })});
   marker.bindTooltip('Регіональна загроза: '+label+'. Не координати цілі.');
   marker.on('click',()=>openRegion(region));
   marker.addTo(threatLayer);
 }
}
function regionStart(data){return data.startedAt??null}
function renderDetail(){
 if(!state.selected){show('details',false);return}
 const region=state.selected,info=regionData(region),key=regionKey(region),fav=favorites.has(key);
 const alertsSorted=[...info.alerts].sort((a,b)=>(validStart(a.started_at)||Infinity)-(validStart(b.started_at)||Infinity));
 const parent=region.type==='raion'?esc(region.oblast)+' · район':'Область';
 const inner=alertsSorted.slice(0,22).map(a=>{
   const codes=threatSummary([a]);
   const label=typeLabel(a);
   const start=validStart(a.started_at);
   return '<div class="detail-source"><b>'+esc(label)+'</b> · '+esc(a.location_title)+
    (codes.length?'<br>'+codes.map(code=>esc(threatLabel(code))).join(' · '):'')+
    '<small>'+(start?'Початок: '+formatClock(new Date(start))+' · <span data-duration="'+start+'">'+duration(start)+'</span>':'Час початку невідомий')+'</small></div>'
 }).join('');
 $('details').innerHTML='<div class="detail-header"><div><div class="eyebrow">'+parent+'</div><div class="detail-title">'+esc(region.name)+'</div></div>'+
    '<button class="detail-close" type="button" id="details-close" aria-label="Закрити">✕</button></div>'+
    '<div class="detail-status"><i class="status-bullet '+info.severity+'"></i>'+esc(statusLabel(info.severity))+'</div>'+
    '<div class="detail-timer">'+(info.startedAt?'<span data-duration="'+info.startedAt+'">'+duration(info.startedAt)+'</span>':'—')+
    '<small>'+(info.startedAt?'Від найранішого активного повідомлення':'Час активної тривоги не встановлений')+'</small></div>'+
    (inner?'<div class="detail-sources">'+inner+'</div>':'<p class="section-note">У поточній відповіді API немає активних повідомлень для цієї території.</p>')+
    '<div class="detail-footer"><button class="small-btn" id="details-star" type="button">'+(fav?'★ Прибрати з обраного':'☆ В обране')+'</button>'+
    '<button class="small-btn" id="details-panel" type="button">☰ Інформація</button></div>'+
    '<p class="detail-note">Розфарбування адміністративної одиниці не означає, що загроза рівномірна на всій території. Для безпеки звіряйтеся з офіційними сповіщеннями.</p>';
 show('details',true);
 $('details-close').onclick=()=>{state.selected=null;show('details',false)};
 $('details-star').onclick=()=>{favorites.has(key)?favorites.delete(key):favorites.add(key);saveFavorites();renderDetail();renderPanel();toast(favorites.has(key)?'Регіон додано в обране':'Регіон прибрано з обраного')};
 $('details-panel').onclick=()=>openDrawer('alerts');
}
function openRegion(region){
 state.selected=region;
 renderDetail();
 closeDrawer();
}
function zoomToRegion(region){
 const targetMode=region.type;
 if(state.mode!==targetMode){switchMode(targetMode).then(()=>focusFeature(region))}
 else focusFeature(region);
}
function focusFeature(region){
 const layer=state.layers[region.type];
 if(!layer){openRegion(region);return}
 let found=null;
 layer.eachLayer(shape=>{const r=regionFromFeature(shape.feature,region.type);if(regionKey(r)===regionKey(region))found=shape});
 if(found&&found.getBounds().isValid())map.fitBounds(found.getBounds(),{padding:[50,50],maxZoom:9});
 openRegion(region);
}
function card(region){
 const info=regionData(region),active=info.count;
 const desc=region.type==='raion'?region.oblast:statusLabel(info.severity);
 return '<button class="region-card '+info.severity+'" data-region="'+esc(regionKey(region))+'">'+
   '<span class="region-card-head"><b>'+esc(region.name)+'</b><em>'+
   (favorites.has(regionKey(region))?'★ ':'')+(active?active+' повідомл.':'')+'</em></span>'+
   '<small>'+esc(desc)+(info.startedAt?' · триває <span data-duration="'+info.startedAt+'">'+duration(info.startedAt)+'</span>':'')+'</small></button>';
}
function bindCards(root){
 root.querySelectorAll('[data-region]').forEach(el=>el.onclick=()=>{const r=knownRegions.get(el.dataset.region);if(r)zoomToRegion(r)});
}
function renderPanel(){
 const base=(state.geo[state.mode]?.features||[]).map(f=>regionFromFeature(f,state.mode));
 const unique=[...new Map(base.map(r=>[regionKey(r),r])).values()];
 const active=unique.filter(r=>regionData(r).count>0).sort((a,b)=>{
   const left=regionData(a),right=regionData(b);
   return right.count-left.count||a.name.localeCompare(b.name,'uk');
 });
 $('alert-list').innerHTML=active.length?active.map(card).join(''):'<p class="section-note">'+(state.ready?'Немає активних повідомлень для цього фільтра.':'Дані тривог завантажуються…')+'</p>';
 bindCards($('alert-list'));
 const q=norm($('region-search').value);
 const searched=unique.filter(r=>!q||norm(r.name).includes(q)||norm(r.oblast).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'uk'));
 $('region-list').innerHTML=searched.slice(0,145).map(card).join('');
 bindCards($('region-list'));
 // Favorites can contain objects for either geographic layer, even if current layer differs.
 const favRegions=[...favorites].map(key=>knownRegions.get(key)).filter(Boolean);
 $('favorite-list').innerHTML=favRegions.length?favRegions.map(card).join(''):'<p class="section-note">Натисніть на область чи район і додайте його в обране.</p>';
 bindCards($('favorite-list'));
}
function updateCounts(){
 const oblasts=state.geo.oblast?.features||[];
 const count=oblasts.filter(f=>classifyRegion(state.alerts,regionFromFeature(f,'oblast'),'all').count>0).length;
 $('oblast-count').textContent=state.ready?String(count):'—';
 $('alert-count').textContent=state.ready?String(state.alerts.length):'—';
}
function updateDurations(){
 for(const node of document.querySelectorAll('[data-duration]')){
   const started=Number(node.dataset.duration);
   node.textContent=Number.isFinite(started)?duration(started):'час невідомий';
 }
 const now=formatClock(new Date());
 $('clock').textContent='КИЇВ · '+now;
}
function connectionStatus(kind,text){
 const el=$('connection');
 el.className='connection is-'+kind;
 el.querySelector('span').textContent=text;
 $('footer-status').textContent=text;
}
async function fetchAlerts(){
 $('refresh').disabled=true;
 try{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),14000);
   let response;
   try{response=await fetch('/api/alerts',{cache:'no-store',signal:controller.signal})}finally{clearTimeout(timeout)}
   const payload=await response.json();
   if(!response.ok)throw new Error(payload.error||'HTTP '+response.status);
   const items=cleanAlerts(payload.alerts);
   state.alerts=items;
   state.updatedAt=payload.updatedAt||new Date().toISOString();
   state.stale=Boolean(payload.stale);
   state.ready=true;
   connectionStatus(state.stale?'stale':'live',state.stale?'Застарілі дані':'Онлайн');
   $('sync-time').textContent=formatClock(new Date(state.updatedAt));
   $('list-timestamp').textContent='Оновлено '+formatClock(new Date(state.updatedAt));
   updateCounts();recolor();renderPanel();renderDetail();updateDurations();
 }catch(error){
   console.error('alerts API error:',error);
   state.stale=true;
   connectionStatus('error','Немає даних');
   $('sync-time').textContent=state.updatedAt?'Останні: '+formatClock(new Date(state.updatedAt)):'Немає даних';
   if(!state.ready){$('oblast-count').textContent='—';$('alert-count').textContent='—'}
 }finally{$('refresh').disabled=false}
}
function openDrawer(tab=state.tab){
 state.drawer=true;
 $('drawer').classList.add('open');
 $('drawer').setAttribute('aria-hidden','false');
 $('menu-open').setAttribute('aria-expanded','true');
 show('drawer-backdrop',true);
 switchTab(tab);
}
function closeDrawer(){
 if(!state.drawer)return;
 state.drawer=false;
 $('drawer').classList.remove('open');
 $('drawer').setAttribute('aria-hidden','true');
 $('menu-open').setAttribute('aria-expanded','false');
 show('drawer-backdrop',false);
}
function switchTab(tab){
 state.tab=tab;
 for(const button of document.querySelectorAll('[data-tab]'))button.classList.toggle('on',button.dataset.tab===tab);
 for(const name of ['alerts','regions','favorites','about'])show('tab-'+name,name===tab);
 if(tab==='regions')$('region-search').focus();
}
const demoRoutes=[
 [[48.18,26.22],[48.75,27.45],[49.14,28.12],[49.00,29.12]],
 [[47.45,33.00],[48.10,32.40],[48.58,31.60],[48.44,30.85]],
 [[50.42,34.00],[49.88,33.62],[49.38,33.05],[49.00,32.22]]
];
function interpolate(route,progress){
 const index=Math.floor(progress),fraction=progress-index;
 const p1=route[index],p2=route[Math.min(index+1,route.length-1)];
 return [p1[0]+fraction*(p2[0]-p1[0]),p1[1]+fraction*(p2[1]-p1[1])];
}
function animateDemo(timestamp){
 if(!state.showDemo||document.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 if(state.demoEpoch===null)state.demoEpoch=timestamp;
 const step=(timestamp-state.demoEpoch)/16000*state.demoSpeed;
 demoRoutes.forEach((route,i)=>{
   const progress=(step+i*.6)%(route.length-1);
   state.demoMarkers[i]?.setLatLng(interpolate(route,progress));
 });
 state.demoFrame=requestAnimationFrame(animateDemo);
}
function toggleDemo(){
 state.showDemo=!state.showDemo;
 $('demo-toggle').classList.toggle('on',state.showDemo);
 $('demo-toggle').setAttribute('aria-pressed',String(state.showDemo));
 show('demo-ribbon',state.showDemo);
 if(state.demoFrame!==null)cancelAnimationFrame(state.demoFrame);
 state.demoFrame=null;state.demoEpoch=null;
 if(!state.showDemo){demoLayer.remove();return}
 if(!state.demoMarkers.length){
   for(const route of demoRoutes){
     L.polyline(route,{color:'#c7a1ff',weight:2,dashArray:'6 10',opacity:.8,interactive:false}).addTo(demoLayer);
     const marker=L.marker(route[0],{interactive:false,zIndexOffset:500,icon:L.divIcon({
       className:'demo-icon',html:'<div class="demo-object">◇<small>ДЕМО</small></div>',
       iconSize:[42,40],iconAnchor:[21,20]
     })}).addTo(demoLayer);
     state.demoMarkers.push(marker);
   }
 }
 demoLayer.addTo(map);
 if(!document.hidden){state.demoFrame=requestAnimationFrame(animateDemo)}
}
function initEvents(){
 $('menu-open').onclick=()=>openDrawer('alerts');
 $('menu-close').onclick=closeDrawer;
 $('drawer-backdrop').onclick=closeDrawer;
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeDrawer();state.selected=null;show('details',false)}});
 for(const m of ['oblast','raion'])$('mode-'+m).onclick=()=>switchMode(m);
 $('threat-toggle').onclick=()=>{
   state.showThreats=!state.showThreats;
   $('threat-toggle').classList.toggle('on',state.showThreats);
   $('threat-toggle').setAttribute('aria-pressed',String(state.showThreats));
   refreshThreatMarkers();
 };
 $('tiles-toggle').onclick=()=>{
   state.tiles=!state.tiles;
   $('tiles-toggle').classList.toggle('on',state.tiles);
   $('tiles-toggle').setAttribute('aria-pressed',String(state.tiles));
   if(state.tiles){tileLayer.addTo(map);tileLayer.bringToBack()}
   else map.removeLayer(tileLayer);
 };
 $('demo-toggle').onclick=toggleDemo;
 $('demo-speed').oninput=event=>{$('demo-speed-value').textContent=event.target.value+'×';state.demoSpeed=Number(event.target.value);state.demoEpoch=null};
 $('refresh').onclick=fetchAlerts;
 $('map-home').onclick=()=>{
   const layer=state.layers[state.mode];
   if(layer&&layer.getBounds().isValid())map.fitBounds(layer.getBounds(),{padding:[28,28],maxZoom:7});
   else map.setView([48.65,31.45],6);
 };
 $('map-locate').onclick=()=>map.locate({setView:true,maxZoom:9,enableHighAccuracy:false});
 map.on('locationerror',()=>toast('Не вдалося визначити місцеположення. Перевірте дозвіл браузера.'));
 map.on('zoomend',()=>{refreshLabels();const layer=state.layers[state.mode];if(layer)layer.eachLayer(l=>l.setStyle({weight:map.getZoom()>7?1.55:1.15}))});
 document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>switchTab(button.dataset.tab));
 document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{
   state.filter=button.dataset.filter;
   document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('on',b===button));
   recolor();renderPanel();renderDetail();
 });
 $('region-search').oninput=debounce(renderPanel,120);
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden){
     if(state.demoFrame!==null)cancelAnimationFrame(state.demoFrame);
     state.demoFrame=null;
   }else{
     if(state.showDemo){state.demoEpoch=null;state.demoFrame=requestAnimationFrame(animateDemo)}
     fetchAlerts();
   }
 });
}
initEvents();
switchMode('oblast',true);
fetchAlerts();
updateDurations();
setInterval(updateDurations,15000);
setInterval(()=>{if(!document.hidden)fetchAlerts()},45000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(error=>console.warn('PWA:',error));
