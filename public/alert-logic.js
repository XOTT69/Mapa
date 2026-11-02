
export const TYPES = Object.freeze({
 air_raid:'Повітряна тривога',artillery_shelling:'Артобстріл',urban_fights:'Бойові дії',chemical:'Хімічна загроза',nuclear:'Радіаційна загроза'
});
export const THREATS = Object.freeze({
 drones:'Загроза БпЛА',ballistic_missiles:'Балістична загроза',cruise_missiles:'Крилаті ракети',unspecified_missiles:'Ракетна загроза',guided_aerial_bombs:'Керовані авіабомби',tactic_aircraft_activity:'Тактична авіація',strategic_aircraft_activity:'Стратегічна авіація',mig31k_departure:'МіГ-31К',air_defense:'Робота ППО',unknown:'Інша загроза'
});
export function norm(value){
 const key=String(value??'').normalize('NFC').toLocaleLowerCase('uk-UA')
  .replace(/^(?:місто|м[.]?)\s+/,'').replace(/\s+(?:область|обл[.]?|район|р-н)\s*$/,'')
  .replace(/[’'\u02bc\u2019\u0060]/g,'').replace(/[^\p{L}\p{N}]/gu,'');
 const aliases={'новомосковський':'самарівський','червоноградський':'шептицький',
   'красноградський':'берестинський','сєвєродонецький':'сіверськодонецький'};
 return aliases[key]||key;
}
export function validStart(value){const stamp=Date.parse(String(value??''));return Number.isFinite(stamp)&&stamp>0?stamp:null}
export function duration(value,now=Date.now()){
 const start=typeof value==='number'?value:validStart(value);
 if(start===null||!Number.isFinite(start))return 'час невідомий';
 const mins=Math.max(0,Math.floor((now-start)/60000));
 if(mins<1)return 'менше хвилини';
 const days=Math.floor(mins/1440),hours=Math.floor(mins%1440/60),minutes=mins%60;
 return [days?days+' д':'',hours?hours+' год':'',minutes+' хв'].filter(Boolean).join(' ');
}
export function cleanAlerts(payload){
 const items=Array.isArray(payload)?payload:Array.isArray(payload?.alerts)?payload.alerts:[];
 return items.filter(a=>a&&typeof a==='object'&&!a.finished_at).map(a=>({
  id:String(a.id??''),location_title:String(a.location_title||''),location_type:String(a.location_type||'unknown'),
  location_oblast:String(a.location_oblast||a.location_title||''),location_raion:String(a.location_raion||''),
  started_at:a.started_at||null,alert_type:String(a.alert_type||'unknown'),
  alert_level:a.alert_level==='yellow'?'yellow':'red',
  threats:Array.isArray(a.threats)?a.threats.filter(t=>t&&typeof t==='object').map(t=>({
   threat_type:String(t.threat_type||'unknown'),level:t.level==='yellow'?'yellow':'red',
   started_at:t.started_at||null
  })): []
 }));
}
export function matchesFilter(a,filter){
 if(filter==='all')return true;
 if(filter==='drones')return a.threats.some(t=>t.threat_type==='drones');
 if(filter==='missiles')return a.threats.some(t=>/missiles/.test(t.threat_type));
 if(filter==='artillery')return a.alert_type==='artillery_shelling';
 if(filter==='air')return a.alert_type==='air_raid';
 return true;
}
export function inRegion(a,region){
 const area=norm(region.oblast||region.name),areaMatch=norm(a.location_oblast)===area||
  (a.location_type==='oblast'&&norm(a.location_title)===area);
 if(!areaMatch)return false;
 if(region.type==='oblast')return true;
 const name=norm(region.name);
 if(a.location_type==='oblast')return true;
 if(a.location_type==='raion')return norm(a.location_title)===name||norm(a.location_raion)===name;
 return norm(a.location_raion)===name;
}
export function classifyRegion(all,region,filter='all'){
 const scoped=all.filter(a=>inRegion(a,region));
 const shown=scoped.filter(a=>matchesFilter(a,filter));
 if(!shown.length)return {severity:'quiet',alerts:shown,count:0,startedAt:null};
 let severity='other',priority=1;
 for(const a of shown){
  const broad=a.location_type==='oblast'||region.type==='raion'&&a.location_type==='raion'||region.name.startsWith('м.')&&norm(a.location_title)===norm(region.name);
  let current='other',score=1;
  if(a.alert_type==='air_raid'){
   current=a.alert_level==='yellow'?'yellow':broad?'red':'partial';
   score=current==='red'?4:current==='partial'?3:2;
  }else if(a.alert_level==='yellow'){current='yellow';score=2}
  if(score>priority){priority=score;severity=current}
 }
 const airAlerts=shown.filter(a=>a.alert_type==='air_raid');
 const stamps=(airAlerts.length?airAlerts:shown).map(a=>validStart(a.started_at)).filter(x=>x!==null);
 return {severity,alerts:shown,count:shown.length,startedAt:stamps.length?Math.min(...stamps):null};
}
export function threatSummary(alerts){
 const found=new Set();
 for(const a of alerts)for(const t of a.threats)found.add(t.threat_type);
 return [...found];
}
