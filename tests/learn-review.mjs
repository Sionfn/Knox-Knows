import test from 'node:test';
import assert from 'node:assert/strict';
import { learningAssessment, recordLearnReview, loadLearnReview, learnReviewRoute, skillKey, reviewGuidance } from '../api/_learn-review.js';
import { learnLessonContext, normalizeLearnLesson, learnLessonIssue } from '../api/_learn-progress.js';
const DAY=86400000;
function memory() {
  const store=new Map();let tail=Promise.resolve(),writes=0;
  const ref=path=>({path,collection:n=>collection(path+'/'+n),get:async()=>snapshot(path)});
  const collection=path=>({doc:id=>ref(path+'/'+id)});
  const snapshot=path=>({exists:store.has(path),data:()=>store.get(path)});
  const db={collection,runTransaction(callback){const job=tail.then(async()=>{const ops=[];const value=await callback({get:r=>r.get(),set:(r,d)=>ops.push([r.path,d])});for(const [p,d]of ops){store.set(p,d);writes++;}return value;});tail=job.catch(()=>{});return job;}};
  return {db,store,get writes(){return writes;}};
}
const state={plan:['Use inverse operations','Check a solution'],part:1};
const answer=(assessment='partial',extra='')=>`You have the operation, but check both sides.\nYour turn: What changes?\nLesson plan: Use inverse operations | Check a solution\nProgress: 1/2\nAssessment: ${assessment}\nReview focus: Apply the same operation to both sides.${extra}`;
const event=(overrides={})=>({answer:answer(),state,sessionId:'lesson1',question:'private student wording',lastKnox:'What operation would isolate x?',now:100000,startedAt:99999,...overrides});
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(body){this.body=body;return this;}});
const auth={verifyIdToken:async token=>{if(!['a','b'].includes(token))throw Error('bad token');return {uid:token};}};
const route=(m,method,uid,body,query)=>{const r=res();return learnReviewRoute({method,headers:uid?{authorization:'Bearer '+uid}:{},body,query},r,{db:m.db,auth}).then(()=>r);};

