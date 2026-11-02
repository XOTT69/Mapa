// Static symbols for regional threat categories. Orientation never represents a heading.
const shapes={
 settings:'<path d="M12 3h8l1 5 4 2 4-1 3 6-4 3v4l-4 3-1 4h-7l-2-4-4-2-4 1-3-6 4-3v-4l4-3 1-5Z"/><circle cx="16" cy="16" r="5"/>',
 missile:'<path d="M16 3c-3 3-4.5 6-4.5 10v8h9v-8C20.5 9 19 6 16 3Z"/><path d="m11.5 16-5 8 5-1m9-7 5 8-5-1M13 25l3 4 3-4"/><circle cx="16" cy="12" r="1.5"/>',
 drone:'<path d="m16 3 2 9 12 7v3l-12-3v6l4 3v1l-6-1-6 1v-1l4-3v-6L2 22v-3l12-7 2-9Z"/>',
 bomb:'<path d="m13 5 3 3 3-3 3 3-3 4 2 4c3 5-1 11-5 13-4-2-8-8-5-13l2-4-3-4 3-3Z"/><path d="m12 17 8 4"/>',
 artillery:'<path d="M12 13c0-5 4-9 4-9s4 4 4 9v12h-8V13Z"/><path d="M11 25h10v4H11zm1-10h8M4 9l3 3M28 9l-3 3M16 1v1"/>',
 air:'<path d="M8 23V14a8 8 0 0 1 16 0v9M5 23h22v5H5zM16 2v2M4 6l3 3M28 6l-3 3M1 16h3m24 0h3"/><path d="M12 16a4 4 0 0 1 4-4"/>',
 aircraft:'<path d="m16 2 3 12 11 7v3l-11-3v5l4 3-7-1-7 1 4-3v-5L2 24v-3l11-7 3-12Z"/>',
 chemical:'<path d="M12 3h8m-6 0v9L5 26c-1 2 1 3 3 3h16c2 0 4-1 3-3l-9-14V3M10 20h12"/><circle cx="15" cy="24" r="1"/>',
 nuclear:'<circle cx="16" cy="16" r="2"/><path d="M13 12 8 4a14 14 0 0 1 16 0l-5 8M11 17l-9 1a14 14 0 0 0 8 13l4-10m7-4 9 1a14 14 0 0 1-8 13l-4-10"/>',
 all:'<path d="M4 6h24M4 16h24M4 26h24"/><circle cx="11" cy="6" r="3"/><circle cx="22" cy="16" r="3"/><circle cx="13" cy="26" r="3"/>',
 layers:'<path d="m16 3 14 8-14 8L2 11 16 3Zm-13 15 13 7 13-7M3 24l13 7 13-7"/>',
 home:'<path d="M3 13 16 3l13 10M7 12v16h18V12M13 28V18h6v10"/>',
 location:'<circle cx="16" cy="16" r="9"/><circle cx="16" cy="16" r="3"/><path d="M16 1v5m0 20v5M1 16h5m20 0h5"/>',
 info:'<circle cx="16" cy="16" r="13"/><path d="M16 14v10m0-16v2"/>',
 menu:'<path d="M5 8h22M5 16h22M5 24h22"/>',
 refresh:'<path d="M27 13A12 12 0 1 0 27 21M27 4v9h-9"/>',
 close:'<path d="m7 7 18 18M25 7 7 25"/>',
 moon:'<path d="M27 19A12 12 0 0 1 13 5a12 12 0 1 0 14 14Z"/>'
};
export function icon(name){return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(shapes[name]||shapes.air)+'</svg>'}
export const SYMBOL_LABELS={drone:'Загроза БпЛА',missile:'Ракетна загроза',bomb:'Загроза авіабомб',artillery:'Обстріл',air:'Повітряна тривога',aircraft:'Авіаційна загроза',chemical:'Хімічна загроза',nuclear:'Радіаційна загроза'};
export function threatSymbols(alerts){
 const symbols=new Set();
 for(const alert of alerts){
  for(const threat of alert.threats||[]){
   const type=threat.threat_type;
   if(type==='drones')symbols.add('drone');
   else if(type.includes('missiles'))symbols.add('missile');
   else if(type==='guided_aerial_bombs')symbols.add('bomb');
   else if(['tactic_aircraft_activity','strategic_aircraft_activity','mig31k_departure'].includes(type))symbols.add('aircraft');
  }
  if(alert.alert_type==='artillery_shelling'||alert.alert_type==='urban_fights')symbols.add('artillery');
  if(alert.alert_type==='chemical')symbols.add('chemical');
  if(alert.alert_type==='nuclear')symbols.add('nuclear');
 }
 if(!symbols.size&&alerts.some(a=>a.alert_type==='air_raid'))symbols.add('air');
 return [...symbols];
}

export const SYMBOL_LAYERS=Object.freeze({air:'air',drones:'drone',missiles:'missile',artillery:'artillery'});
export function visibleThreatSymbols(alerts,hidden=new Set()){
 return threatSymbols(alerts).filter(symbol=>!hidden.has(symbol));
}
export function toggleSymbolLayer(hidden,layer){
 const next=new Set(hidden);
 if(layer==='all')return new Set();
 const symbol=SYMBOL_LAYERS[layer];
 if(symbol){if(next.has(symbol))next.delete(symbol);else next.add(symbol)}
 return next;
}
