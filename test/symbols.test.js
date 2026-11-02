import test from 'node:test';
import assert from 'node:assert/strict';
import {threatSymbols,visibleThreatSymbols,toggleSymbolLayer,icon} from '../public/map-icons.js';
import {cleanAlerts,classifyRegion} from '../public/alert-logic.js';
test('simultaneous threat categories get distinct symbols without multiplying targets',()=>{
 const alerts=[{alert_type:'air_raid',threats:[{threat_type:'drones'},{threat_type:'cruise_missiles'},{threat_type:'ballistic_missiles'},{threat_type:'guided_aerial_bombs'}]}];
 assert.deepEqual(threatSymbols(alerts),['drone','missile','bomb']);
 assert.deepEqual(visibleThreatSymbols(alerts),['drone','missile','bomb']);
 const hidden=toggleSymbolLayer(new Set(),'drones');
 assert.deepEqual(visibleThreatSymbols(alerts,hidden),['missile','bomb']);
 assert.deepEqual(visibleThreatSymbols(alerts,toggleSymbolLayer(hidden,'drones')),['drone','missile','bomb']);
 assert.ok(icon('drone').includes('<svg'));assert.notEqual(icon('drone'),icon('missile'));
});
test('an air-raid record alone is never rendered as a missile or drone',()=>{
 assert.deepEqual(threatSymbols([{alert_type:'air_raid',threats:[]}]),['air']);
 assert.deepEqual(threatSymbols([{alert_type:'artillery_shelling',threats:[]}]),['artillery']);
});
test('city Kyiv is its own scope and does not turn all Kyiv oblast red',()=>{
 const alerts=cleanAlerts([{location_title:'м. Київ',location_oblast:'м. Київ',location_type:'city',alert_type:'air_raid'}]);
 assert.equal(classifyRegion(alerts,{type:'oblast',name:'м. Київ'}).severity,'red');
 assert.equal(classifyRegion(alerts,{type:'oblast',name:'Київська область'}).severity,'quiet');
});

test('layer toggles do not change alerts, regional severity or timers',()=>{
 const alerts=cleanAlerts([{location_title:'Київська область',location_type:'oblast',alert_type:'air_raid',started_at:'2026-11-02T10:00:00Z',threats:[{threat_type:'drones'},{threat_type:'cruise_missiles'}]},{location_title:'Київська область',location_type:'oblast',alert_type:'artillery_shelling'}]);
 const region={type:'oblast',name:'Київська область'},before=classifyRegion(alerts,region);
 let hidden=toggleSymbolLayer(new Set(),'drones');
 assert.deepEqual(visibleThreatSymbols(alerts,hidden),['missile','artillery']);
 hidden=toggleSymbolLayer(hidden,'missiles');
 assert.deepEqual(visibleThreatSymbols(alerts,hidden),['artillery']);
 assert.deepEqual(classifyRegion(alerts,region),before);
 assert.equal(alerts.length,2);
 assert.deepEqual(visibleThreatSymbols(alerts,toggleSymbolLayer(hidden,'all')),['drone','missile','artillery']);
});
