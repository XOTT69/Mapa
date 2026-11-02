import test from 'node:test';
import assert from 'node:assert/strict';
import {norm,cleanAlerts,duration,classifyRegion,matchesFilter,threatSummary} from '../public/alert-logic.js';
test('normalizes oblast and rayon names',()=>{assert.equal(norm('Київська область'),norm('Київська'));assert.equal(norm('Броварський район'),norm('Броварський'));});
test('active alerts only',()=>{assert.equal(cleanAlerts({alerts:[{id:1},{id:2,finished_at:'2026-01-01'}]}).length,1);});
test('oblast-wide alert covers its raions and remains red',()=>{
 const alerts=cleanAlerts({alerts:[{location_title:'Київська область',location_oblast:'Київська область',location_type:'oblast',alert_type:'air_raid',alert_level:'red',started_at:'2026-11-02T00:00:00Z'}]});
 assert.equal(classifyRegion(alerts,{name:'Броварський район',oblast:'Київська область',type:'raion'}).severity,'red');
});
test('city alert is only a partial raion indication',()=>{
 const alerts=cleanAlerts([{location_title:'Бровари',location_oblast:'Київська область',location_raion:'Броварський район',location_type:'city',alert_type:'air_raid'}]);
 assert.equal(classifyRegion(alerts,{name:'Броварський район',oblast:'Київська область',type:'raion'}).severity,'partial');
 assert.equal(classifyRegion(alerts,{name:'Київська область',type:'oblast'}).severity,'partial');
 assert.equal(classifyRegion(alerts,{name:'Білоцерківський район',oblast:'Київська область',type:'raion'}).count,0);
});
test('drones are threat categories, not target counts',()=>{
 const alerts=cleanAlerts([{location_title:'Київська область',location_type:'oblast',location_oblast:'Київська область',alert_type:'air_raid',threats:[{threat_type:'drones'}]}]);
 assert.equal(matchesFilter(alerts[0],'drones'),true);
 assert.deepEqual(threatSummary(alerts),['drones']);
});
test('durations calculated from start time',()=>{
 assert.equal(duration('2026-11-02T08:00:00Z',Date.parse('2026-11-02T09:25:00Z')),'1 год 25 хв');
 assert.equal(duration(null),'час невідомий');
});

test('renamed rayons match legacy API naming',()=>{
 assert.equal(norm('Новомосковський район'),norm('Самарівський район'));
 assert.equal(norm('Червоноградський район'),norm('Шептицький район'));
 assert.equal(norm('Красноградський район'),norm('Берестинський район'));
 assert.equal(norm('Сєвєродонецький район'),norm('Сіверськодонецький район'));
});
