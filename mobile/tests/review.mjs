import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../flashcards.js',import.meta.url),'utf8');
test('app review clears stale measured height so rotation cannot hide grading controls',()=>{
 const code=source.slice(source.indexOf('function evenCards(d){'),source.indexOf("window.addEventListener('resize'"));
 const removed=[],face={style:{removeProperty:k=>removed.push(k)}},card={querySelectorAll:()=>[face]};
 const ctx={window:{knoxAppShell:true},panel:{querySelector:()=>card},session:{evenWidth:640,evenHeight:480}};
 vm.runInNewContext(code+';evenCards({cards:[]});',ctx);assert.deepEqual(removed,['min-height']);
});
test('cancelling a replacement review cannot discard the current editor',async()=>{
 const code=source.slice(source.indexOf('  async review(id){'),source.indexOf('\n };',source.indexOf('  async review(id){'))).trim();
 let started=0;const ctx={canSee:()=>true,identity:'alice',key:()=> 'alice',decks:[{id:'other',cards:[]}],open:async()=>false,start:()=>started++,studyQueue:()=>[]};
 const hooks=vm.runInNewContext('({'+code+'})',ctx);assert.equal(await hooks.review('other'),false);assert.equal(started,0);
});
