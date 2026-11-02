import test from 'node:test';
import assert from 'node:assert/strict';
import {threatSymbols,symbolsForFilter,icon} from '../public/map-icons.js';
import {cleanAlerts,classifyRegion} from '../public/alert-logic.js';
test('simultaneous threat categories get distinct symbols without multiplying targets',()=>{
 const alerts=[{alert_type:'air_raid',threats:[{threat_type:'drones'},{threat_type:'cruise_missiles'},{threat_type:'ballistic_missiles'},{threat_type:'guided_aerial_bombs'}]}];
 assert.deepEqual(threatSymbols(alerts),['drone','missile','bomb']);
 assert.deepEqual(symbolsForFilter(alerts,'missiles'),['missile']);
 assert.deepEqual(symbolsForFilter(alerts,'drones'),['drone']);
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
