import {regions} from './regions.js';
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title={air_raid:'Повітряна тривога',artillery_shelling:'Артилерійський обстріл',urban_fights:'Бойові дії',chemical:'Хімічна загроза',nuclear:'Радіаційна загроза'};
const normalize=s=>String(s||'').toLowerCase().replace(/^(місто |м\. )/,'').replace(/( область| обл\.)$/,'').replace(/ї/g,'ї').replace(/[^а-яіїєґ]/g,'');
const anchors=regions.map(([name,lat,lon])=>({name,lat,lon,key:normalize(name)}));
const map=L.map('map',{zoomControl:false,minZoom:5,maxZoom:11,preferCanvas:true}).setView([48.8,31.6],6);
L.control.zoom({position:'bottomright'}).addTo(map);
const dark=L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:18});
const light=L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:18});
dark.addTo(map);let lightMode=false,showOutline=true,filter='all',alerts=[],updatedAt=null,loaded=false,layer=null,selected=null;
const favorites=new Set(JSON.parse(localStorage.getItem('mapa-favorites')||'[]'));
const keyFor=a=>normalize(a.location_oblast||a.location_title);
const match=a=>filter==='all'||(filter==='other'?!['air_raid','artillery_shelling'].includes(a.alert_type):a.alert_type===filter);
function grouped(){const m=new Map();for(const a of alerts.filter(match)){const k=keyFor(a);if(!m.has(k))m.set(k,[]);m.get(k).push(a)}return m}
function findName(feature){
  const p=feature.properties||{};
  const text=[p.name,p.NAME_1,p.NAME,p.name_uk,p.name_ua,p.NAME_UK,p.NAME_UA,p.uk,p.title,p.region_name,p.admin_name,p.oblast].filter(x=>typeof x==='string');
  for(const x of text){const k=normalize(x);const hit=anchors.find(a=>k===a.key||k.includes(a.key)&&a.key.length>5||a.key.includes(k)&&k.length>5);if(hit)return hit.name}
  const center=L.geoJSON(feature).getBounds().getCenter();
  const closest=anchors.filter(x=>x.name!=='м. Київ'&&x.name!=='м. Севастополь').sort((a,b)=>(a.lat-center.lat)**2+(a.lon-center.lng)**2-( (b.lat-center.lat)**2+(b.lon-center.lng)**2))[0];
  return closest?.name||'Невідомий регіон';
}
function countsFor(name){const k=normalize(name);const values=[...grouped().entries()].filter(([key])=>key===k||key.includes(k)&&k.length>5).flatMap(([,a])=>a);return values}
function statusFor(name){const items=countsFor(name);return items.some(a=>a.alert_level==='red'||a.alert_type==='air_raid'&&a.alert_level!=='yellow')?'red':items.length?'yellow':'none'}
const fill={red:'#e94560',yellow:'#e6a13f',none:'#26374d'};
function paint(){if(!layer)return;layer.eachLayer(item=>{const s=statusFor(item._oblast);item.setStyle({fillColor:fill[s],fillOpacity:s==='none'?.68:.82,color:'#697e9d',weight:map.getZoom()>7?1.6:1.1,opacity:.85});if(s==='red')item.bringToFront()})}
function openDetail(name){
 selected=name;const list=countsFor(name);const fav=favorites.has(name);
 $('detail').hidden=false;$('detail').innerHTML='<button class="close" id="close-detail" aria-label="Закрити">×</button><div class="eyebrow">ОБРАНИЙ РЕГІОН</div><h2>'+escapeHTML(name)+'</h2><p class="severity">'+(list.length?'<b style="color:#ff6b80">● Активні повідомлення: '+list.length+'</b>':'Активних повідомлень у доступних даних не виявлено')+'</p><button id="star" class="chip">'+(fav?'★ Прибрати з обраного':'☆ Додати в обране')+'</button><div class="detail-items">'+list.slice(0,20).map(a=>'<p><strong>'+escapeHTML(title[a.alert_type]||a.alert_type||'Загроза')+'</strong><br><small>'+escapeHTML(a.location_title||'')+'</small></p>').join('')+'</div><small>Позначення охоплює область; окремі тривоги можуть стосуватися лише частини її території.</small>';
 $('close-detail').onclick=()=>{$('detail').hidden=true;selected=null};
 $('star').onclick=()=>{favorites.has(name)?favorites.delete(name):favorites.add(name);localStorage.setItem('mapa-favorites',JSON.stringify([...favorites]));openDetail(name);renderList()};
}
async function loadOutline(){
 try{
 const r=await fetch('https://cdn.jsdelivr.net/gh/darmat1/ukraine-geo-data@main/geodata/Ukraine.geojson');
 if(!r.ok)throw Error('Map boundaries unavailable');
 const data=await r.json();
 layer=L.geoJSON(data,{style:{fillColor:fill.none,fillOpacity:.7,color:'#7589a7',weight:1.2},onEachFeature:(feature,shape)=>{const n=findName(feature);shape._oblast=n;shape.on('click',()=>openDetail(n));shape.on('mouseover',()=>shape.setStyle({weight:2.5,color:'#d5e9ff'}));shape.on('mouseout',()=>paint());shape.bindTooltip(n,{sticky:true})}}).addTo(map);
 paint();map.fitBounds(layer.getBounds(),{padding:[12,12]});
 }catch(e){$('status').textContent='● Контури недоступні';console.warn(e);}
}
function renderList(){
 const query=normalize($('search').value);const by=grouped();
 let names=[...new Set(anchors.map(a=>a.name))].filter(n=>(!query||normalize(n).includes(query))&&(!$('favorites-only').classList.contains('selected')||favorites.has(n)));
 names.sort((a,b)=>countsFor(b).length-countsFor(a).length||a.localeCompare(b,'uk'));
 const active=names.filter(n=>countsFor(n).length);const display=query||$('favorites-only').classList.contains('selected')?names:active;
 $('alerts').innerHTML=display.length?display.map(name=>{const list=countsFor(name),severity=statusFor(name),label=[...new Set(list.map(a=>title[a.alert_type]||a.alert_type||'Загроза'))].join(' · ');return '<button class="alert-card '+severity+'" data-region="'+escapeHTML(name)+'"><span class="alert-main"><i></i><b>'+escapeHTML(name)+'</b><em>'+ (favorites.has(name)?'★':'')+'</em></span><small>'+(list.length?escapeHTML(label)+' · '+list.length:'Немає активних повідомлень')+'</small></button>'}).join(''):'<p class="muted">Регіонів із повідомленнями для цього фільтра немає.</p>';
 document.querySelectorAll('[data-region]').forEach(n=>n.onclick=()=>{const name=n.dataset.region;const anchor=anchors.find(a=>a.name===name);if(anchor)map.flyTo([anchor.lat,anchor.lon],7);openDetail(name)});
 $('regionsCount').textContent=new Set(alerts.filter(a=>a.alert_type==='air_raid').map(keyFor)).size;
 $('alertsCount').textContent=alerts.length;
}
async function update(){
 $('status').textContent='● Оновлення…';
 try{const r=await fetch('/api/alerts',{cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.error||'API unavailable');
 const value=data.alerts;alerts=(Array.isArray(value)?value:Array.isArray(value?.alerts)?value.alerts:[]).filter(x=>x&&!x.finished_at);
 updatedAt=data.updatedAt;loaded=true;
 $('status').textContent=data.stale?'● Застарілі дані':'● Дані актуальні';
 $('lastUpdate').textContent=new Date(updatedAt).toLocaleTimeString('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});
 paint();renderList();if(selected)openDetail(selected);
 }catch(e){$('status').textContent='● Немає з’єднання';$('lastUpdate').textContent='Помилка API';if(!loaded)$('alerts').textContent='Не вдалося отримати дані. Спробуйте пізніше.'}
}
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('selected',x===b));paint();renderList()});
$('search').oninput=renderList;$('refresh').onclick=update;
$('home').onclick=()=>layer?map.fitBounds(layer.getBounds()):map.setView([48.8,31.6],6);
$('basemap').onclick=()=>{lightMode=!lightMode;map.removeLayer(lightMode?dark:light);(lightMode?light:dark).addTo(map);$('basemap').textContent=lightMode?'◉ Темна мапа':'◉ Світла мапа'};
$('favorites-only').onclick=()=>{$('favorites-only').classList.toggle('selected');renderList()};
$('map-mode').onclick=()=>{showOutline=!showOutline;$('map-mode').classList.toggle('selected',showOutline);if(layer){showOutline?layer.addTo(map):map.removeLayer(layer)}};
$('toggle-panel').onclick=()=>{$('panel').classList.toggle('expanded');setTimeout(()=>map.invalidateSize(),200)};
$('locate').onclick=()=>map.locate({setView:true,maxZoom:9,enableHighAccuracy:false});
map.on('locationerror',()=>alert('Не вдалося визначити місцеположення. Дозвольте доступ у браузері.'));
loadOutline();update();setInterval(()=>{if(!document.hidden)update()},45000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});