import {classifyRegion} from './alert-logic.js';
export const USER_STORAGE_KEY='mapa-user-v1';
export const DEFAULT_PREFERENCES=Object.freeze({theme:'dark',sound:false,notifications:false});
function validRegion(region){return region&&['oblast','raion'].includes(region.type)&&typeof region.name==='string'&&region.name.trim()&&typeof region.oblast==='string'}
export function normalizeUserData(raw){
 const preferences={theme:['dark','light','system'].includes(raw?.preferences?.theme)?raw.preferences.theme:'dark',sound:raw?.preferences?.sound===true,notifications:raw?.preferences?.notifications===true};
 const unique=new Map();
 for(const place of Array.isArray(raw?.places)?raw.places:[]){
  if(typeof place?.id!=='string'||!place.id||typeof place.name!=='string'||!place.name.trim()||!validRegion(place.region))continue;
  unique.set(place.id,{id:place.id.slice(0,80),name:place.name.trim().slice(0,48),watch:place.watch!==false,region:{type:place.region.type,name:place.region.name.slice(0,120),oblast:place.region.oblast.slice(0,120)}});
 }
 return {preferences,places:[...unique.values()]};
}
export function readUserData(storage){try{return normalizeUserData(JSON.parse(storage.getItem(USER_STORAGE_KEY)||'{}'))}catch{return normalizeUserData(null)}}
export function upsertPlace(places,name,region,id){
 const label=String(name||'').trim().slice(0,48);
 if(!label||!validRegion(region))throw Error('Вкажіть назву й оберіть регіон');
 const existing=places.find(p=>p.name.toLocaleLowerCase('uk-UA')===label.toLocaleLowerCase('uk-UA'));
 const place={id:existing?.id||id,name:label,watch:existing?.watch??true,region:{type:region.type,name:region.name,oblast:region.oblast}};
 return existing?places.map(p=>p.id===existing.id?place:p):[...places,place];
}
export function placeTransitions(previous,current,places){
 if(previous===null)return [];
 const before=previous.filter(a=>a.alert_type==='air_raid'),after=current.filter(a=>a.alert_type==='air_raid');
 return places.filter(p=>p.watch).flatMap(place=>{
  const was=classifyRegion(before,place.region).count>0,is=classifyRegion(after,place.region).count>0;
  return was===is?[]:[{place,kind:is?'active':'clear'}];
 });
}

export function newPlaceId(cryptoApi=globalThis.crypto){
 return typeof cryptoApi?.randomUUID==='function'?cryptoApi.randomUUID():'place-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
}
