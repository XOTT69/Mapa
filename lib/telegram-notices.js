import {regions} from '../public/regions.js';
const MAX_AGE=30*60*1000;
export function decodeText(html){
 return html.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,code)=>{
  if(code[0]==='#'){const n=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):parseInt(code.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}
  return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[code.toLowerCase()];
 }).normalize('NFC');
}
// Only explicit civilian alert announcements. No geocoding, headings, counts or target extraction.
export function regionalAnnouncement(text){
 const plain=text.toLowerCase().replace(/[’ʼ]/g,"'");
 if(/(?:фейк|спрост|нібито|повідомляли|не\s+оголош|немає\s+тривог|навчальн|тестов|тренув|учора|вчора|завтра|може\s+бути|можуть\s+оголосити)/u.test(plain))return null;
 const clear=/(?:відбій\s+(?:повітряної\s+)?тривоги|повітряну\s+тривогу\s+скасовано)/u.test(plain);
 const warning=/(?:оголошено\s+повітряну\s+тривогу|повітряна\s+тривога\s*[!.]|увага[!:\s]+повітряна\s+тривога)/u.test(plain);
 if(!clear&&!warning)return null;
 // A single region only; multi-region news roundups are intentionally ignored.
 const found=regions.map(([name])=>name).filter(name=>{
  if(name==='м. Київ')return /(?:^|[\s,!:.])(?:київ|києві|києва)(?=$|[\s,!:.])/u.test(plain);
  if(name.startsWith('м.')||name.startsWith('Автономна'))return false;
  const adjective=name.toLowerCase().split(' ')[0];
  const stem=adjective.slice(0,-1),root=adjective.replace(/ська$/,'');
  return new RegExp(stem+'(?:а|ій|ої)\\s+област[ьі]|'+root+'щин[аіу]','u').test(plain);
 });
 if(found.length!==1)return null;
 // Reject questions and quoted/commentary text; omitted statements stay omitted.
 if(/[?«»“”"]/.test(plain))return null;
 return {region:found[0],clear};
}
export function parsePublicChannel(html,source,now=Date.now()){
 if(!html.includes('tgme_channel_info')||!html.includes('tgme_widget_message'))throw Error('Public preview unavailable or unsupported');
 const pattern=/data-post="([a-zA-Z0-9_]+)\/(\d+)"/g;
 const matches=[...html.matchAll(pattern)];
 const posts=[];
 for(let i=0;i<matches.length;i++){
  const match=matches[i];if(match[1].toLowerCase()!==source.id)continue;
  const block=html.slice(match.index,matches[i+1]?.index??html.length);
  const raw=block.match(/<div\b[^>]*class="[^"]*\btgme_widget_message_text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const date=block.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1];
  const published=Date.parse(date);
  if(!raw||!Number.isFinite(published)||published>now||now-published>=MAX_AGE)continue;
  // Never interpret forwarded or embedded content as the channel's own announcement.
  if(/tgme_widget_message_forwarded_from|tgme_widget_message_reply/.test(block))continue;
  const event=regionalAnnouncement(decodeText(raw));if(!event)continue;
  posts.push({...event,published,id:match[2]});
 }
 const latest=new Map();
 for(const post of posts.sort((a,b)=>a.published-b.published||Number(a.id)-Number(b.id)))latest.set(post.region,post);
 return [...latest.values()].filter(post=>!post.clear).map(post=>({
  source:source.id,region:post.region,
  summary:source.official?'Джерело опублікувало регіональне попередження про повітряну тривогу.':'Додатковий канал опублікував регіональне попередження. Звіртеся з офіційним статусом тривоги.',
  url:'https://t.me/'+source.id+'/'+post.id,publishedAt:new Date(post.published).toISOString(),expiresAt:new Date(post.published+MAX_AGE).toISOString()
 }));
}
export async function readLimited(response,maxBytes){
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Response too large');chunks.push(value)}}finally{await reader.cancel()}
 return Buffer.concat(chunks).toString('utf8');
}
export async function collectChannels(sources,{fetcher=fetch,now=Date.now()}={}){
 const results=new Array(sources.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(5,sources.length)},async()=>{
  while(cursor<sources.length){const index=cursor++,source=sources[index];
   try{
    const response=await fetcher('https://t.me/s/'+source.id,{redirect:'error',signal:AbortSignal.timeout(4000),headers:{Accept:'text/html'}});
    if(!response.ok)throw Error('Unavailable');
    const notices=parsePublicChannel(await readLimited(response,1500000),source,now);
    results[index]={source:{...source,status:'available',checkedAt:new Date(now).toISOString()},notices};
   }catch{results[index]={source:{...source,status:'unavailable',checkedAt:new Date(now).toISOString()},notices:[]}}
  }
 }));
 const available=results.filter(r=>r.source.status==='available').length;
 return {status:available===sources.length?'live':available?'partial':'error',notices:results.flatMap(r=>r.notices),sources:results.map(r=>r.source)};
}
