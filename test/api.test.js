import test from 'node:test';
import assert from 'node:assert/strict';
import alerts from '../api/alerts.js';
import notices from '../api/notices.js';
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(code){this.statusCode=code;return this},json(data){this.data=data;return this}}}
test('API handles missing configuration and method restrictions',async()=>{
 const before={token:process.env.ALERTS_API_TOKEN,alias:process.env.ALERTS_TOKEN,feed:process.env.CHANNEL_NOTICES_URL};
 try{
  delete process.env.ALERTS_API_TOKEN;delete process.env.ALERTS_TOKEN;delete process.env.CHANNEL_NOTICES_URL;
  let res=response();await alerts({method:'GET'},res);assert.equal(res.statusCode,503);
  res=response();await notices({method:'GET'},res);assert.deepEqual(res.data,{status:'disabled',notices:[]});
  for(const handler of [alerts,notices]){res=response();await handler({method:'POST'},res);assert.equal(res.statusCode,405)}
 }finally{for(const [key,value] of [['ALERTS_API_TOKEN',before.token],['ALERTS_TOKEN',before.alias],['CHANNEL_NOTICES_URL',before.feed]]){if(value===undefined)delete process.env[key];else process.env[key]=value}}
});
test('upstream validation, cache, and stale fallback preserve last valid snapshot',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now,token=process.env.ALERTS_API_TOKEN;
 let now=Date.parse('2026-11-02T10:00:00Z'),calls=0;
 Date.now=()=>now;process.env.ALERTS_API_TOKEN='test-only';
 try{
  globalThis.fetch=async()=>({ok:true,json:async()=>({unexpected:true})});
  let res=response();await alerts({method:'GET'},res);assert.equal(res.statusCode,502);
  globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({alerts:[{id:1,alert_type:'air_raid'}]})}};
  res=response();await alerts({method:'GET'},res);assert.equal(res.data.alerts.alerts.length,1);const stamp=res.data.updatedAt;
  res=response();await alerts({method:'GET'},res);assert.equal(calls,1);
  now+=46000;globalThis.fetch=async()=>{throw Error('offline')};
  res=response();await alerts({method:'GET'},res);assert.equal(res.data.stale,true);assert.equal(res.data.updatedAt,stamp);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;if(token===undefined)delete process.env.ALERTS_API_TOKEN;else process.env.ALERTS_API_TOKEN=token}
});
