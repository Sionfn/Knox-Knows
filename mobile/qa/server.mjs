// LOCAL QA ONLY: real app interface and readers, fake Firebase/API/native plugins.
// Does not sign in to production, send AI requests, charge credits, or delete data.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {authStub,storeStub} from './fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../www');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');let name=u.pathname==='/'||u.pathname==='/app'?'index.html':decodeURIComponent(u.pathname).slice(1);
 if(name.startsWith('app-shell/'))name='assets/'+name.slice(10);
 if(name==='qa-native.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(new URL('./bootstrap.js',import.meta.url)));return;}
 if(name==='vendor/firebase-app.js'){res.setHeader('Content-Type','text/javascript');res.end('export const initializeApp=()=>({});');return;}
 if(name==='vendor/firebase-auth.js'||name==='vendor/firebase-firestore.js'){res.setHeader('Content-Type','text/javascript');res.end(name.includes('auth')?authStub:storeStub);return;}
 if(u.pathname.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');let body='';req.on('data',d=>body+=d);req.on('end',()=>{
   const request=JSON.parse(body||'{}');let result={};
   if(u.pathname==='/api/me')result=u.searchParams.get('route')==='tester-plan'?{available:false}:u.searchParams.get('route')==='learn-review'?{items:[],enabled:true}:request.action==='request-account-deletion'?{requestId:'qa-request',status:'requested'}:{plan:req.headers['x-qa-plan']==='mega'?'max':req.headers['x-qa-plan']==='free'?'free':'super',tier:req.headers['x-qa-plan']||'plus',usage:{remaining:10,isDailyBank:req.headers['x-qa-plan']==='free'}};
   if(u.pathname==='/api/ask'){
    if(String(request.question).includes('[QA fail]')){res.statusCode=503;result={error:'QA simulated server failure'};}
    else if(String(request.question).includes('[QA casual]'))result={answer:'Hello!',isCasual:true,model:'qa-fixture'};
    else if(request.image&&!request.learnMode)result={answer:'**QA photo received** — '+request.imageType+'. This is the local transport test, not a live AI answer.',model:'qa-fixture'};
    else if(request.learnMode&&String(request.question).includes('3/4'))result={answer:'Correct. With equal numerators, the smaller denominator gives the larger fraction.\nRecap: Compare equal parts of the same whole.\nWatch out: Always compare the same-sized whole.\nLesson plan: Compare fractions\nProgress: 1/1\nAssessment: correct',model:'qa-fixture'};
    else result={answer:request.learnMode?'Equal parts of one whole.\nYour turn: Which fraction is larger?\nLesson plan: Compare fractions\nProgress: 1/1\nAssessment: new':'**Answer: 5**',model:'qa-fixture'};
   }
   if(u.pathname==='/api/flame-fest')result={event:{start:'2026-11-01',end:'2026-11-30',claimUntil:'2026-12-07'},days:[],shielded:[],claimed:{},rewards:[],shields:0,flameStyles:['classic'],flameStyle:'classic'};
   res.end(JSON.stringify(result));
  });return;
 }
 const target=path.resolve(root,name);if(!target.startsWith(root+'/')||!fs.existsSync(target)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.woff2':'font/woff2'})[path.extname(target)]||'application/octet-stream');let data=fs.readFileSync(target);if(name==='index.html'){data=data.toString().replace('<head>','<head><script src="/qa-native.js"></script>');if(u.searchParams.has('qa-web'))data=data.replace('if (window.knoxAppShell && !window.knoxNativeApp) document.write','if (false) document.write');}res.end(data);
});
await new Promise(r=>server.listen(Number(process.env.KNOX_QA_PORT)||0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
console.log('Mocked mobile QA ready at '+origin+' (no production API/Firebase calls).');
