import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../app.html',import.meta.url),'utf8');
const deletion=html.slice(html.indexOf('async function deleteConversation('),html.indexOf('window.deleteConversation ='));
test('deletion batches messages and resets only the deleted active account/thread',async()=>{
  const commits=[];let reset=0;
  const pages=[400,2];
  const c={window:{currentUser:{uid:'u1'},_currentConversationId:'c1',appStartNewChat(){reset++;}},db:{},
    deletedHistory:new Set(),updateDoc:async()=>{},
    doc:(_, ...parts)=>parts.join('/'),collection:(parent,name)=>parent+'/'+name,query:x=>x,limit:()=>400,
    getDocs:async()=>({docs:Array.from({length:pages.shift()},(_,i)=>({ref:'message'+i}))}),
    writeBatch:()=>{const refs=[];return {delete:r=>refs.push(r),commit:async()=>commits.push(refs)};}};
  runInNewContext(deletion,c);await c.deleteConversation('c1');
  assert.equal(commits[0].length,400);assert.equal(commits[1].length,3);
  assert.equal(commits[1].at(-1),'users/u1/conversations/c1');assert.equal(reset,1);
});
test('failed deletion propagates for retry without resetting active chat',async()=>{
 const c={window:{currentUser:{uid:'u1'},_currentConversationId:'c1',appStartNewChat(){throw Error('must not reset');}},db:{},doc:()=>'',collection:()=>'',query:x=>x,limit:()=>400,getDocs:async()=>({docs:[]}),writeBatch:()=>({delete(){},commit:async()=>{throw Error('offline');}})};
 c.updateDoc=async()=>{};c.deletedHistory=new Set();
 runInNewContext(deletion,c);await assert.rejects(c.deleteConversation('c1'),/offline/);
});
test('legal navigation defaults to landing and restores previous landing entry',()=>{
 for(const file of ['privacy.html','terms.html','refund.html','updates.html']){
  const page=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.doesNotMatch(page,/href="\/"/);assert.match(page,/src="\/legal-navigation.js"/);
 }
 const script=readFileSync(new URL('../legal-navigation.js',import.meta.url),'utf8');
 for(const [ref,expected]of [['https://knox.test/about#pricing',true],['https://knox.test/app',false],['https://other.test/about',false]]){
  let handler,back=false,prevent=false;
  // Full DOM mock: legal-navigation.js also injects a loading overlay
  // (createElement/appendChild) and binds pageshow/popstate/click on
  // window and document. Without stubs for those, the IIFE throws before
  // we can invoke the /about handler under test.
  const stubEl=()=>({classList:{add(){},remove(){},contains:()=>false},setAttribute(){},appendChild(){},innerHTML:'',textContent:''});
  const doc={referrer:ref,head:stubEl(),body:stubEl(),
    querySelectorAll:sel=>sel==='a[href="/about"]'?[{addEventListener:(_,fn)=>handler=fn}]:[],
    createElement:()=>stubEl(),addEventListener(){}};
  const win={URL,location:{origin:'https://knox.test',href:'https://knox.test/privacy'},
    history:{length:3,back(){back=true;}},document:doc,addEventListener(){}};
  runInNewContext(script,{...win,window:win});
  handler({button:0,preventDefault(){prevent=true;}});assert.equal(back,expected);assert.equal(prevent,expected);
 }
});
