
import {regions} from './regions.js';
import {TYPES,THREATS,norm,cleanAlerts,classifyRegion,duration,validStart,matchesFilter,threatSummary} from './alert-logic.js';

const $=id=>document.getElementById(id);
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const stampFormat=new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hour12:false});
const anchorList=regions.map(([name,lat,lon])=>({name,lat,lon,type:'oblast',oblast:name}));
const byName=new Map(anchorList.map(a=>[norm(a.name),a]));
const storageKey='mapa:favorite-areas-v2';
function savedFavorites(){
 try{const data=JSON.parse(localStorage.getItem(storageKey)||'[]');return new Set(Array.isArray(data)?data.filter(x=>typeof x==='string').slice(0,250):[])}
 catch{return new Set()}
}
const favorites=savedFavorites();
const state={alerts:[],filter:'all',mode:'oblast',tab:'alerts',sourceTime:null,stale:true,apiReady:false,
 oblastData:null,raionData:null,oblastLayer:null,raionLayer:null,activeLayer:null,
 showThreats:true,demo:false,demoSpeed:1,tiles:false,selected:null,request:null,initialBounds:false};
const allAreas=[];
const labels=L.layerGroup();
const threatsLayer=L.layerGroup();
const demoLayer=L.layerGroup();
const map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true,minZoom:4,maxZoom:11,worldCopyJump:false});
map.setView([48.88,31.5],6);
L.control.zoom({position:'bottomright'}).addTo(map);
map.attributionControl.addAttribution('Геодані: OpenStreetMap contributors, UA_geojson CC BY 4.0');
const darkTiles=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
 attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:18,opacity:.8
});
labels.addTo(map);threatsLayer.addTo(map);
const classText={red:'Повітряна тривога',yellow:'Попередня / жовта загроза',
 partial:'Часткова тривога',other:'Інша загроза',quiet:'Активних повідомлень не виявлено'};
