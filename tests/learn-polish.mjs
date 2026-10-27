import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.html',import.meta.url),'utf8');
const ctx=vm.createContext({window:{},escHtml:s=>s});
vm.runInContext(source.slice(source.indexOf('const LEARN_MARKER ='),source.indexOf('const LEARN_HELP =')),ctx);
const parse=text=>vm.runInContext('parseLearnExtras('+JSON.stringify(text)+')',ctx);
test('a final understanding question cannot prematurely complete a lesson',()=>{
 const p=parse('Correct. Why did you divide by two?\nRecap: Undo operations.\nWatch out: Both sides.\nTopic: Algebra');
 assert.equal(p.recap,''); assert.match(p.question,/Why did you/);
});
test('completed lesson without another question retains its recap',()=>{
 const p=parse('Exactly. You have finished!\nRecap: Undo operations.\nWatch out: Both sides.\nTopic: Algebra');
 assert.equal(p.recap,'Undo operations.');assert.equal(p.watch,'Both sides.');
});
test('step counts stay bounded and valid choices survive parsing',()=>{
 const p=parse('What next?\nProgress: 1/2\nChoices: Add | Subtract');
 assert.equal(p.progress.n,1);assert.equal(p.progress.total,2);assert.equal(p.choices.length,2);
 assert.equal(parse('Progress: 1/99').progress,null);
});
