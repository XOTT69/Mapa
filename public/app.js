import {regions} from './regions.js';
const el=id=>document.getElementById(id);
const map=L.map('map',{zoomControl:false,minZoom:5,maxZoom:11}).setView([48.9,31.7],6);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'&copy; OpenStreetMap &copy; CARTO',maxZoom:19}).addTo(map);
const pins=new Map();let alerts=[],filter='all',loaded=false;
const labels={air_raid:'Повітряна тривога',artillery_shelling:'Загроза артобстрілу',urban_fights:'Бойові дії',chemical:'Хімічна загроза',nuclear:'Радіаційна загроза'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function matches(a){return filter==='all'||(filter==='other'?!['air_raid','artillery_shelling'].includes(a.alert_type):a.alert_type===filter);}
function draw(){
 const selected=alerts.filter(matches),by=new Map();
 for(const a of selected){const name=a.location_oblast||a.location_title||'Невідомий регіон';if(!by.has(name))by.set(name,[]);by.get(name).push(a);}
 for(const [name,lat,lon] of regions){
   const group=by.get(name)||[],kind=group.some(a=>a.alert_type==='air_raid')?'danger':group.length?'other':'quiet';
   const icon=L.divIcon({html:'<div class="pin '+kind+'"></div>',className:'',iconSize:[22,22],iconAnchor:[11,11]});
   if(!pins.has(name))pins.set(name,L.marker([lat,lon],{icon}).addTo(map));else pins.get(name).setIcon(icon);
   pins.get(name).bindPopup('<strong>'+esc(name)+'</strong><p>'+(group.length?[...new Set(group.map(a=>labels[a.alert_type]||a.alert_type||'Загроза'))].map(esc).join(', '):'Активних повідомлень немає')+'</p><small>Умовний центр області, не місце загрози</small>');
 }
 const items=[...by.entries()].sort((a,b)=>b[1].length-a[1].length);
 el('alerts').innerHTML=items.length?items.map(([name,a])=>'<button class="alert" data-region="'+esc(name)+'"><b>'+esc(name)+'</b><small>'+[...new Set(a.map(x=>labels[x.alert_type]||x.alert_type||'Загроза'))].map(esc).join(' · ')+' · '+a.length+'</small></button>').join(''):'<p class="muted">'+(loaded?'Немає активних повідомлень для цього фільтра.':'Очікуємо інформацію…')+'</p>';
 document.querySelectorAll('[data-region]').forEach(node=>node.addEventListener('click',()=>{const p=pins.get(node.dataset.region);if(p){map.setView(p.getLatLng(),8);p.openPopup();}}));
 el('regionsCount').textContent=String(new Set(alerts.filter(a=>a.alert_type==='air_raid').map(a=>a.location_oblast||a.location_title)).size);
 el('alertsCount').textContent=String(alerts.length);
}
async function update(){
 el('status').textContent='Оновлення…';
 try{
 const r=await fetch('/api/alerts',{cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.error||'HTTP '+r.status);
 const raw=data.alerts;alerts=(Array.isArray(raw)?raw:Array.isArray(raw?.alerts)?raw.alerts:[]).filter(a=>a&&!a.finished_at);
 loaded=true;draw();el('status').textContent='Дані отримано';el('updated').textContent='Оновлено: '+new Date(data.updatedAt).toLocaleTimeString('uk-UA',{timeZone:'Europe/Kyiv'});
 }catch(e){el('status').textContent='Дані недоступні';el('updated').textContent=String(e.message)}
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));draw()}));
el('refresh').addEventListener('click',update);update();setInterval(()=>{if(!document.hidden)update()},45000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});