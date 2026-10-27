import test from 'node:test';
import assert from 'node:assert/strict';
import {requestedPracticeCount, honestLearnProgress} from '../api/_learn-progress.js';
test('open conceptual lessons have no guessed numeric progress',()=>{
 assert.equal(requestedPracticeCount([],"Teach me seasons. I'm in 7th grade."),0);
 assert.equal(honestLearnProgress('An explanation.\nProgress: 3/3\nYour question?',0),'An explanation.\n\nYour question?');
 assert.equal(honestLearnProgress('A hint.\n**Progress:** 1/3',0),'A hint.');
});
test('explicit practice sets retain their requested denominator through follow-ups',()=>{
 const history=[{role:'user',content:'Give me three practice questions, one at a time.'},{role:'assistant',content:'Question 1'},{role:'user',content:'I need a hint.'}];
 assert.equal(requestedPracticeCount(history,'7'),3);
 assert.equal(requestedPracticeCount(history,'Give me 5 more practice questions.'),5);
 assert.equal(honestLearnProgress('Next.\nProgress: 2/4',3),'Next.\nProgress: 2/3');
 assert.equal(requestedPracticeCount([], 'I solved 3 problems.'),0);
});
