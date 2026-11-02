import {regions} from '../public/regions.js';
import {norm} from '../public/alert-logic.js';

const regionNames=new Map(regions.map(([name])=>[norm(name),name]));
// Public regional bulletins only. Unknown channels and expired records are discarded.
export function normalizeNotices(items,allowed,now=Date.now()){
 if(!Array.isArray(items))throw Error('Expected notices array');
 const seen=new Set();
 return items.slice(0,500).flatMap(item=>{
  if(!item||typeof item!=='object')return [];
  const source=String(item.source||'').replace(/^@/,'').toLowerCase();
  const region=regionNames.get(norm(item.region));
  const published=Date.parse(item.publishedAt),expires=Date.parse(item.expiresAt);
  let url;try{url=new URL(item.url)}catch{return []}
  if(!allowed.has(source)||!region||!Number.isFinite(published)||!Number.isFinite(expires)||published>now||expires<=now||expires<=published||expires-published>6*3600000)return [];
  if(url.protocol!=='https:'||url.hostname!=='t.me'||url.port||url.username||url.password||!new RegExp('^/'+source+'/[0-9]+/?$','i').test(url.pathname))return [];
  const summary=String(item.summary||'').trim().slice(0,600);
  const key=source+'|'+url.pathname.toLowerCase()+'|'+region;
  if(!summary||seen.has(key))return [];
  seen.add(key);
  // Deliberately omit coordinates, target counts, headings, and route fields.
  return [{source,region,summary,url:url.origin+url.pathname,publishedAt:new Date(published).toISOString(),expiresAt:new Date(expires).toISOString()}];
 });
}
let cached=null,pending=null;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const feed=process.env.CHANNEL_NOTICES_URL;
 const allowed=new Set((process.env.CHANNEL_ALLOWLIST||'').split(',').map(s=>s.trim().replace(/^@/,'').toLowerCase()).filter(s=>/^[a-z0-9_]{5,32}$/.test(s)));
 if(!feed||!allowed.size)return res.status(200).json({status:'disabled',notices:[]});
 try{
  const url=new URL(feed);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('HTTPS required');
  if(cached&&Date.now()-cached.at<45000)return res.status(200).json({status:'live',notices:normalizeNotices(cached.notices,allowed)});
  if(!pending)pending=(async()=>{
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('Feed unavailable');
   // Bound response size even when Content-Length is absent.
   const reader=response.body.getReader();let size=0;const chunks=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>256000)throw Error('Feed too large');chunks.push(value)}}finally{await reader.cancel()}
   const bytes=Buffer.concat(chunks);
   const notices=normalizeNotices(JSON.parse(bytes.toString('utf8')).notices,allowed);
   cached={at:Date.now(),notices};return notices;
  })().finally(()=>{pending=null});
  return res.status(200).json({status:'live',notices:await pending});
 }catch{return res.status(502).json({status:'error',notices:[],error:'Regional bulletin source unavailable'})}
}