test('review remembers only assessed difficulty, bounded general notes, never raw student messages',async()=>{
 const m=memory();
 for(const assessment of ['new','help','correct'])await recordLearnReview(m.db,'a',event({answer:answer(assessment)}));
 assert.equal(m.store.size,0);
 await recordLearnReview(m.db,'a',event());const items=await loadLearnReview(m.db,'a');
 assert.equal(items.length,1);assert.equal(items[0].label,state.plan[0]);assert.equal(items[0].pending,true);
 assert.equal(items[0].dueAt,100000);assert.equal((await loadLearnReview(m.db,'b')).length,0);
 assert.doesNotMatch(JSON.stringify([...m.store.values()]),/private student wording|What operation would isolate/);
 assert.equal(learningAssessment('**Assessment:** PARTIAL'),'partial');
  assert.equal(learningAssessment('Assessment: correct | partial'),'');
 assert.match(reviewGuidance(items),/not a diagnosis or proof/);
});
test('non-English skill labels retain distinct identities',async()=>{
 const m=memory();
 for(const label of ['理解分数模型','理解地球公转'])await recordLearnReview(m.db,'a',event({state:{plan:[label],part:1},question:label}));
 assert.equal((await loadLearnReview(m.db,'a')).length,2);
 assert.notEqual(skillKey('理解分数模型'),skillKey('理解地球公转'));
});
test('partial feedback holds goal/question even with a positive opening; invalid completion is repaired',()=>{
 const prior={role:'assistant',content:'Try.\nYour turn: What next?\nLesson plan: Use inverse operations | Check a solution\nProgress: 1/2\nPractice: 1/3'};
 const s=learnLessonContext([prior],'Subtract five');
 const raw='Yes, you found the operation, but used it on one side only.\nYour turn: Fix it.\nLesson plan: Use inverse operations | Check a solution\nProgress: 2/2\nPractice: 2/3\nAssessment: partial';
 assert.match(learnLessonIssue(raw,s),/CURRENT goal/);
 const normalized=normalizeLearnLesson(raw,s);assert.match(normalized,/Progress: 1\/2/);assert.match(normalized,/Practice: 1\/3/);
 assert.match(learnLessonIssue('Great.\nRecap: Done.\nAssessment: retry',s),/CURRENT goal/);
 assert.match(learnLessonIssue('Great.\nRecap: Done.\nAssessment: correct',{...s,question:'Can I get a hint?'}),/CURRENT goal/);
 const confidentState={...s,practiceTotal:0,question:'I’m not sure, but x=7 and substituting it gives the original total.'};
 const correct='Yes.\nRecap: Solved and checked.\nAssessment: correct';
 assert.equal(learnLessonIssue(correct,confidentState),'');assert.match(normalizeLearnLesson(correct,confidentState),/Recap:/);
});
test('full goal mastery schedules later review; a substep or repeated answer does not inflate mastery',async()=>{
 const m=memory();await recordLearnReview(m.db,'a',event());
 await recordLearnReview(m.db,'a',event({answer:answer('correct'),question:'right substep',now:101000}));
 assert.equal((await loadLearnReview(m.db,'a'))[0].pending,true);
 const done='Correct.\nRecap: Finished.\nProgress: 2/2\nAssessment: correct';
 await recordLearnReview(m.db,'a',event({answer:done,question:'full solution',now:102000}));
 let item=(await loadLearnReview(m.db,'a'))[0];assert.equal(item.pending,false);assert.equal(item.dueAt,102000+DAY);assert.equal(item.stage,0);
 const writes=m.writes;await recordLearnReview(m.db,'a',event({answer:done,question:'full solution',now:103000}));assert.equal(m.writes,writes);
 await recordLearnReview(m.db,'a',event({answer:done,question:'early review',sessionId:'early',now:103000}));
 item=(await loadLearnReview(m.db,'a'))[0];assert.equal(item.stage,0,'early practice does not earn a longer spacing interval');
 const due=item.dueAt;
 await recordLearnReview(m.db,'a',event({answer:done,question:'fresh review',sessionId:'later',now:due+1}));
 item=(await loadLearnReview(m.db,'a'))[0];assert.equal(item.stage,1);assert.equal(item.dueAt,due+1+3*DAY);
});
test('replayed/concurrent feedback is idempotent and review data stays bounded',async()=>{
 const m=memory();await Promise.all([recordLearnReview(m.db,'a',event()),recordLearnReview(m.db,'a',event())]);assert.equal(m.writes,1);
 for(let i=0;i<55;i++)await recordLearnReview(m.db,'a',event({state:{plan:['Solve skill '+i],part:1},question:'attempt '+i,now:200000+i,answer:answer()}));
 const doc=m.store.get('users/a/learning/review');assert.equal(doc.items.length,12);assert.equal(doc.events.length,40);assert.ok(JSON.stringify(doc).length<15000);
});
test('review API always uses authenticated ownership and rejects client-authored skills or scores',async()=>{
 const m=memory();await recordLearnReview(m.db,'a',event());await recordLearnReview(m.db,'b',event({state:{plan:['Read fractions'],part:1}}));
 assert.equal((await route(m,'GET',null)).code,401);assert.equal((await route(m,'GET','invalid')).code,401);assert.equal((await route(m,'PUT','a')).code,405);
 const own=await route(m,'GET','a',undefined,{uid:'b'});assert.equal(own.body.items[0].label,'Use inverse operations');assert.equal(own.headers['Cache-Control'],'no-store');
 assert.doesNotMatch(JSON.stringify(own.body),/lastCorrectSession|events|lastStruggleSession/);
 for(const body of [{items:[]},{remove:skillKey('Read fractions'),uid:'b'},{enabled:true,plan:'mega'},{remove:{}},{enabled:'false'}])assert.equal((await route(m,'POST','a',body)).code,400);
 await route(m,'POST','a',{remove:skillKey('Read fractions')});assert.equal((await loadLearnReview(m.db,'b')).length,1);
 await route(m,'POST','a',{remove:skillKey(state.plan[0])});assert.equal((await loadLearnReview(m.db,'a')).length,0);assert.equal((await loadLearnReview(m.db,'b')).length,1);
});
test('removing a topic or turning memory off prevents in-flight feedback from resurrecting it',async()=>{
 const m=memory();await recordLearnReview(m.db,'a',event());
 await route(m,'POST','a',{remove:skillKey(state.plan[0])});
 await recordLearnReview(m.db,'a',event({question:'late attempt',startedAt:0,now:Date.now()+10}));assert.equal((await loadLearnReview(m.db,'a')).length,0);
 await recordLearnReview(m.db,'a',event({question:'later lesson',startedAt:Date.now()+20,now:Date.now()+30}));assert.equal((await loadLearnReview(m.db,'a')).length,1);
 const off=await route(m,'POST','a',{enabled:false});assert.equal(off.body.enabled,false);assert.equal(off.body.items.length,0);
 const writes=m.writes;await recordLearnReview(m.db,'a',event({question:'while off',now:Date.now()+50}));assert.equal(m.writes,writes);
 await route(m,'POST','a',{enabled:true});
 await recordLearnReview(m.db,'a',event({question:'old request after re-enable',startedAt:0,now:Date.now()+60}));assert.equal((await loadLearnReview(m.db,'a')).length,0);
});
