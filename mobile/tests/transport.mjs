import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/native-transport.js',import.meta.url),'utf8');
function setup(native=true){
 const sent=[],plain=[];let perform=async()=>({status:200,data:{ok:true},headers:{'Content-Type':'application/json'}});
 const ctx={Request,Response,Headers,URL,DOMException,Promise,TypeError,location:{href:'capacitor://localhost/index.html',origin:'capacitor://localhost'},document:{documentElement:{classList:{add(){}}}},fetch:async(...a)=>{plain.push(a);return new Response('original');},knoxMobileConfig:{apiOrigin:'https://www.knoxknowsapp.com'},Capacitor:{isNativePlatform:()=>native,getPlatform:()=> 'ios',Plugins:{},registerPlugin(name){const p={request:opts=>{sent.push(opts);return perform(opts);}};this.Plugins[name]=p;return p;}}};ctx.window=ctx;vm.runInNewContext(source,ctx);return{ctx,sent,plain,setPerform:fn=>perform=fn};
}
test('native API requests reach only the fixed HTTPS backend with exact JSON and auth',async()=>{
 const h=setup();const r=await h.ctx.fetch('/api/ask?x=1',{method:'POST',headers:{Authorization:'Bearer own','Content-Type':'application/json'},body:'{"question":"hello"}'});
 assert.deepEqual(await r.json(),{ok:true});assert.equal(h.sent.length,1);
 assert.equal(h.sent[0].url,'https://www.knoxknowsapp.com/api/ask?x=1');assert.equal(h.sent[0].data,'{"question":"hello"}');assert.equal(h.sent[0].headers.authorization,'Bearer own');assert.equal(h.sent[0].disableRedirects,true);
 assert.equal(h.sent[0].connectTimeout,70000,'iOS must not time out slow generation at 15 seconds');
 await h.ctx.fetch('https://example.invalid/api/ask');await h.ctx.fetch('/vendor/file.js');assert.equal(h.sent.length,1);assert.equal(h.plain.length,2);
});
test('HTTP errors remain errors; transport never retries failed or credit-consuming actions',async()=>{
 const h=setup();h.setPerform(async()=>({status:429,data:{error:'Wait'},headers:{}}));assert.equal((await h.ctx.fetch('/api/ask')).status,429);
 h.setPerform(async()=>{throw Error('offline');});await assert.rejects(h.ctx.fetch('/api/ask'),/Could not reach/);assert.equal(h.sent.length,2);
});
test('abort before dispatch sends nothing; abort after dispatch drops late replies',async()=>{
 const h=setup(),a=new AbortController();a.abort();await assert.rejects(h.ctx.fetch('/api/ask',{signal:a.signal}));assert.equal(h.sent.length,0);
 let finish;h.setPerform(()=>new Promise(r=>finish=r));const b=new AbortController(),r=h.ctx.fetch('/api/ask',{signal:b.signal});b.abort();await assert.rejects(r);finish({status:200,data:'late',headers:{}});assert.equal(h.sent.length,1);
});
test('normal browser fetch stays unchanged and request objects retain their method/body',async()=>{
 const web=setup(false);await web.ctx.fetch('/api/ask');assert.equal(web.sent.length,0);assert.equal(web.plain.length,1);
 const h=setup();await h.ctx.fetch(new Request('capacitor://localhost/api/me',{method:'POST',body:'{}'}));assert.equal(h.sent[0].method,'POST');assert.equal(h.sent[0].data,'{}');
});
