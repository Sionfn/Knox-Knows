import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../../app-shell/native-ui.js',import.meta.url),'utf8');const code=s.slice(s.indexOf('async function navigate(target){'),s.indexOf('\nasync function newStudy(){'))+'\nnavigate;';
test('opening Calculator records its origin before switching the current tab',async()=>{
 for(const origin of ['learn','chat','home','account','flashcards']){
  const c={busy:false,current:origin,calculatorReturn:'home',cameraBusy:false,matchMedia:()=>({matches:true}),mode:()=>origin,$:()=>({classList:{contains:()=>false}}),saveDraft(){},note(){},surface(){},sync(){},quiet(){},p:{haptics:{selectionChanged(){}}},document:{activeElement:null}};
  c.window={knoxFlashcardsMobile:{hide(){}},openCalc(){assert.equal(c.calculatorReturn,origin);},closeMobileHistory(){},closeUserDropdown(){}};
  const navigate=vm.runInNewContext(code,c);assert.equal(await navigate('calculator'),true);assert.equal(c.current,'calculator');assert.equal(c.calculatorReturn,origin);
 }
});
