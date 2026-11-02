import {readUserData,upsertPlace,newPlaceId,placeTransitions,USER_STORAGE_KEY} from './user-features.js';
import {icon,threatSymbols,visibleThreatSymbols,toggleSymbolLayer,SYMBOL_LAYERS,SYMBOL_LABELS} from './map-icons.js';
import {regions as oblastAnchors} from './regions.js';
import {TYPES,THREATS,norm,validStart,duration,cleanAlerts,classifyRegion,threatSummary} from './alert-logic.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const show=(id,value)=>{$(id).hidden=!value};
const formatClock=date=>new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
const formatStart=date=>new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
const typeLabel=alert=>TYPES[alert.alert_type]||'Інше повідомлення';
const threatLabel=code=>THREATS[code]||'Загроза: '+code;
const categoryColor={red:'#ce555d',yellow:'#bc9450',partial:'#bc9450',other:'#8277aa',quiet:'#343b47'};
const debounce=(callback,ms)=>{let timer;return (...args)=>{clearTimeout(timer);timer=setTimeout(()=>callback(...args),ms)}};
const state={mode:'oblast',hiddenSymbols:new Set(),tab:'alerts',alerts:[],updatedAt:null,stale:false,ready:false,drawer:false,
  geo:{oblast:null,raion:null},layers:{oblast:null,raion:null},selected:null,showThreats:true,tiles:false,
  noticeSources:[],notices:[],noticesStatus:'loading',showNotices:true,fetching:false,modeRequest:0};
