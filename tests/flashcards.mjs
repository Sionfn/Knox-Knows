import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeck,parseLines,schedule,studyQueue,DAY} from '../flashcards-core.js';
test('import validates all cards, normalizes whitespace, resets foreign progress',()=>{
 assert.deepEqual(validateDeck({title:' Test ',cards:[{front:' A ',back:' B ',due:99}]}).cards[0],{front:'A',back:'B',due:0,interval:0,reviews:0});
 for(const value of [null,{}, {title:'x',cards:[]},{title:'x',cards:[{front:'',back:'a'}]},{title:'x',cards:[{front:'a',back:'b'.repeat(4001)}]}])assert.throws(()=>validateDeck(value));
});
test('bulk input supports spreadsheet tabs and rejects incomplete rows',()=>{
 assert.equal(parseLines('A\tB\r\nC\tD').length,2);assert.throws(()=>parseLines('missing delimiter'));
});
test('review grades schedule distinct intervals and preserve text',()=>{
 const c={front:'x',back:'y',interval:0};assert.equal(schedule(c,'again',100).due,60100);assert.equal(schedule(c,'good',100).due,100+DAY);assert.equal(schedule(c,'easy',100).due,100+3*DAY);assert.equal(schedule({...c,interval:3},'good',100).interval,6);assert.throws(()=>schedule(c,'oops'));
});
test('due selection excludes future reviews and practice includes all cards once',()=>{
 const cards=[{due:0},{due:10},{due:1000}];assert.deepEqual(studyQueue(cards,true,100,()=>.99),[0,1]);assert.deepEqual(studyQueue(cards,false,100,()=>.99),[0,1,2]);
});
