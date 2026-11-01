import test from 'node:test';import assert from 'node:assert/strict';
import {homeSummary,planDetails,escapeHtml} from '../assets/home-model.js';
const own={uid:'alice',sourceUid:'alice',decks:[{id:'a',title:'Fractions',count:10,due:3},{id:'b',title:'Biology',count:15,due:7}],history:[{id:'lesson',title:'Adding fractions',kind:'learn'},{id:'question',title:'What is a cell?',kind:'chat'}]};
test('Home shows real deck counts/due counts and the latest available lesson',()=>{
 const result=homeSummary(own);assert.equal(result.due,10);assert.equal(result.totalCards,25);assert.equal(result.decks[0].id,'b');assert.equal(result.recentLesson.id,'lesson');assert.equal(result.history.length,2);
});
test('Home rejects stale activity from another account, including signed-out state',()=>{
 for(const uid of ['bob','guest']){const r=homeSummary({...own,uid});assert.deepEqual(r,{decks:[],history:[],due:0,totalCards:0,recentLesson:null});}
});
test('corrupt/duplicate summaries cannot inflate due counts or produce invalid resume links',()=>{
 const result=homeSummary({...own,decks:[...own.decks,{id:'a',title:'Duplicate',count:300,due:300},{id:'bad',title:'Bad',count:Infinity,due:Infinity},{id:'c',title:'Valid',count:2,due:999}],history:[null,{},...own.history,...own.history]});
 assert.equal(result.due,12);assert.equal(result.totalCards,27);assert.equal(result.history.length,2);assert.equal(result.decks.at(-1).due,2);
});
test('empty Home does not invent progress or history; only current plan gets the active badge',()=>{
 assert.equal(homeSummary().recentLesson,null);assert.equal(homeSummary().due,0);
 assert.equal(planDetails('free').suggested.id,'plus');assert.equal(planDetails('plus').suggested.id,'mega');assert.equal(planDetails('mega').suggested,null);assert.equal(planDetails('invented').current.id,'free');
 assert.ok(planDetails('plus').current.features.some(t=>t.includes('15 cards')));assert.ok(planDetails('mega').current.features.some(t=>t.includes('40 cards')));
});
test('account names, lesson titles and deck IDs are escaped at the rendering boundary',()=>{
 assert.equal(escapeHtml('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');assert.equal(escapeHtml("a'b&c"),'a&#39;b&amp;c');
});
