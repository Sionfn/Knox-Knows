import test from 'node:test';
import assert from 'node:assert/strict';
import {learnLessonContext as context, learnLessonReminder as reminder, normalizeLearnLesson as normalize} from '../api/_learn-progress.js';
const turn = (n=1,extra='') => ({role:'assistant',content:`Try this.\nYour turn: What changes?\nLesson plan: Understand balance | Solve independently\nProgress: ${n}/2${extra}`});
test('parts are fixed named goals and can contain several different questions',()=>{
 const state=context([turn()],'Subtract five from both sides');
 const next=normalize('Correct.\nYour turn: Why both sides?\nLesson plan: A changed plan | Another goal | A third goal\nProgress: 1/3',state);
 assert.match(next,/Lesson plan: Understand balance \| Solve independently/);
 assert.match(next,/Progress: 1\/2/);
 const after=context([{role:'assistant',content:next}],'To keep them equal');
 assert.match(normalize('Yes.\nYour turn: Try your own equation.\nLesson plan: Understand balance | Solve independently\nProgress: 2/2',after),/Progress: 2\/2/);
});
test('hints, wrong answers and incomplete answers do not advance parts or practice',()=>{
 for(const [question,opening] of [['Can I get a hint?','Try this.'],['I’m stuck','Try this.'],['Can you show an example?','Try this.'],['Can you make that multiple choice?','Try this.'],['15','Not quite.']]){
  const state=context([turn(1,'\nPractice: 1/4')],question);
  const out=normalize(`${opening}\nYour turn: What next?\nLesson plan: Understand balance | Solve independently\nProgress: 2/2\nPractice: 2/4`,state);
  assert.match(out,/Progress: 1\/2/); assert.match(out,/Practice: 1\/4/);
 }
});
test('plan size fits the request including a single-part lesson, without invented defaults',()=>{
 const state=context([],'What does numerator mean?');
 assert.match(normalize('A numerator counts selected pieces.\nYour turn: Which number is the numerator in 2/5?\nLesson plan: Read a fraction\nProgress: 1/1',state),/Progress: 1\/1/);
 const four='Identify the cause | Connect the evidence | Explain the mechanism | Apply the idea';
 assert.match(normalize('Try.\nYour turn: What do you notice?\nLesson plan: '+four+'\nProgress: 1/4',state),/Progress: 1\/4/);
 assert.doesNotMatch(normalize('What do you know?',state),/Progress:|Lesson plan:/);
 assert.match(reminder(state),/never default to three/);
});
test('practice question counts are independent of parts and cannot end early',()=>{
 const initial=context([],'Give me 4 practice questions on fractions.');
 const first=normalize('Try one.\nYour turn: Simplify 2/4.\nLesson plan: Simplify fractions\nProgress: 1/1\nPractice: 1/4',initial);
 const current=context([{role:'assistant',content:first}],'1/2');
 assert.equal(current.practiceTotal,4);
 const wrongEnd=normalize('Correct!\nRecap: Fractions done.\nTopic: Fractions\nLesson plan: Simplify fractions\nProgress: 1/1\nPractice: 4/4',current);
 assert.doesNotMatch(wrongEnd,/Recap:|Topic:/); assert.match(wrongEnd,/Practice: 2\/4/);
 const last=context([{role:'assistant',content:first.replace('Practice: 1/4','Practice: 4/4')}],'3/5');
 assert.match(normalize('Correct.\nRecap: Divide numerator and denominator by a common factor.\nLesson plan: Simplify fractions\nProgress: 1/1\nPractice: 4/4',last),/Recap:/);
});
test('completed lessons and explicit topic changes start a fresh map, not an old practice counter',()=>{
 const done={role:'assistant',content:'Correct.\nRecap: All done.\nLesson plan: Simplify fractions\nProgress: 1/1\nPractice: 4/4'};
 assert.equal(context([done],'Teach me seasons').practiceTotal,0);
 assert.deepEqual(context([done],'Teach me seasons').plan,[]);
 assert.equal(context([done],'Give me two more practice questions.').practiceTotal,2);
 assert.deepEqual(context([turn()],'Switch to photosynthesis').plan,[]);
});
test('a question/choice cannot masquerade as a completed recap, and hints cannot complete',()=>{
 const state=context([turn(2)],'Hint please');
 const out=normalize('Look at both sides.\nRecap: Done.\nLesson plan: Understand balance | Solve independently\nProgress: 2/2',state);
 assert.doesNotMatch(out,/Recap:/);
 assert.doesNotMatch(normalize('Great.\nYour turn: What is x?\nRecap: Done.\nLesson plan: Understand balance | Solve independently\nProgress: 2/2',context([turn(2)],'divide')),/Recap:/);
});
test('latest canonical reply survives long/trimmed history and invalid plans degrade safely',()=>{
 const history=Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',content:'old '+i}));
 history.push(turn(2));
 assert.equal(context(history,'x=7').part,2);
 for(const bad of ['x','one | one',Array(8).fill('goal').join('|'),'a'.repeat(65)]){
  const out=normalize('Try.\nYour turn: What next?\nLesson plan: '+bad+'\nProgress: 1/8',context([],'Teach me'));
  assert.doesNotMatch(out,/Lesson plan:|Progress:/);
 }
});
test('a casual interlude preserves the latest lesson map',()=>{
 const state=context([turn(2),{role:'user',content:'thanks'},{role:'assistant',content:'You’re welcome!'}],'x=7');
 assert.equal(state.part,2);assert.equal(state.plan.length,2);
});
