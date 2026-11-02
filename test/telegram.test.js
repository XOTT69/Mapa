import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicChannel,regionalAnnouncement,collectChannels} from '../lib/telegram-notices.js';
import {CHANNEL_SOURCES} from '../lib/channel-sources.js';
const now=Date.parse('2026-11-02T10:20:00Z'),source={id:'test_channel',official:false};
const post=(id,text,date='2026-11-02T10:10:00Z')=>`<div class="tgme_widget_message" data-post="test_channel/${id}"><div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div><time datetime="${date}"></time></div>`;
const page=body=>'<div class="tgme_channel_info"></div>'+body;
test('registry preserves both similarly named sources and every new user source',()=>{
 for(const id of ['chyste_nebo','chyste_neboo','kyiv_m0nitoring','kievkyiv','mon1tor_ua'])assert.ok(CHANNEL_SOURCES.some(s=>s.id===id));
 assert.equal(CHANNEL_SOURCES.length,19);assert.equal(new Set(CHANNEL_SOURCES.map(s=>s.id)).size,19);
});
test('explicit regional announcement becomes a generic civilian bulletin',()=>{
 const notices=parsePublicChannel(page(post(1,'Київська область: оголошено повітряну тривогу!')),source,now);
 assert.equal(notices.length,1);assert.equal(notices[0].region,'Київська область');assert.ok(!notices[0].summary.includes('оголошено'));assert.equal(notices[0].url,'https://t.me/test_channel/1');
 assert.equal(regionalAnnouncement('У Києві оголошено повітряну тривогу!').region,'м. Київ');
});
test('all clear cancels an earlier message from the same channel',()=>{
 const html=page(post(1,'Київська область: оголошено повітряну тривогу!')+post(2,'Київська область: відбій повітряної тривоги!','2026-11-02T10:15:00Z'));
 assert.deepEqual(parsePublicChannel(html,source,now),[]);
});
test('no target tracking, ambiguous scope, expired, forwarded, or fabricated timing',()=>{
 for(const text of ['Київщина: 2 цілі на Вишневе, висота 200м','У Києві не оголошено повітряну тривогу','Київська область та Чернігівська область: оголошено повітряну тривогу!','Учора у Києві оголошено повітряну тривогу!'])assert.equal(regionalAnnouncement(text),null);
 const text='Київська область: оголошено повітряну тривогу!';
 for(const date of ['bad','2026-11-02T09:00:00Z','2026-11-02T10:21:00Z'])assert.deepEqual(parsePublicChannel(page(post(1,text,date)),source,now),[]);
 assert.deepEqual(parsePublicChannel(page(post(1,text).replace('<time','<span class="tgme_widget_message_forwarded_from"></span><time')),source,now),[]);
 assert.throws(()=>parsePublicChannel('<h1>Site Unavailable</h1>',source,now));
});
test('one failed channel does not hide working channels; broken previews are unavailable',async()=>{
 const result=await collectChannels([source,{id:'broken'}],{now,fetcher:async url=>new Response(url.endsWith('broken')?'Site Unavailable':page(post(1,'Київська область: оголошено повітряну тривогу!')))});
 assert.equal(result.status,'partial');assert.equal(result.notices.length,1);assert.equal(result.sources[1].status,'unavailable');
 const empty=await collectChannels([source],{now,fetcher:async()=>new Response(page(post(1,'Звичайні новини')))});
 assert.equal(empty.status,'live');assert.equal(empty.notices.length,0);
});