let toastTimer=null;
if(!window.L){$('map-error').hidden=false;$('map-error-title').textContent='Карта не завантажилась';$('map-error-text').textContent='Перевірте з’єднання та спробуйте ще раз.';$('map-retry').onclick=()=>location.reload();throw Error('Map library unavailable')}
const regionCache=new Map();
const boundaryPending={};
const map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true,minZoom:3,maxZoom:12,zoomSnap:.25}).setView([48.65,31.45],6);
L.control.zoom({position:'bottomright'}).addTo(map);
const tileLayer=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
  attribution:'© OpenStreetMap contributors · © CARTO',maxZoom:18
});
const threatLayer=L.layerGroup().addTo(map);
const nameLayer=L.layerGroup().addTo(map);
const noticeLayer=L.layerGroup().addTo(map);
const anchorMap=new Map(oblastAnchors.map(([name,lat,lng])=>[norm(name),[lat,lng]]));
const knownRegions=new Map();
const favoriteKey='mapa-favorites-v2';
const userData=readUserData({getItem:key=>localStorage.getItem(key)});
let previousFreshAlerts=null,previousFreshStamp=0,audioContext=null;
const themeMedia=window.matchMedia('(prefers-color-scheme: light)');
const resolvedTheme=()=>userData.preferences.theme==='system'?(themeMedia.matches?'light':'dark'):userData.preferences.theme;
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
function regionData(region){
 const key=regionKey(region);
 if(!regionCache.has(key))regionCache.set(key,classifyRegion(state.alerts,region));
 return regionCache.get(key);
}
function fitUkraine(){
 const layer=state.layers.oblast||state.layers[state.mode];
 if(layer&&layer.getBounds().isValid())map.fitBounds(layer.getBounds(),{paddingTopLeft:[16,130],paddingBottomRight:[16,160],maxZoom:6.5});
}
function allRegions(){
 const base=(state.geo[state.mode]?.features||[]).map(f=>regionFromFeature(f,state.mode));
 if(state.mode==='oblast')for(const [name] of oblastAnchors.filter(([name])=>name.startsWith('м.'))){
  const city={type:'oblast',name,oblast:name};knownRegions.set(regionKey(city),city);base.push(city);
 }
 return [...new Map(base.map(r=>[regionKey(r),r])).values()];
}
function statusLabel(severity){return ({red:'Активна тривога',yellow:'Жовтий рівень загрози',partial:'Часткова тривога',other:'Інше активне повідомлення',quiet:'Активних повідомлень не знайдено'})[severity]}
function featureStyle(feature,mode){
 const stateFor=regionData(regionFromFeature(feature,mode));
 const light=resolvedTheme()==='light';
 const palette=light?{red:'#e48991',yellow:'#e4c17e',partial:'#e4c17e',other:'#bcb0d1',quiet:'#d6dce5'}:categoryColor;
 return {color:stateFor.severity==='quiet'?(light?'#96a2b3':'#647080'):stateFor.severity==='partial'?(light?'#8d681f':'#e8c58a'):(light?'#a34c56':'#eda9aa'),opacity:.85,weight:map.getZoom()>7?1.25:.85,dashArray:stateFor.severity==='partial'?'3 3':null,
   fillColor:palette[stateFor.severity],fillOpacity:stateFor.severity==='quiet'?.9:.85};
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
     shape.on('mouseover',()=>shape.setStyle({color:'#d4edbb',weight:2.4}));
     shape.on('mouseout',()=>shape.setStyle(featureStyle(feature,mode)));
   }
 });
 return layer;
}
async function loadBoundaries(mode){
 if(state.layers[mode])return state.layers[mode];
 if(boundaryPending[mode])return boundaryPending[mode];
 boundaryPending[mode]=(async()=>{
 const file=mode==='oblast'?'/ukraine-oblasts.geojson':'/ukraine-raions.geojson';
 const response=await fetch(file,{cache:'force-cache',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('GeoJSON: '+response.status);
 const data=await response.json();
 state.geo[mode]=data;
 state.layers[mode]=registerLayer(data,mode);
 return state.layers[mode];
 })().finally(()=>{boundaryPending[mode]=null});
 return boundaryPending[mode];
}
function recolor(){
 regionCache.clear();
 const layer=state.layers[state.mode];if(!layer)return;
 layer.eachLayer(l=>l.setStyle(featureStyle(l.feature,state.mode)));
 refreshLabels();refreshThreatMarkers();refreshNotices();
}
async function switchMode(mode,first=false){
 if(mode!=='oblast'&&mode!=='raion')return;
 const request=++state.modeRequest;
 for(const m of ['oblast','raion']){$('mode-'+m).classList.toggle('on',m===mode);$('mode-'+m).setAttribute('aria-pressed',String(m===mode))}
 $('map-status').classList.remove('error');
 $('map-status').textContent=mode==='oblast'?'Завантаження областей…':'Завантаження 136 районів…';
 try{
   const target=await loadBoundaries(mode);
   if(request!==state.modeRequest)return;
   state.mode=mode;
   if(state.ready||!state.stale)show('map-error',false);
   for(const m of ['oblast','raion']){const layer=state.layers[m];if(layer&&map.hasLayer(layer))map.removeLayer(layer)}
   target.addTo(map);target.bringToFront();
   $('map-status').textContent=(mode==='oblast'?'25 областей':'136 районів')+' · межі завантажено';
   recolor();
   if(first)fitUkraine();
   updateCounts();
   renderPanel();
 }catch(error){
   if(request!==state.modeRequest)return;
   console.error('Region geometry failed:',error);
   $('map-status').classList.add('error');
   $('map-status').textContent='Межі недоступні — перевірте з’єднання';
   for(const m of ['oblast','raion']){$('mode-'+m).classList.toggle('on',m===state.mode);$('mode-'+m).setAttribute('aria-pressed',String(m===state.mode))}
   if(!state.layers.oblast&&!state.layers.raion){show('map-error',true);$('map-error-title').textContent='Не вдалося завантажити карту';$('map-error-text').textContent='Межі регіонів тимчасово недоступні. Перевірте з’єднання.'}
   else toast('Межі недоступні. Попередній шар залишається на карті.');
 }
}
function shortDuration(start){
 const days=Math.floor((Date.now()-start)/86400000);
 return days>0?days+' д':duration(start);
}
function refreshLabels(){
 nameLayer.clearLayers();
 const zoom=map.getZoom(),viewport=map.getBounds().pad(.12),placed=[];
 const small=window.innerWidth<700;
 function addLabel(region,point,width){
   const info=regionData(region);
   const screen=map.latLngToContainerPoint(point),height=info.startedAt?32:20;
   const box={x:screen.x-width/2,y:screen.y+17,w:width,h:height};
   if(placed.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))return;
   placed.push(box);
   const short=region.name.replace(/ область$/,'').replace(/ район$/,'').replace(/^Автономна Республіка /,'');
   const time=info.startedAt?'<small data-short data-duration="'+info.startedAt+'">'+shortDuration(info.startedAt)+'</small>':'';
   const icon=L.divIcon({className:'region-label',html:'<div class="map-zone-label '+info.severity+'"><b>'+esc(short)+'</b>'+time+'</div>',
    iconSize:[width,35],iconAnchor:[width/2,-17]});
   L.marker(point,{icon,interactive:false,keyboard:false,zIndexOffset:50}).addTo(nameLayer);
 }
 if((state.mode==='oblast'||zoom<7)&&zoom>=4.5){
  for(const [name,lat,lng] of oblastAnchors){
    if(name==='м. Севастополь'&&zoom<7)continue;
    if(!viewport.contains([lat,lng]))continue;
    addLabel({type:'oblast',name,oblast:name},[lat,lng],small?70:100);
  }
 }else if(state.mode==='raion'&&zoom>=7&&state.layers.raion){
  let count=0;
  state.layers.raion.eachLayer(shape=>{
    if(count>=70)return;
    const center=shape.getBounds().getCenter();
    if(!viewport.contains(center))return;
    addLabel(regionFromFeature(shape.feature,'raion'),center,small?70:92);
    count++;
  });
 }
}
function symbolMarkup(symbols){return '<div class="threat-symbols">'+symbols.map(name=>'<span class="threat-symbol '+name+'" role="img" aria-label="'+esc(SYMBOL_LABELS[name])+'">'+icon(name)+'</span>').join('')+'</div>'}
function refreshThreatMarkers(){
 threatLayer.clearLayers();
 if(!state.showThreats||!state.ready)return;
 const entries=[];
 if(state.mode==='raion'&&map.getZoom()>=7&&state.layers.raion){
  state.layers.raion.eachLayer(shape=>entries.push({region:regionFromFeature(shape.feature,'raion'),point:shape.getBounds().getCenter()}));
 }else{
  for(const [name,lat,lng] of oblastAnchors)entries.push({region:{type:'oblast',name,oblast:name},point:[lat,lng]});
 }
 for(const {region,point} of entries){
  if(!map.getBounds().pad(.15).contains(point))continue;
  const info=regionData(region),symbols=visibleThreatSymbols(info.alerts,state.hiddenSymbols);
  if(!symbols.length)continue;
  const labels=symbols.map(name=>SYMBOL_LABELS[name]).join(' · ');
  const marker=L.marker(point,{title:region.name+': '+labels,alt:region.name+': '+labels,zIndexOffset:260,icon:L.divIcon({
   className:'threat-icon',html:symbolMarkup(symbols),iconSize:[1,34],iconAnchor:[0,18]
  })});
  marker.bindTooltip(esc(region.name)+'<br>'+esc(labels)+'<br><small>Тип загрози в регіоні · умовне місце значка</small>');
  marker.on('click',()=>openRegion(region));marker.addTo(threatLayer);
 }
}

function regionStart(data){return data.startedAt??null}
function renderDetail(){
 if(!state.selected){show('details',false);return}
 const draft=$('place-name')?.value||'',typing=document.activeElement?.id==='place-name',caret=typing?$('place-name').selectionStart:null;
 const region=state.selected,info=regionData(region),key=regionKey(region),fav=favorites.has(key);
 const alertsSorted=[...info.alerts].sort((a,b)=>(validStart(a.started_at)||Infinity)-(validStart(b.started_at)||Infinity));
 const parent=region.type==='raion'?esc(region.oblast)+' · район':region.name.startsWith('м.')?'Місто':'Область';
 const inner=alertsSorted.slice(0,22).map(a=>{
   const codes=threatSummary([a]);
   const label=typeLabel(a);
   const start=validStart(a.started_at);
   return '<div class="detail-source"><b>'+esc(label)+'</b> · '+esc(a.location_title)+
    (codes.length?'<br>'+codes.map(code=>esc(threatLabel(code))).join(' · '):'')+
    '<small>'+(start?'Початок: '+formatStart(new Date(start))+' · <span data-duration="'+start+'">'+duration(start)+'</span>':'Час початку невідомий')+'</small></div>'
 }).join('');
 $('details').innerHTML='<div class="detail-header"><div><div class="eyebrow">'+parent+'</div><div class="detail-title">'+esc(region.name)+'</div></div>'+
    '<button class="detail-close" type="button" id="details-close" aria-label="Закрити">✕</button></div>'+
    '<div class="detail-symbols">'+symbolMarkup(threatSymbols(info.alerts))+'</div>'+
    '<div class="detail-status"><i class="status-bullet '+info.severity+'"></i>'+esc(statusLabel(info.severity))+'</div>'+
    '<div class="detail-timer">'+(info.startedAt?'<span data-duration="'+info.startedAt+'">'+duration(info.startedAt)+'</span>':'—')+
    '<small>'+(info.startedAt?'З '+formatStart(new Date(info.startedAt))+' · '+(info.alerts.some(a=>a.alert_type==='air_raid')?'від початку активної повітряної тривоги':'від найранішого активного повідомлення'):'Час активної тривоги не встановлений')+'</small></div>'+
    (inner?'<div class="detail-sources">'+inner+'</div>':'<p class="section-note">У поточній відповіді API немає активних повідомлень для цієї території.</p>')+
    '<div class="detail-footer"><button class="small-btn" id="details-star" type="button">'+(fav?'★ Прибрати з обраного':'☆ В обране')+'</button>'+
    '<button class="small-btn" id="details-panel" type="button">☰ Інформація</button></div>'+
    '<form id="place-form" class="place-form"><label class="input-label" for="place-name">Моє місце в цьому регіоні</label><div class="place-entry"><input id="place-name" type="text" maxlength="48" required placeholder="Дім, Робота, Батьки…" autocomplete="off"><button class="small-btn" type="submit">Зберегти</button></div><small>Якщо назва вже є — її регіон оновиться.</small></form>'+
    '<p class="detail-note">Розфарбування адміністративної одиниці не означає, що загроза рівномірна на всій території. Для безпеки звіряйтеся з офіційними сповіщеннями.</p>';
 $('place-name').value=draft;
 if(typing){$('place-name').focus();$('place-name').setSelectionRange(caret,caret)}
 show('details',true);
 $('details-close').onclick=()=>{state.selected=null;show('details',false)};
 $('details-star').onclick=()=>{favorites.has(key)?favorites.delete(key):favorites.add(key);saveFavorites();renderDetail();renderPanel();toast(favorites.has(key)?'Регіон додано в обране':'Регіон прибрано з обраного')};
 $('details-panel').onclick=()=>openDrawer('alerts');
 $('place-form').onsubmit=event=>{
  event.preventDefault();
  try{
   userData.places=upsertPlace(userData.places,$('place-name').value,region,newPlaceId());
   const saved=persistUser();renderPlaces();openDrawer('favorites');if(saved)toast('Місце збережено на цьому пристрої');
  }catch(error){toast(error.message)}
 };

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
 if(found&&found.getBounds().isValid())map.fitBounds(found.getBounds(),{paddingTopLeft:[25,140],paddingBottomRight:[25,170],maxZoom:9});
 else if(anchorMap.has(norm(region.name)))map.setView(anchorMap.get(norm(region.name)),9);
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
 const unique=allRegions();
 const active=unique.filter(r=>regionData(r).count>0).sort((a,b)=>{
   const left=regionData(a),right=regionData(b);
   return right.count-left.count||a.name.localeCompare(b.name,'uk');
 });
 $('alert-list').innerHTML=active.length?active.map(card).join(''):'<p class="section-note">'+(state.ready?'Немає активних повідомлень для цього фільтра.':state.stale?'Дані тривог недоступні. Спробуйте оновити.':'Дані тривог завантажуються…')+'</p>';
 bindCards($('alert-list'));
 const q=norm($('region-search').value);
 const searched=unique.filter(r=>!q||norm(r.name).includes(q)||norm(r.oblast).includes(q)).sort((a,b)=>a.name.localeCompare(b.name,'uk'));
 $('region-list').innerHTML=searched.slice(0,145).map(card).join('');
 bindCards($('region-list'));
 // Favorites can contain objects for either geographic layer, even if current layer differs.
 const favRegions=[...favorites].map(key=>knownRegions.get(key)).filter(Boolean);
 $('favorite-list').innerHTML=favRegions.length?favRegions.map(card).join(''):'<p class="section-note">Натисніть на область чи район і додайте його в обране.</p>';
 bindCards($('favorite-list'));
 renderPlaces();
}
function updateCounts(){
 const oblasts=state.geo.oblast?.features||[];
 const count=oblasts.filter(f=>classifyRegion(state.alerts,regionFromFeature(f,'oblast'),'all').count>0).length;
 $('oblast-count').textContent=state.ready?String(count):'—';
 $('alert-count').textContent=state.ready?String(state.alerts.length):'—';
 $('compact-events').textContent=state.ready?state.alerts.length:'—';
 $('active-filter').textContent=state.hiddenSymbols.size?'Шари значків: '+(Object.keys(SYMBOL_LABELS).length-state.hiddenSymbols.size)+'/'+Object.keys(SYMBOL_LABELS).length:'Усі загрози разом';
}
function updateDurations(){
 for(const node of document.querySelectorAll('[data-duration]')){
   const started=Number(node.dataset.duration);
   node.textContent=Number.isFinite(started)?node.hasAttribute('data-short')?shortDuration(started):duration(started):'час невідомий';
 }
 const now=formatClock(new Date());
 $('clock').textContent='КИЇВ · '+now;
 if(state.ready&&Date.now()-Date.parse(state.updatedAt)>120000){state.stale=true;connectionStatus('stale','Застарілі дані')}
 $('data-age').textContent=state.updatedAt?'Оновлено '+formatClock(new Date(state.updatedAt))+' · '+duration(state.updatedAt)+' тому':'Оновлення очікується';
 document.body.classList.toggle('data-stale',state.stale||!state.ready);
 if(state.notices.length)refreshNotices();
}
function connectionStatus(kind,text){
 const el=$('connection');
 el.className='connection is-'+kind;
 el.querySelector('span').textContent=text;
 $('footer-status').textContent=text;
 $('source-status').textContent='alerts.in.ua · '+text;
}
async function fetchAlerts(){
 if(state.fetching)return;
 state.fetching=true;
 $('refresh').disabled=true;
 try{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),14000);
   let response;
   try{response=await fetch('/api/alerts',{cache:'no-store',signal:controller.signal})}finally{clearTimeout(timeout)}
   const payload=await response.json();
   if(!response.ok)throw new Error(payload.error||'HTTP '+response.status);
   const raw=Array.isArray(payload.alerts)?payload.alerts:payload.alerts?.alerts;
   if(!Array.isArray(raw)||!Number.isFinite(Date.parse(payload.updatedAt)))throw Error('Некоректний формат відповіді');
   const items=cleanAlerts(raw);
   state.alerts=items;
   state.updatedAt=payload.updatedAt||new Date().toISOString();
   state.stale=Boolean(payload.stale)||Date.now()-Date.parse(state.updatedAt)>120000;
   state.ready=true;
   if(!state.stale&&Date.parse(state.updatedAt)>previousFreshStamp){
    const changes=placeTransitions(previousFreshAlerts,items,userData.places);
    previousFreshAlerts=items;previousFreshStamp=Date.parse(state.updatedAt);
    announcePlaceChanges(changes);
   }
   connectionStatus(state.stale?'stale':'live',state.stale?'Застарілі дані':'Онлайн');
   if(state.layers.oblast||state.layers.raion)show('map-error',false);
   $('sync-time').textContent=formatClock(new Date(state.updatedAt));
   $('list-timestamp').textContent='Оновлено '+formatClock(new Date(state.updatedAt));
   updateCounts();recolor();renderPanel();renderDetail();updateDurations();
 }catch(error){
   console.error('alerts API error:',error);
   state.stale=true;
   connectionStatus('error',state.ready?'Зв’язок втрачено':'Немає даних');
   $('sync-time').textContent=state.updatedAt?'Останні: '+formatClock(new Date(state.updatedAt)):'Немає даних';
   if(!state.ready){$('oblast-count').textContent='—';$('alert-count').textContent='—';renderPanel();show('map-error',true);$('map-error-title').textContent='Немає актуальних даних';$('map-error-text').textContent='Статуси тривог тимчасово недоступні. Географія карти працює, але її кольори зараз не відображають актуальну обстановку.'}
 }finally{state.fetching=false;$('refresh').disabled=false;updateDurations()}
}
function openDrawer(tab=state.tab){
 state.drawer=true;
 $('drawer').inert=false;
 $('drawer').classList.add('open');
 $('drawer').setAttribute('aria-hidden','false');
 $('menu-open').setAttribute('aria-expanded','true');
 show('drawer-backdrop',true);
 switchTab(tab);
 $('menu-close').focus();
}

