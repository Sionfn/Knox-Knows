import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const read=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
function setup(saved=null) {
 const values=new Map(),events={},docEvents={}; let linkClick, back=0, assigned, scrolled, finished=0, shown=0;
 if(saved) {values.set('knoxLandingReturn',JSON.stringify(saved));values.set('knoxLandingReturnPending','1');}
 const root={style:{scrollBehavior:'smooth'}},classes=new Set();
 const link={href:'https://knox.test/about',hasAttribute:()=>false,addEventListener:(_,fn)=>linkClick=fn};
 const document={referrer:'https://knox.test/terms',readyState:'complete',documentElement:root,
 body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},
 querySelectorAll:()=>[link],addEventListener:(type,fn)=>docEvents[type]=fn};
 const ctx={URL,Date,JSON,Number,performance:{now:()=>500},scrollY:1650,
 location:{origin:'https://knox.test',pathname:'/about',search:'',hash:'#pricing',href:'https://knox.test/about#pricing',assign:u=>assigned=u},
 history:{length:5,back:()=>back++},document,
 sessionStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
 requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){},
 addEventListener:(type,fn)=>events[type]=fn,scrollTo:opts=>scrolled=opts.top,
 showLandingLoading:()=>shown++,finishLandingLoading:()=>finished++};
 ctx.window=ctx;
 return {ctx,values,events,docEvents,classes,link,click:e=>linkClick(e),state:()=>({back,assigned,scrolled,finished,shown})};
}
const saved=()=>({url:'/about#pricing',y:1650,at:Date.now()});
test('legal-page chain returns to saved landing URL, not the app or page top',()=>{
 const h=setup(saved());runInNewContext(read('legal-navigation.js'),h.ctx);
 let prevented=false;h.click({button:0,preventDefault:()=>prevented=true});
 assert.equal(prevented,true);assert.equal(h.state().assigned,'/about#pricing');assert.equal(h.state().back,0);
 assert.ok(h.classes.has('page-loading'));assert.equal(h.values.get('knoxLandingReturnPending'),'1');
});
test('direct landing referrer uses browser Back and ignores modifier clicks',()=>{
 const h=setup();h.ctx.document.referrer='https://knox.test/about#faq';
 runInNewContext(read('legal-navigation.js'),h.ctx);
 h.click({button:0,ctrlKey:true,preventDefault(){throw Error('must remain native');}});
 assert.equal(h.state().back,0);
 h.click({button:0,preventDefault(){}});assert.equal(h.state().back,1);
});
test('untrusted/expired saved URLs cannot redirect away from the landing page',()=>{
 for(const item of [{...saved(),url:'https://evil.example/about'},{...saved(),url:'/app'}, {...saved(),at:1}]) {
  const h=setup(item);runInNewContext(read('legal-navigation.js'),h.ctx);
  h.click({button:0,preventDefault(){throw Error('must use native /about');}});
  assert.equal(h.state().assigned,undefined);
 }
});
test('landing restores scroll before finishing its normal loader and consumes pending marker',()=>{
 const h=setup(saved());runInNewContext(read('landing-return.js'),h.ctx);
 h.ctx.finishLandingLoading();
 assert.equal(h.state().scrolled,1650);assert.equal(h.state().finished,1);
 assert.equal(h.ctx.document.documentElement.style.scrollBehavior,'smooth');
 assert.equal(h.values.has('knoxLandingReturnPending'),false);
});
test('landing departure records exact position and bfcache return restarts normal loading duration',()=>{
 const h=setup();runInNewContext(read('landing-return.js'),h.ctx);
 h.docEvents.click({button:0,target:{closest:()=>({href:'https://knox.test/privacy',hasAttribute:()=>false})}});
 assert.equal(JSON.parse(h.values.get('knoxLandingReturn')).y,1650);
 h.values.set('knoxLandingReturnPending','1');h.events.pageshow({persisted:true});
 assert.equal(h.ctx._landingLoadingShownAt,500);
 assert.equal(h.state().scrolled,1650);assert.equal(h.state().finished,1);
});
test('only one theme-controlled loader remains, with no OS-dark override or duplicate logo overlay',()=>{
 assert.doesNotMatch(read('legal-navigation.js'),/prefers-color-scheme|createElement|knoxPageTransition/);
 assert.match(read('legal-theme.css'),/--loader-page:#FFF8F0/);
 assert.match(read('legal-theme.css'),/--loader-page:#FBF3E5/);
 assert.match(read('index.html'),/src="\/landing-return.js"/);
});
