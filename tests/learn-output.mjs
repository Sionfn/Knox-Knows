import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeLearnOutput,LEARN_RESPONSE_FORMAT} from '../api/_learn-output.js';
import {learningAssessment} from '../api/_learn-review.js';
const reply=(overrides={})=>({body:'Compare equal-sized wholes.\nAssessment: correct',question:'Which has bigger pieces?',choices:[],goals:['Compare fractions'],part:1,practiceIndex:0,assessment:'partial',reviewFocus:'Compare piece sizes.',keyIdea:'Equal wholes matter.',graph:'',visual:'fraction | 2/3',video:'',recap:'',watchOut:'',topic:'',...overrides});
test('structured Learn data maps to existing history/cards with authoritative grading and bounded practice counts',()=>{
 const raw=decodeLearnOutput(JSON.stringify(reply()),{practiceTotal:3,practiceN:1});
 assert.match(raw,/Lesson plan: Compare fractions/);assert.match(raw,/Visual: fraction \| 2\/3/);assert.match(raw,/Practice: 1\/3/);assert.match(raw,/Your turn: Which has bigger pieces/);
 assert.equal(learningAssessment(raw),'partial');assert.doesNotMatch(raw,/Assessment: correct/);
 assert.equal(LEARN_RESPONSE_FORMAT.json_schema.strict,true);assert.equal(LEARN_RESPONSE_FORMAT.json_schema.schema.additionalProperties,false);
});
test('malformed structured replies never leak JSON or missing required goal/assessment data into a lesson',()=>{
 for(const value of [reply({goals:[]}),reply({part:2}),reply({assessment:'maybe'}),reply({question:'',choices:[]}),reply({choices:[1,2]}),reply({goals:['one','one']}),{...reply(),toString:'not a lesson'}])assert.throws(()=>decodeLearnOutput(JSON.stringify(value)));
 assert.throws(()=>decodeLearnOutput('{"body":'));
 const old='Try.\nYour turn: What next?\nLesson plan: Compare fractions\nProgress: 1/1';assert.equal(decodeLearnOutput(old),old,'plain saved-provider compatibility remains');
});
test('completed structured replies carry a recap rather than another compulsory exercise',()=>{
 const raw=decodeLearnOutput(JSON.stringify(reply({body:'Yes, that is right.',question:'',assessment:'correct',reviewFocus:'',visual:'',recap:'Equal numerators mean equal counts of pieces.',watchOut:'Use equal wholes.',topic:'Compare fractions'})));
 assert.match(raw,/Recap:/);assert.doesNotMatch(raw,/Your turn:|Review focus:/);
});
