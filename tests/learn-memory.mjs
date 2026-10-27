import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const fn = runInNewContext('(' + source.slice(source.indexOf('function buildStudyHistory('), source.indexOf('\nwindow.appHandleAsk = async function()')) + ')');
const memory = () => { const map = new Map(); return { getItem:k=>map.get(k), setItem:(k,v)=>map.set(k,v) }; };
const opening = [{ role:'user',content:'Teach me equations in three parts' }, { role:'assistant',content:'Parts: addition, multiplication, practice.\nProgress: 1/3' }];
test('long Learn lessons retain their original goal and plan after rolling history and refresh', () => {
  const store=memory();
  assert.equal(fn(opening,'u1','lesson1',true,store).length,2);
  const later=Array.from({length:60},(_,i)=>({role:i%2?'assistant':'user',content:'later '+i}));
  const result=fn(later,'u1','lesson1',true,store);
  assert.equal(result.length,30); assert.equal(result[0].content,opening[0].content); assert.equal(result[1].content,opening[1].content);
  assert.equal(result.at(-1).content,'later 59');
  assert.ok(!fn(later,'u2','lesson1',true,store).some(m=>m.content===opening[0].content));
  assert.ok(!fn(later,'u1','lesson2',true,store).some(m=>m.content===opening[0].content));
});
test('Ask history and blocked storage remain usable and bounded', () => {
  const store=memory(); fn(opening,'u1','lesson1',true,store);
  const later=Array.from({length:60},(_,i)=>({role:i%2?'assistant':'user',content:'later '+i}));
  assert.equal(fn(later,'u1','lesson1',false,store).length,30);
  assert.equal(fn(opening,'u1','lesson1',true,{getItem(){throw Error('blocked')}}).length,2);
  const huge=[{role:'user',content:'x'.repeat(24001)},...opening];
  assert.equal(fn(huge,null,null,false,store).length,2);
});
test('a greeting cannot replace the actual task in long lesson memory',()=>{
 const store=memory();
 const start=[{role:'user',content:'hi'},{role:'assistant',content:'Hello!'},
  {role:'user',content:'Teach me the causes of World War 1'},
  {role:'assistant',content:'Start with alliances.\nLesson plan: Connect alliances | Explain the trigger\nProgress: 1/2'}];
 const first=fn(start,'u','s',true,store);
 assert.equal(first[0].content,'Teach me the causes of World War 1');assert.equal(first.length,2);
 const later=Array.from({length:50},(_,i)=>({role:i%2?'assistant':'user',content:'later '+i}));
 const restored=fn(later,'u','s',true,store);
 assert.equal(restored[0].content,start[2].content);assert.match(restored[1].content,/Lesson plan:/);
});