function closeDrawer(){
 if(!state.drawer)return;
 state.drawer=false;
 $('drawer').inert=true;
 $('drawer').classList.remove('open');
 $('menu-open').focus();
 $('drawer').setAttribute('aria-hidden','true');
 $('menu-open').setAttribute('aria-expanded','false');
 show('drawer-backdrop',false);
}
function switchTab(tab){
 state.tab=tab;
 for(const button of document.querySelectorAll('[data-tab]'))button.classList.toggle('on',button.dataset.tab===tab);
 for(const name of ['alerts','regions','favorites','about','notices','settings'])show('tab-'+name,name===tab);
 if(tab==='regions')$('region-search').focus();
}
function refreshNotices(){
 noticeLayer.clearLayers();
 const active=state.notices.filter(n=>Date.parse(n.expiresAt)>Date.now());
 const available=state.noticeSources.filter(s=>s.status==='available').length;
 $('notice-source').textContent=state.noticesStatus==='live'||state.noticesStatus==='partial'?'Канали · '+active.length+' попереджень'+(state.noticeSources.length?' · '+available+'/'+state.noticeSources.length+' доступні':''):state.noticesStatus==='disabled'?'Канали · вимкнено':state.noticesStatus==='loading'?'Канали · перевірка…':'Канали · недоступні';
 $('channel-sources').innerHTML=state.noticeSources.map(s=>'<div class="source-row"><a href="https://t.me/'+esc(s.id)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title)+'</a><small>'+ (s.official?'Офіційне джерело':'Додатковий канал')+' · '+(s.status==='available'?'Публічна сторінка доступна':'Недоступний')+'</small></div>').join('');
 $('notice-list').innerHTML=active.length?active.map(n=>'<article class="notice-card"><b>'+esc(n.region)+'</b><p>'+esc(n.summary)+'</p><small>'+esc(n.source)+' · '+formatStart(new Date(n.publishedAt))+'</small><a target="_blank" rel="noopener noreferrer" href="'+esc(n.url)+'">Переглянути повідомлення ↗</a></article>').join(''):'<p class="section-note">Немає актуальних повідомлень із підключених каналів. Цей шар не змінює офіційні статуси тривог.</p>';
 if(!state.showNotices)return;
 // Outline the named administrative area; never derive a point or route from text.
 for(const feature of state.geo[state.mode]?.features||[]){
   const region=regionFromFeature(feature,state.mode);
   const notices=active.filter(n=>norm(n.region)===norm(region.oblast));
   if(!notices.length)continue;
   L.geoJSON(feature,{interactive:false,style:{color:'#a9a0ff',weight:3,dashArray:'7 6',fill:false}}).addTo(noticeLayer);
 }
}
async function fetchNotices(){
 try{
  const response=await fetch('/api/notices',{cache:'no-store',signal:AbortSignal.timeout(22000)});
  if(!response.ok)throw Error('Notice source unavailable');
  const data=await response.json();
  if(!Array.isArray(data.notices))throw Error('Invalid notices');
  state.notices=data.notices;state.noticesStatus=data.status;state.noticeSources=Array.isArray(data.sources)?data.sources:[];
 }catch{state.notices=[];state.noticesStatus='error';state.noticeSources=state.noticeSources.map(s=>({...s,status:'unavailable'}))}
 refreshNotices();
}
function persistUser(){
 try{localStorage.setItem(USER_STORAGE_KEY,JSON.stringify(userData));return true}
 catch{toast('Браузер не дозволив зберегти налаштування. Вони діятимуть лише до закриття сторінки.');return false}
}
function applyTheme(){
 const light=resolvedTheme()==='light';
 document.documentElement.dataset.theme=light?'light':'dark';
 document.querySelector('meta[name="theme-color"]').content=light?'#f4f6fa':'#15181f';
 tileLayer.setUrl('https://{s}.basemaps.cartocdn.com/'+(light?'light_all':'dark_all')+'/{z}/{x}/{y}{r}.png');
 recolor();
}
function renderPlaces(){
 $('places-list').innerHTML=userData.places.length?userData.places.map(place=>{
  const info=regionData(place.region);
  return '<article class="place-card"><button class="region-card '+info.severity+'" data-open-place="'+esc(place.id)+'"><span class="region-card-head"><b>'+esc(place.name)+'</b><em>↗</em></span><small>'+esc(place.region.name)+' · '+esc(statusLabel(info.severity))+(info.startedAt?' · <span data-duration="'+info.startedAt+'">'+duration(info.startedAt)+'</span>':'')+'</small></button><div class="place-actions"><label><input type="checkbox" data-watch-place="'+esc(place.id)+'" '+(place.watch?'checked':'')+'> Стежити за тривогою</label><button type="button" data-remove-place="'+esc(place.id)+'" aria-label="Видалити місце '+esc(place.name)+'">Видалити</button></div></article>';
 }).join(''):'<p class="section-note">Місць поки немає. Натисніть на область або район і збережіть його з власною назвою.</p>';
 $('places-list').querySelectorAll('[data-open-place]').forEach(button=>button.onclick=()=>{const place=userData.places.find(p=>p.id===button.dataset.openPlace);if(place)zoomToRegion(place.region)});
 $('places-list').querySelectorAll('[data-watch-place]').forEach(input=>input.onchange=()=>{const place=userData.places.find(p=>p.id===input.dataset.watchPlace);if(place){place.watch=input.checked;persistUser()}});
 $('places-list').querySelectorAll('[data-remove-place]').forEach(button=>button.onclick=()=>{userData.places=userData.places.filter(p=>p.id!==button.dataset.removePlace);persistUser();renderPlaces()});
}
async function playSound(interactive=false){
 const Audio=window.AudioContext||window.webkitAudioContext;
 if(!Audio)throw Error('Звук у цьому браузері недоступний');
 if(!interactive&&(!audioContext||audioContext.state!=='running'))throw Error('Звук потребує натискання кнопки у браузері');
 audioContext??=new Audio();
 if(audioContext.state==='suspended')await audioContext.resume();
 if(audioContext.state!=='running')throw Error('Натисніть «Перевірити звук», щоб дозволити його відтворення');
 for(let i=0;i<2;i++){
  const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),start=audioContext.currentTime+i*.25;
  oscillator.frequency.value=i?660:520;oscillator.type='sine';gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.12,start+.025);gain.gain.linearRampToValueAtTime(0,start+.18);
  oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.2);
 }
}
async function announcePlaceChanges(changes){
 if(!changes.length)return;
 const messages=changes.map(({place,kind})=>place.name+': '+(kind==='active'?'нове повідомлення про тривогу':'активне повідомлення про тривогу відсутнє у свіжих даних'));
 toast(messages.join(' · '));
 if(userData.preferences.sound){try{await playSound()}catch{$('notification-status').textContent='Звук заблокований браузером. Натисніть «Перевірити звук» у налаштуваннях.'}}
 if(userData.preferences.notifications&&'Notification' in window&&Notification.permission==='granted'){
  try{
   const registration=await navigator.serviceWorker.getRegistration();
   if(!registration?.active)throw Error('Notification worker unavailable');
   for(const {place,kind} of changes)await registration.showNotification('MAPA UA · '+place.name,{body:(kind==='active'?'Нове повідомлення про повітряну тривогу':'Активне повідомлення про тривогу відсутнє у свіжих даних')+' · '+place.region.name,tag:'mapa-place-'+place.id,icon:'/icon.svg',data:{url:'/?place='+encodeURIComponent(place.id)}});
  }catch{$('notification-status').textContent='Браузер не зміг показати системне сповіщення.'}
 }
}
function initPreferences(){
 $('theme-select').value=userData.preferences.theme;
 $('sound-enabled').checked=userData.preferences.sound;
 $('notifications-enabled').checked=userData.preferences.notifications&&'Notification' in window&&Notification.permission==='granted';
 $('theme-select').onchange=event=>{userData.preferences.theme=event.target.value;persistUser();applyTheme()};
 themeMedia.addEventListener('change',()=>{if(userData.preferences.theme==='system')applyTheme()});
 $('sound-enabled').onchange=async event=>{
  userData.preferences.sound=event.target.checked;
  if(event.target.checked){try{await playSound(true)}catch(error){userData.preferences.sound=false;event.target.checked=false;toast(error.message)}}
  persistUser();
 };
 $('sound-test').onclick=()=>playSound(true).catch(error=>toast(error.message));
 const supported='Notification' in window&&'serviceWorker' in navigator&&window.isSecureContext;
 $('notifications-enabled').disabled=!supported;
 $('notification-status').textContent=supported?'Дозвіл браузера запитується лише після ввімкнення перемикача.':'Цей браузер не підтримує системних сповіщень. Скористайтеся звуком у відкритій карті.';
 $('notifications-enabled').onchange=async event=>{
  const input=event.target;input.disabled=true;
  try{
   const permission=input.checked?await Notification.requestPermission():Notification.permission;
   userData.preferences.notifications=input.checked&&permission==='granted';input.checked=userData.preferences.notifications;
   $('notification-status').textContent=input.checked?'Увімкнено для активної відкритої карти.':permission==='denied'?'Дозвіл заблокований у налаштуваннях браузера.':'Системні сповіщення вимкнено.';
  }catch{input.checked=false;userData.preferences.notifications=false;$('notification-status').textContent='Не вдалося отримати дозвіл. На iPhone спробуйте встановлену PWA.'}
  finally{input.disabled=false;persistUser()}
 };
 applyTheme();renderPlaces();
}
function syncLayerControls(){
 for(const button of document.querySelectorAll('[data-filter]')){
  const layer=button.dataset.filter;
  const on=layer==='all'?state.hiddenSymbols.size===0:!state.hiddenSymbols.has(SYMBOL_LAYERS[layer]);
  button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));
  button.title=layer==='all'?'Показати всі типи загроз':(on?'Приховати':'Показати')+' лише ці значки';
 }
}
function initEvents(){
 document.querySelectorAll('[data-ui-icon]').forEach(el=>el.innerHTML=icon(el.dataset.uiIcon));
 $('map-retry').onclick=()=>{switchMode(state.mode,!state.layers[state.mode]);fetchAlerts();fetchNotices()};
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
 $('notice-toggle').onclick=()=>{state.showNotices=!state.showNotices;$('notice-toggle').setAttribute('aria-pressed',String(state.showNotices));$('notice-toggle').classList.toggle('on',state.showNotices);refreshNotices()};
 $('refresh').onclick=()=>{fetchAlerts();fetchNotices()};
 $('map-home').onclick=()=>{state.selected=null;show('details',false);fitUkraine()};
 $('map-locate').onclick=()=>map.locate({setView:true,maxZoom:9,enableHighAccuracy:false});
 map.on('locationerror',()=>toast('Не вдалося визначити місцеположення. Перевірте дозвіл браузера.'));
 map.on('zoomend',()=>{refreshLabels();refreshThreatMarkers();const layer=state.layers[state.mode];if(layer)layer.eachLayer(l=>l.setStyle({weight:map.getZoom()>7?1.25:.85}))});
 map.on('moveend',()=>{refreshLabels();refreshThreatMarkers()});
 map.on('resize',()=>{if(!state.selected)fitUkraine()});
 document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>switchTab(button.dataset.tab));
 document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{
   state.hiddenSymbols=toggleSymbolLayer(state.hiddenSymbols,button.dataset.filter);
   state.showThreats=true;
   $('threat-toggle').classList.add('on');$('threat-toggle').setAttribute('aria-pressed','true');
   syncLayerControls();updateCounts();refreshThreatMarkers();
 });
 syncLayerControls();
 $('region-search').oninput=debounce(renderPanel,120);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){fetchAlerts();fetchNotices()}});
 $('drawer').addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const nodes=[...$('drawer').querySelectorAll('button,input,a[href]')].filter(n=>n.getClientRects().length);
  const first=nodes[0],last=nodes.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 });
}
initEvents();
initPreferences();
switchMode('oblast',true).then(()=>{const id=new URL(location.href).searchParams.get('place'),place=userData.places.find(p=>p.id===id);if(place)zoomToRegion(place.region)});
fetchAlerts();
fetchNotices();
updateDurations();
setInterval(updateDurations,15000);
setInterval(()=>{if(!document.hidden){fetchAlerts();fetchNotices()}},45000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(error=>console.warn('PWA:',error));
