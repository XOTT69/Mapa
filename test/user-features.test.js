import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUserData,readUserData,upsertPlace,placeTransitions,newPlaceId} from '../public/user-features.js';
import {cleanAlerts} from '../public/alert-logic.js';
const region={type:'oblast',name:'Київська область',oblast:'Київська область'};
const place={id:'home',name:'Дім',watch:true,region};
const alerts=cleanAlerts([{location_title:'Київська область',location_oblast:'Київська область',location_type:'oblast',alert_type:'air_raid'}]);
test('corrupt or unavailable storage does not prevent map startup',()=>{
 assert.deepEqual(readUserData({getItem(){throw Error('blocked')}}),{preferences:{theme:'dark',sound:false,notifications:false},places:[]});
 assert.deepEqual(readUserData({getItem(){return '{invalid'}}).places,[]);
 assert.deepEqual(normalizeUserData({places:[{id:'x',name:'a',region:{type:'point',lat:50,lng:30}}]}).places,[]);
});
test('personal places have names and administrative scope, without a five-place paywall',()=>{
 let places=[];
 for(let i=0;i<12;i++)places=upsertPlace(places,'Місце '+i,region,'id'+i);
 assert.equal(places.length,12);
 const next=upsertPlace(places,'Місце 0',{...region,name:'Одеська область',oblast:'Одеська область'},'new-id');
 assert.equal(next.length,12);assert.equal(next[0].id,'id0');assert.equal(next[0].region.name,'Одеська область');
 assert.throws(()=>upsertPlace(places,'  ',region,'x'));
});
test('initial snapshot and unrelated regions do not send a new alert',()=>{
 assert.deepEqual(placeTransitions(null,alerts,[place]),[]);
 assert.deepEqual(placeTransitions([],alerts,[{...place,region:{type:'oblast',name:'Одеська область',oblast:'Одеська область'}}]),[]);
 assert.deepEqual(placeTransitions([],alerts,[{...place,watch:false}]),[]);
});
test('new alert and removal from fresh snapshot produce opposite transitions only once',()=>{
 assert.equal(placeTransitions([],alerts,[place])[0].kind,'active');
 assert.deepEqual(placeTransitions(alerts,alerts,[place]),[]);
 assert.equal(placeTransitions(alerts,[],[place])[0].kind,'clear');
 const artillery=cleanAlerts([{location_title:'Київська область',location_type:'oblast',alert_type:'artillery_shelling'}]);
 assert.deepEqual(placeTransitions([],artillery,[place]),[]);
});

test('place creation works when randomUUID is unavailable',()=>{
 assert.ok(newPlaceId({}).startsWith('place-'));
 assert.equal(newPlaceId({randomUUID:()=> 'supported-id'}),'supported-id');
});
