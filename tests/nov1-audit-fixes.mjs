import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {learnLessonContext,normalizeLearnLesson,correctedLessonState} from '../api/_learn-progress.js';
const app=readFileSync(new URL('../app.html',import.meta.url),'utf8');
const flame=readFileSync(new URL('../flamefest.js',import.meta.url),'utf8');
const poll=app.slice(app.indexOf('  async function pollForPlanUpdate('),app.indexOf('  window.pollForPlanUpdate ='));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
test('Plus to Mega waits through old Plus reads before refreshing shared controls',async()=>{
 let reads=0,refreshes=0;const plans=['super','super','max'];
 const c={window:{currentUser:{uid:'u'}},db:{},doc:()=>({}),getDoc:async()=>{const plan=plans[Math.min(reads++,2)];return {exists:()=>true,data:()=>({plan})}},fetchPlan:async()=>{refreshes++},setTimeout:fn=>fn()};
 runInNewContext(poll,c);await c.pollForPlanUpdate('u','max');assert.equal(reads,3);assert.equal(refreshes,1);
});
test('plan polling never applies the previous account response',async()=>{
 let refreshes=0;const d=deferred(),c={window:{currentUser:{uid:'old'}},db:{},doc:()=>({}),getDoc:()=>d.promise,fetchPlan:()=>{refreshes++},setTimeout:fn=>fn()};
 runInNewContext(poll,c);const work=c.pollForPlanUpdate('old','max');c.window.currentUser={uid:'new'};d.resolve({exists:()=>true,data:()=>({plan:'max'})});await work;assert.equal(refreshes,0);
});
function apiHarness({token=Promise.resolve('token'),fetch}={}){
 const c={window:{currentUser:{uid:'old',getIdToken:()=>token}},accountGeneration:0,testMode:false,demo:false,AbortSignal,fetch};
 runInNewContext(flame.slice(flame.indexOf('  const staleAccount'),flame.indexOf('  async function load()')),c);return c;
}
test('Flame Fest rejects late success and late HTTP errors from the previous account',async()=>{
 for(const ok of [true,false]){
  const d=deferred(),c=apiHarness({fetch:()=>d.promise}),work=c.api('GET');await Promise.resolve();
  c.window.currentUser={uid:'new'};c.accountGeneration++;d.resolve({ok,json:async()=>({giftCode:'old-account-gift'})});
  await assert.rejects(work,{name:'AbortError'});
 }
});
test('Flame Fest account changes while retrieving a token prevent sending the request',async()=>{
 const d=deferred();let requests=0;const c=apiHarness({token:d.promise,fetch:()=>{requests++}}),work=c.api('POST',{claim:'month'});
 c.window.currentUser={uid:'new'};c.accountGeneration++;d.resolve('old-token');await assert.rejects(work,{name:'AbortError'});assert.equal(requests,0);
});
test('an obsolete calendar load cannot overwrite the new calendar or stop its spinner',async()=>{
 const d=deferred(),c={demo:false,state:null,accountGeneration:0,loading:false,error:'',render(){},api:()=>d.promise};
 runInNewContext(flame.slice(flame.indexOf('  async function load()'),flame.indexOf('  // ── Calendar')),c);
 const work=c.load();c.accountGeneration++;c.state={giftCode:'new'};c.loading=true;d.resolve({giftCode:'old'});await work;
 assert.equal(c.state.giftCode,'new');assert.equal(c.loading,true);
});
function deletionHarness({count=0,photoError=false}={}){
 const photos=new Set(Array.from({length:count},(_,i)=>'photo'+i));let parent=true;
 const c={SOURCE_CHUNKS:6,window:{currentUser:{uid:'u'},_currentConversationId:null},db:{},deletedHistory:new Set(),doc:(_, ...a)=>a.join('/'),collection:(p,n)=>p+'/'+n,query:(path,limit)=>({path,limit}),limit:n=>n,updateDoc:async()=>{},
 getDocs:async q=>{if(q.path.endsWith('/photos')){if(photoError)throw Error('photos offline');return {docs:[...photos].slice(0,q.limit).map(ref=>({ref}))};}return {docs:[]};},
 writeBatch:()=>{const refs=[];return {delete:r=>refs.push(r),commit:async()=>{for(const r of refs){if(r==='users/u/conversations/c')parent=false;photos.delete(r)}}}}};
 runInNewContext(app.slice(app.indexOf('async function deleteConversation('),app.indexOf('window.deleteConversation =')),c);return {c,photos,parent:()=>parent};
}
test('conversation deletion drains more than 400 photos before removing the parent',async()=>{
 const h=deletionHarness({count:805});await h.c.deleteConversation('c');assert.equal(h.photos.size,0);assert.equal(h.parent(),false);
});
test('photo read failure leaves the deleting conversation available for retry',async()=>{
 const h=deletionHarness({count:2,photoError:true});await assert.rejects(h.c.deleteConversation('c'),/photos offline/);assert.equal(h.parent(),true);assert.equal(h.photos.size,2);assert.equal(h.c.deletedHistory.size,0);
});
test('correcting a misread worksheet replaces unrelated goals, while student mistakes and hints keep them',()=>{
 const history=[{role:'assistant',content:'Try.\nYour turn: Rewrite n choose 4.\nLesson plan: Rewrite binomial coefficients | Simplify factorials\nProgress: 1/2'}];
 const c=learnLessonContext(history,'You misread the photo. It is an order-of-operations problem.');assert.equal(c.plan.length,0);
 const fixed=normalizeLearnLesson('Try.\nYour turn: What is 1+2?\nLesson plan: Evaluate parentheses | Multiply and divide\nProgress: 1/2',c);assert.match(fixed,/Lesson plan: Evaluate parentheses/);
 for(const q of ['I got that wrong','Hint please','Can you show another example?','3','The photo shows n choose 4'])assert.equal(learnLessonContext(history,q).plan[0],'Rewrite binomial coefficients');
});

test('Knox admitting it misread the photo can replace the map without resetting ordinary feedback',()=>{
 const state=learnLessonContext([{role:'assistant',content:'Try.\nLesson plan: Rewrite binomial coefficients | Simplify factorials\nProgress: 1/2'}],'📷 Photo');
 const fixed='Sorry—I misread it before; this is order of operations.\nYour turn: What is 1+2?\nLesson plan: Evaluate parentheses | Multiply and divide\nProgress: 1/2\nAssessment: new';
 const next=correctedLessonState(fixed,state);assert.equal(next.plan.length,0);assert.match(normalizeLearnLesson(fixed,next),/Lesson plan: Evaluate parentheses/);
 for(const answer of [fixed.replace('Assessment: new','Assessment: retry'),fixed.replace('I misread it before','You made a mistake')])assert.equal(correctedLessonState(answer,state),state);
});
