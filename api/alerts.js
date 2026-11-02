// Vercel serverless endpoint. Keep the alerts.in.ua token server-side.
let cached=null, fetchedAt=0, pending=null;
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  // Share successful responses briefly at Vercel's CDN to respect alerts.in.ua rate limits.
  const sendFresh=data=>{
    res.setHeader('Vercel-CDN-Cache-Control','public, s-maxage=20, stale-while-revalidate=15');
    return res.status(200).json(data);
  };
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const token=process.env.ALERTS_API_TOKEN || process.env.ALERTS_TOKEN;
  if(!token) return res.status(503).json({error:'Missing ALERTS_API_TOKEN environment variable'});
  const now=Date.now();
  if(cached && now-fetchedAt<45000) return sendFresh({alerts:cached,updatedAt:new Date(fetchedAt).toISOString()});
  if(!pending) pending=(async()=>{
    const response=await fetch('https://api.alerts.in.ua/v1/alerts/active.json',{
      headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok) throw new Error('upstream '+response.status);
    const data=await response.json();
    cached=data;fetchedAt=Date.now();return data;
  })().finally(()=>{pending=null});
  try{
    await pending;
    return sendFresh({alerts:cached,updatedAt:new Date(fetchedAt).toISOString()});
  }catch(e){
    if(cached) return res.status(200).json({alerts:cached,updatedAt:new Date(fetchedAt).toISOString(),stale:true});
    return res.status(502).json({error:'Alert service temporarily unavailable'});
  }
}
