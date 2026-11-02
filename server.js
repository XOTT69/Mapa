import http from 'node:http';import{readFile}from'node:fs/promises';import path from'node:path';
import alertsHandler from './api/alerts.js';
import noticesHandler from './api/notices.js';
const port=Number(process.env.PORT||3000);
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const handler=({'/api/alerts':alertsHandler,'/api/notices':noticesHandler})[u.pathname];
 if(handler){
  res.status=code=>{res.statusCode=code;return res};
  res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))};
  return handler(req,res);
 }
const p=path.resolve('public','.'+(u.pathname==='/'?'/index.html':u.pathname));if(!p.startsWith(path.resolve('public')+path.sep)){res.writeHead(403);return res.end();}try{const data=await readFile(p);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json'})[path.extname(p)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(port,()=>console.log('MAPA UA on '+port));