const colors={red:'#e94664',yellow:'#e9ac50',partial:'#e5a452',other:'#8c9fd6',quiet:'#24507a'};
const toastTimer={id:null};
function toast(msg){
 const node=$('toast');node.textContent=msg;node.classList.add('visible');
 if(toastTimer.id)clearTimeout(toastTimer.id);
 toastTimer.id=setTimeout(()=>node.classList.remove('visible'),3000);
}
function zoneId(region){return region.type+'|'+norm(region.oblast||region.name)+'|'+norm(region.name)}
function isFavorite(region){return favorites.has(zoneId(region))}
function toggleFavorite(region){
 const id=zoneId(region);if(favorites.has(id))favorites.delete(id);else favorites.add(id);
 try{localStorage.setItem(storageKey,JSON.stringify([...favorites]))}catch{}
 renderPanel();if(state.selected)renderDetails(state.selected);
}
function areaOfFeature(feature,type){
 const p=feature.properties||{};
 return type==='oblast'?{type:'oblast',name:String(p.name||'Область'),oblast:String(p.name||'Область')}:
 {type:'raion',name:String(p.name||'Район'),oblast:String(p.oblast||'')};
}
function areaStatus(region){return classifyRegion(state.alerts,region,state.filter)}
function renderStyle(feature,type){
 const region=areaOfFeature(feature,type),severity=areaStatus(region).severity;
 return {color:severity==='red'?'#ffc2cd':'#5483a9',weight:map.getZoom()>=8?1.65:1.12,
 opacity:.95,fillColor:colors[severity],fillOpacity:severity==='quiet'?.75:.92};
}
function makeGeoLayer(data,type){
 return L.geoJSON(data,{
  style:feature=>renderStyle(feature,type),
  onEachFeature:(feature,shape)=>{
   const region=areaOfFeature(feature,type);shape._region=region;
   shape.bindTooltip(region.name,{sticky:true,direction:'auto'});
   shape.on('click',()=>showDetails(region));
   shape.on('mouseover',()=>shape.setStyle({weight:2.5,color:'#e2f5ff'}));
   shape.on('mouseout',()=>updateStyles());
  }
 });
}
function updateStyles(){
 for(const layer of [state.oblastLayer,state.raionLayer]){
  if(!layer)continue;
  layer.eachLayer(shape=>{
   if(shape.feature)shape.setStyle(renderStyle(shape.feature,shape._region.type));
  });
 }
}
function mountLayer(){
 if(state.activeLayer)map.removeLayer(state.activeLayer);
 state.activeLayer=state.mode==='raion'?state.raionLayer:state.oblastLayer;
 if(state.activeLayer)state.activeLayer.addTo(map);
 updateStyles();renderLabels();renderThreatMarkers();
}
async function loadOblasts(){
 try{
  const r=await fetch('/ukraine-oblasts.geojson');if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();if(data.type!=='FeatureCollection'||data.features.length<20)throw Error('Некоректна географія');
  state.oblastData=data;state.oblastLayer=makeGeoLayer(data,'oblast');
  for(const feature of data.features)allAreas.push(areaOfFeature(feature,'oblast'));
  mountLayer();
  const bounds=state.oblastLayer.getBounds();
  if(bounds.isValid()){map.fitBounds(bounds,{padding:[25,25],maxZoom:7});state.initialBounds=true}
  $('map-status').textContent='✓ Контури областей завантажено';
  $('map-status').classList.remove('error');
  renderPanel();
 }catch(e){
  $('map-status').textContent='⚠ Межі областей недоступні';
  $('map-status').classList.add('error');
  console.error('oblast map',e);
  toast('Не вдалося завантажити межі областей. Спробуйте оновити сторінку.');
 }
}
async function loadRaions(){
 if(state.raionLayer)return true;
 $('map-status').textContent='Завантаження 136 районів…';
 try{
  const r=await fetch('/ukraine-raions.geojson');if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();if(data.type!=='FeatureCollection'||data.features.length<120)throw Error('Дані районів неповні');
  state.raionData=data;state.raionLayer=makeGeoLayer(data,'raion');
  for(const feature of data.features)allAreas.push(areaOfFeature(feature,'raion'));
  $('map-status').textContent='✓ Межі 136 районів завантажено';
  renderPanel();
  return true;
 }catch(e){
  $('map-status').textContent='⚠ Не вдалося завантажити райони';
  $('map-status').classList.add('error');
  console.error('raion map',e);
  toast('Райони тимчасово недоступні');
  return false;
 }
}
async function changeMode(mode){
 if(mode===state.mode&&state.activeLayer)return;
 if(mode==='raion'&&!await loadRaions()){mode='oblast'}
 state.mode=mode;
 $('mode-oblast').classList.toggle('on',mode==='oblast');
 $('mode-raion').classList.toggle('on',mode==='raion');
 $('mode-oblast').setAttribute('aria-pressed',String(mode==='oblast'));
 $('mode-raion').setAttribute('aria-pressed',String(mode==='raion'));
 mountLayer();
}
function featureAreaCenters(){
 const result=[];
 if(!state.oblastData)return result;
 for(const f of state.oblastData.features){
  const region=areaOfFeature(f,'oblast');
  const anchor=byName.get(norm(region.name));
  const center=anchor?[anchor.lat,anchor.lon]:L.geoJSON(f).getBounds().getCenter();
  result.push({region,center});
 }
 return result;
}
function labelIcon(value){
 return L.divIcon({className:'region-label-container',html:'<span class="region-label">'+safe(value.replace(/ область$/,'').replace(/ район$/,''))+'</span>',iconSize:[110,22],iconAnchor:[55,11]});
}
function renderLabels(){
 labels.clearLayers();
 if(!state.activeLayer)return;
 const zoom=map.getZoom();
 if(state.mode==='oblast'){
  const centers=featureAreaCenters();
  for(const item of centers){
   const status=areaStatus(item.region);
   const marker=L.marker(item.center,{icon:labelIcon(item.region.name),interactive:false,keyboard:false,opacity:status.severity==='red'?1:.84});
   marker.addTo(labels);
  }
 }else if(zoom>=7){
  state.raionLayer?.eachLayer(layer=>{
   const region=layer._region;
   if(!region)return;
   const center=layer.getBounds().getCenter();
   if(!map.getBounds().pad(.2).contains(center))return;
   L.marker(center,{icon:labelIcon(region.name),interactive:false,keyboard:false,opacity:.83}).addTo(labels);
  });
 }
 // Kyiv has its own independent municipal alerts; an oblast polygon alone cannot represent it.
 if(state.mode==='oblast'&&zoom>=6){
  const city=byName.get(norm('м. Київ'));
  if(city)L.circleMarker([city.lat,city.lon],{radius:3,fillOpacity:1,fillColor:'#7ad1ff',color:'#d6f7ff',weight:1,interactive:false}).addTo(labels);
 }
}
function groupByOblast(){
 const groups=new Map();
 for(const alert of state.alerts){
  const key=norm(alert.location_oblast);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(alert);
 }
 return groups;
}
function threatCategories(group){
 const names=threatSummary(group);
 return [...new Set(names)];
}
function renderThreatMarkers(){
 threatsLayer.clearLayers();
 if(!state.showThreats||!state.oblastData)return;
 const groups=groupByOblast();
 for(const anchor of anchorList){
  const group=groups.get(norm(anchor.name))||[];
  const matched=group.filter(alert=>matchesFilter(alert,state.filter));
  if(!matched.length)continue;
  const categories=threatCategories(matched);
  const isDrone=categories.includes('drones');
  const isMissile=categories.some(t=>t.includes('missiles'));
  if(!isDrone&&!isMissile)continue;
  let label=isDrone?'БпЛА':'Ракети';
  let cls=isDrone?'drone':'missile';
  if(isDrone&&isMissile){label='БпЛА · ракети';cls='missile'}
  const icon=L.divIcon({className:'threat-icon',html:'<span class="threat-bubble '+cls+'">⚠ '+label+'</span>',iconSize:[106,26],iconAnchor:[53,13]});
  const marker=L.marker([anchor.lat,anchor.lon],{icon,title:label+' — регіональна загроза, не координати цілі'});
  marker.bindTooltip('Загроза в '+anchor.name+'. Позначка умовна; це не розташування цілі.');
  marker.on('click',()=>showDetails({type:'oblast',name:anchor.name,oblast:anchor.name}));
  marker.addTo(threatsLayer);
 }
}
function updateOverview(){
 const groups=groupByOblast();
 $('oblast-count').textContent=String([...groups].filter(([,a])=>a.length).length);
 $('alert-count').textContent=String(state.alerts.length);
 if(state.sourceTime){
  const age=Date.now()-state.sourceTime;
  $('sync-time').textContent=(state.stale||age>120000?'⚠ ':'')+timeFormat.format(new Date(state.sourceTime));
  $('list-timestamp').textContent='оновлено '+timeFormat.format(new Date(state.sourceTime));
 }else{$('sync-time').textContent='немає даних';$('list-timestamp').textContent='—'}
}
function safeDate(timestamp){
 const value=validStart(timestamp);
 return value?stampFormat.format(new Date(value)):'невідомо';
}
function severityBadge(severity){
 return '<i class="status-bullet '+severity+'"></i><span>'+safe(classText[severity]||classText.other)+'</span>';
}
function renderDetails(region){
 if(!region)return;
 state.selected=region;
 const result=areaStatus(region);
 const latest=result.alerts.slice().sort((a,b)=>(validStart(b.started_at)||0)-(validStart(a.started_at)||0));
 const label=result.count?classText[result.severity]:'Немає активних повідомлень у відповіді API';
 let content='<div class="detail-header"><div><div class="eyebrow">'+(region.type==='raion'?'РАЙОН':'ОБЛАСТЬ')+'</div><div class="detail-title">'+safe(region.name)+'</div>';
 if(region.type==='raion')content+='<div class="detail-parent">'+safe(region.oblast)+'</div>';
 content+='</div><button class="detail-close" id="details-close" aria-label="Закрити картку">✕</button></div>';
 content+='<div class="detail-status">'+severityBadge(result.severity)+'</div>';
 if(result.count){
  const start=result.startedAt;
  content+='<div class="detail-timer">'+(start?'<span data-duration-start="'+start+'">'+safe(duration(start))+'</span>':'час невідомий')+'<small>триває від '+safe(start?stampFormat.format(new Date(start)):'невідомого часу')+' (Київ)</small></div>';
  content+='<div class="detail-sources">';
  for(const a of latest.slice(0,25)){
   const threats=a.threats.map(t=>THREATS[t.threat_type]||'Загроза').join(' · ');
   content+='<div class="detail-source"><b>'+safe(TYPES[a.alert_type]||'Повідомлення про загрозу')+'</b><small>'+safe(a.location_title)+(threats?' · '+safe(threats):'')+'</small><small>Із '+safe(safeDate(a.started_at))+' · <span data-duration-start="'+safe(validStart(a.started_at)||'')+'">'+safe(duration(a.started_at))+'</span></small></div>';
  }
  content+='</div>';
 }else content+='<p class="section-note">За поточними даними активних повідомлень не виявлено. Це не гарантує безпеки.</p>';
 content+='<div class="detail-footer"><button class="small-btn" id="favorite-area">'+(isFavorite(region)?'★ В обраному':'☆ До обраного')+'</button><button class="small-btn" id="detail-zoom">⌖ Наблизити</button></div>';
 content+='<p class="detail-note">Відображається статус адміністративної території. Позначки загроз не показують фактичне розташування цілей; нижчі за рівнем повідомлення можуть стосуватися лише частини території.</p>';
 $('details').innerHTML=content;$('details').hidden=false;
 $('details-close').onclick=()=>{$('details').hidden=true;state.selected=null};
 $('favorite-area').onclick=()=>toggleFavorite(region);
 $('detail-zoom').onclick=()=>focusArea(region);
 updateDurations();
}
function showDetails(region){renderDetails(region)}
function focusArea(region){
 if(state.mode!==region.type)changeMode(region.type).then(()=>locateArea(region));else locateArea(region);
 closeDrawer();
}
function locateArea(region){
 const layer=region.type==='raion'?state.raionLayer:state.oblastLayer;
 let found=false;
 layer?.eachLayer(shape=>{
  if(found)return;
  const r=shape._region;
  if(r&&norm(r.name)===norm(region.name)&&norm(r.oblast)===norm(region.oblast)){
   const bounds=shape.getBounds();
   if(bounds.isValid())map.fitBounds(bounds,{padding:[70,70],maxZoom:9});
   found=true;
  }
 });
 if(!found){
  const anchor=byName.get(norm(region.oblast||region.name));
  if(anchor)map.flyTo([anchor.lat,anchor.lon],7);
 }
 renderDetails(region);
}
function renderAlertList(){
 const all=state.alerts.filter(a=>matchesFilter(a,state.filter));
 const groups=new Map();
 for(const alert of all){
  const key=norm(alert.location_oblast);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(alert);
 }
 const cards=[...groups].map(([key,alerts])=>{
  const anchor=byName.get(key);
  const name=anchor?.name||alerts[0].location_oblast||alerts[0].location_title;
  const region={name,oblast:name,type:'oblast'};
  const result=classifyRegion(state.alerts,region,state.filter);
  return {region,result,alerts};
 }).sort((a,b)=>({red:5,partial:4,yellow:3,other:2,quiet:0}[b.result.severity]||0)-({red:5,partial:4,yellow:3,other:2,quiet:0}[a.result.severity]||0)||(b.result.count-a.result.count));
 if(!cards.length){
  $('alert-list').innerHTML='<p class="section-note">Активних повідомлень для обраного фільтра не знайдено'+(state.stale?' (дані можуть бути застарілими).':'.')+'</p>';
  return;
 }
 $('alert-list').innerHTML=cards.map(({region,result,alerts})=>{
  const threatText=threatCategories(alerts).map(t=>THREATS[t]||t).slice(0,3).join(' · ');
  const start=result.startedAt;
  return '<button class="region-card '+result.severity+'" data-region="'+safe(zoneId(region))+'"><span class="region-card-head"><b>'+safe(region.name)+'</b><em>'+(start?'<span data-duration-start="'+start+'">'+safe(duration(start))+'</span>':'')+'</em></span><small>'+safe(classText[result.severity])+' · '+alerts.length+' повідомл.'+(threatText?' · '+safe(threatText):'')+'</small></button>'
 }).join('');
}
function renderRegions(){
 const input=norm($('region-search').value);
 let areas=allAreas.filter(a=>input?norm(a.name).includes(input)||norm(a.oblast).includes(input):a.type==='oblast');
 if(!areas.length){$('region-list').innerHTML='<p class="section-note">Нічого не знайдено.</p>';return}
 areas=areas.sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name,'uk'):a.type==='oblast'?-1:1).slice(0,250);
 $('region-list').innerHTML=areas.map(region=>{
  const s=classifyRegion(state.alerts,region,state.filter);
  return '<button class="region-card '+s.severity+'" data-region="'+safe(zoneId(region))+'"><span class="region-card-head"><b>'+safe(region.name)+'</b><em>'+(isFavorite(region)?'★':'')+'</em></span><small>'+(region.type==='raion'?safe(region.oblast)+' · ':'')+safe(classText[s.severity])+(s.startedAt?' · <span data-duration-start="'+s.startedAt+'">'+duration(s.startedAt)+'</span>':'')+'</small></button>';
 }).join('');
}
function renderFavorites(){
 const areas=allAreas.filter(a=>isFavorite(a));
 if(!areas.length){$('favorite-list').innerHTML='<p class="section-note">Обраних регіонів ще немає. Відкрийте область або район на мапі й натисніть «До обраного».</p>';return}
 $('favorite-list').innerHTML=areas.map(region=>{
  const s=areaStatus(region);
  return '<button class="region-card '+s.severity+'" data-region="'+safe(zoneId(region))+'"><span class="region-card-head"><b>★ '+safe(region.name)+'</b></span><small>'+safe(region.type==='raion'?region.oblast+' · ':'')+safe(classText[s.severity])+(s.startedAt?' · <span data-duration-start="'+s.startedAt+'">'+duration(s.startedAt)+'</span>':'')+'</small></button>';
 }).join('');
}
function renderPanel(){
 renderAlertList();renderRegions();renderFavorites();updateDurations();
}
function updateDurations(){
 for(const node of document.querySelectorAll('[data-duration-start]')){
  const start=Number(node.dataset.durationStart);
  node.textContent=Number.isFinite(start)&&start>0?duration(start):'час невідомий';
 }
}
function setTab(name){
 state.tab=name;
 document.querySelectorAll('[data-tab]').forEach(btn=>btn.classList.toggle('on',btn.dataset.tab===name));
 document.querySelectorAll('.tab-panel').forEach(panel=>panel.hidden=panel.id!=='tab-'+name);
 renderPanel();
}
function openDrawer(){
 $('drawer').classList.add('open');$('drawer').setAttribute('aria-hidden','false');
 $('drawer-backdrop').hidden=false;$('menu-open').setAttribute('aria-expanded','true');
 $('menu-close').focus();renderPanel();
}
function closeDrawer(){
 $('drawer').classList.remove('open');$('drawer').setAttribute('aria-hidden','true');
 $('drawer-backdrop').hidden=true;$('menu-open').setAttribute('aria-expanded','false');
 $('menu-open').focus();
}
async function refresh(){
 if(state.request)return state.request;
 $('connection').className='connection is-loading';
 $('connection').querySelector('span').textContent='Оновлення';
 state.request=(async()=>{
  try{
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),12000);
   let response;
   try{response=await fetch('/api/alerts',{cache:'no-store',signal:controller.signal})}
   finally{clearTimeout(timeout)}
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'API HTTP '+response.status);
   state.alerts=cleanAlerts(body.alerts);
   state.sourceTime=Date.parse(body.updatedAt)||Date.now();
   state.stale=Boolean(body.stale)||Date.now()-state.sourceTime>120000;
   state.apiReady=true;
   try{localStorage.setItem('mapa:latest-snapshot',JSON.stringify({alerts:state.alerts,updatedAt:body.updatedAt}))}catch{}
   $('connection').className='connection '+(state.stale?'is-stale':'is-live');
   $('connection').querySelector('span').textContent=state.stale?'Дані застаріли':'Дані отримано';
   $('footer-status').textContent=state.stale?'Застарілі дані':'Оновлено '+timeFormat.format(new Date(state.sourceTime));
  }catch(e){
   state.stale=true;
   if(!state.apiReady){
    try{
     const old=JSON.parse(localStorage.getItem('mapa:latest-snapshot')||'null');
     if(old&&Date.now()-Date.parse(old.updatedAt)<6*3600000){
      state.alerts=cleanAlerts(old.alerts);state.sourceTime=Date.parse(old.updatedAt);state.apiReady=true;
     }
    }catch{}
   }
   $('connection').className='connection is-error';
   $('connection').querySelector('span').textContent='API недоступний';
   $('footer-status').textContent='Офлайн / помилка API';
   console.warn('alerts unavailable',e);
  }finally{
   updateOverview();updateStyles();renderThreatMarkers();renderPanel();
   if(state.selected)renderDetails(state.selected);
  }
 })();
 try{return await state.request}finally{state.request=null}
}
function tickClock(){
 $('clock').textContent='КИЇВ · '+timeFormat.format(new Date());
 updateDurations();
 if(state.sourceTime&&Date.now()-state.sourceTime>120000&&!state.stale){
  state.stale=true;$('connection').className='connection is-stale';$('connection').querySelector('span').textContent='Дані застаріли';updateOverview();
 }
}
const routes=[
 [[49.12,27.82],[49.47,28.35],[49.24,28.92],[49.65,29.12]],
 [[48.53,34.28],[48.86,34.50],[49.14,34.07],[49.48,34.24]],
 [[47.73,31.25],[48.04,31.42],[48.18,30.95],[48.43,31.08]]
]; // Entirely fictional UI examples. Not derived from reports, targets, or live data.
let demoMarkers=[],demoAnimation=0,demoEpoch=0;
function demoIcon(i){
 return L.divIcon({className:'demo-icon',html:'<div class="demo-object">'+(i%2===0?'✈':'◇')+'<small>ДЕМО</small></div>',iconSize:[52,46],iconAnchor:[26,23]})
}
function pointAt(route,step){
 const x=Math.max(0,Math.min(route.length-1.0001,step)),i=Math.floor(x),alpha=x-i;
 return [route[i][0]+(route[i+1][0]-route[i][0])*alpha,route[i][1]+(route[i+1][1]-route[i][1])*alpha];
}
function animate(now){
 if(!state.demo||document.hidden)return;
 if(!demoEpoch)demoEpoch=now;
 const step=(now-demoEpoch)/18000*state.demoSpeed;
 for(let i=0;i<routes.length;i++)demoMarkers[i].setLatLng(pointAt(routes[i],(step+i*.6)%(routes[i].length-1)));
 demoAnimation=requestAnimationFrame(animate);
}
function toggleDemo(visible){
 state.demo=visible;
 $('demo-toggle').classList.toggle('on',visible);
 $('demo-toggle').setAttribute('aria-pressed',String(visible));
 $('demo-ribbon').hidden=!visible;
 if(demoAnimation)cancelAnimationFrame(demoAnimation);
 demoAnimation=0;
 if(!visible){demoLayer.remove();return}
 if(!demoMarkers.length){
  for(let i=0;i<routes.length;i++){
   L.polyline(routes[i],{color:'#c09dff',opacity:.8,dashArray:'4 12',weight:2}).addTo(demoLayer);
   const marker=L.marker(routes[i][0],{icon:demoIcon(i),interactive:false,keyboard:false}).addTo(demoLayer);
   demoMarkers.push(marker);
  }
 }
 demoLayer.addTo(map);demoEpoch=0;
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.hidden)demoAnimation=requestAnimationFrame(animate);
 toast(visible?'Демо: маршрути та маркери вигадані':'Демонстрацію вимкнено');
}
function handleRegionButton(event){
 const button=event.target.closest('[data-region]');if(!button)return;
 const region=allAreas.find(a=>zoneId(a)===button.dataset.region);
 if(region)focusArea(region);
}
function initEvents(){
 $('menu-open').onclick=openDrawer;$('menu-close').onclick=closeDrawer;$('drawer-backdrop').onclick=closeDrawer;
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){if($('drawer').classList.contains('open'))closeDrawer();else if(state.selected){$('details').hidden=true;state.selected=null}}});
 $('refresh').onclick=refresh;$('mode-oblast').onclick=()=>changeMode('oblast');$('mode-raion').onclick=()=>changeMode('raion');
 $('threat-toggle').onclick=()=>{state.showThreats=!state.showThreats;$('threat-toggle').classList.toggle('on',state.showThreats);$('threat-toggle').setAttribute('aria-pressed',String(state.showThreats));renderThreatMarkers()};
 $('tiles-toggle').onclick=()=>{state.tiles=!state.tiles;$('tiles-toggle').classList.toggle('on',state.tiles);$('tiles-toggle').setAttribute('aria-pressed',String(state.tiles));state.tiles?darkTiles.addTo(map):darkTiles.remove()};
 $('demo-toggle').onclick=()=>toggleDemo(!state.demo);
 $('demo-speed').oninput=event=>{state.demoSpeed=Number(event.target.value);$('demo-speed-value').textContent=state.demoSpeed+'×'};
 $('map-home').onclick=()=>{if(state.oblastLayer)map.fitBounds(state.oblastLayer.getBounds(),{padding:[20,20],maxZoom:7});else map.setView([48.88,31.5],6)};
 $('map-locate').onclick=()=>map.locate({setView:true,maxZoom:9,enableHighAccuracy:false});
 map.on('locationerror',()=>toast('Геолокація недоступна або заборонена.'));
 map.on('zoomend moveend',()=>renderLabels());
 document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.tab)));
 document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{
  state.filter=btn.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('on',b===btn));
  updateStyles();renderThreatMarkers();renderPanel();if(state.selected)renderDetails(state.selected);
 }));
 $('region-search').addEventListener('input',renderRegions);
 ['alert-list','region-list','favorite-list'].forEach(id=>$(id).addEventListener('click',handleRegionButton));
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(demoAnimation)cancelAnimationFrame(demoAnimation);demoAnimation=0}
  else{refresh();if(state.demo){demoEpoch=0;demoAnimation=requestAnimationFrame(animate)}}
 });
}
initEvents();
tickClock();
setInterval(tickClock,15000);
loadOblasts();
refresh();
setInterval(()=>{if(!document.hidden)refresh()},45000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
