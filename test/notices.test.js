import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNotices} from '../api/notices.js';
const now=Date.parse('2026-11-02T10:30:00Z'),allowed=new Set(['channel_name']);
const item={source:'channel_name',region:'Київська область',summary:'Попередження',url:'https://t.me/channel_name/123',publishedAt:'2026-11-02T10:00:00Z',expiresAt:'2026-11-02T11:00:00Z'};
test('regional bulletin strips operational fields and deduplicates',()=>{
 const notices=normalizeNotices([{...item,lat:50,lng:30,route:[[50,30]],heading:90},item],allowed,now);
 assert.equal(notices.length,1);assert.equal('lat' in notices[0],false);assert.equal('route' in notices[0],false);
});
test('rejects expired, future, unknown, spoofed and long-lived bulletins',()=>{
 for(const patch of [{expiresAt:'2026-11-02T10:29:00Z'},{publishedAt:'2026-11-02T10:31:00Z'},{region:'Невідома область'},{source:'bad_channel'},{url:'https://t.me.evil.test/channel_name/123'},{url:'https://t.me/other_channel/123'},{url:'javascript:alert(1)'},{expiresAt:'2026-11-03T10:00:00Z'}])assert.deepEqual(normalizeNotices([{...item,...patch}],allowed,now),[]);
});
