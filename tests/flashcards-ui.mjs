import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeck,schedule,studyQueue,parseTable,rowsToCards,parseList,parsePasted,toCsv,toTabText,cleanImage} from '../flashcards-core.js';
const source=readFileSync(new URL('../flashcards.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');

function harness(){
  const listeners={}, handlers={}, storage=new Map(); let resolveFetch, requests=0;
  const topic={value:'Private study topic',focus(){}};
  const face=()=>({attrs:{},setAttribute(k,v){this.attrs[k]=v;}});
  const front=face(),back=face();
  const card={...face(),classList:{toggle(){}},querySelector:s=>s==='.front'?front:back};
  const controls={innerHTML:''};
  function element(){return {hidden:false,className:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},append(){},addEventListener(n,fn){handlers[n]=fn;},querySelector(s){return s==='#fcMakeReq'?topic:s==='.fc-card'?card:s==='#fcControls'?controls:null;},querySelectorAll(){return [];}};}
  const window={currentUser:{uid:'a',getIdToken:async()=> 'token-a'},userPlan:'super',addEventListener(n,fn){listeners[n]=fn;}};
  const context=vm.createContext({window,document:{createElement:element,querySelector:element,querySelectorAll:()=>[],addEventListener(){},body:{classList:{add(){},remove(){},contains(){return false;}}}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},fetch:()=>{requests++;return new Promise(r=>resolveFetch=r);},AbortSignal,validateDeck,schedule,studyQueue,parseTable,rowsToCards,parseList,parsePasted,toCsv,toTabText,cleanImage,setTimeout:()=>0,clearTimeout(){},crypto:{randomUUID:()=> 'deck'},structuredClone,console,Blob,URL});
  vm.runInContext(source+'\nwindow.testAPI={state:()=>({identity,editing,request:makeOpts.request}),makeDeck,close,home,flip,setupStudy:()=>{decks=[{id:"d",cards:[{front:"Question",back:"Secret answer"}]}];session={id:"d",queue:[0],flipped:false};}};',context);
  return {window,listeners,handlers,topic,front,back,api:window.testAPI,requests:()=>requests,resolve:()=>resolveFetch({ok:true,json:async()=>({title:'Private deck',cards:[{front:'Question',back:'Secret answer'}]})})};
}
test('generated content is discarded after account switches, including switching back',async()=>{
  for(const backToA of [false,true]){
    const h=harness(), pending=h.api.makeDeck(); await new Promise(r=>setImmediate(r));
    h.window.currentUser={uid:'b',getIdToken:async()=> 'b'};h.listeners['knox-auth-changed']();
    if(backToA){h.window.currentUser={uid:'a',getIdToken:async()=> 'a'};h.listeners['knox-auth-changed']();}
    h.resolve();await pending;
    assert.equal(h.api.state().editing,null);assert.equal(h.api.state().request,'');
  }
});
test('leaving flashcards discards pending generation',async()=>{
  const h=harness(), pending=h.api.makeDeck();await new Promise(r=>setImmediate(r));
  h.api.close();h.resolve();await pending;assert.equal(h.api.state().editing,null);
});
test('normal generation still opens editable cards',async()=>{
  const h=harness(),pending=h.api.makeDeck();await new Promise(r=>setImmediate(r));h.resolve();await pending;
  assert.equal(h.api.state().editing.title,'Private deck');
});
test('invalid topic restores the clicked button and makes no request',async()=>{
  const h=harness();h.topic.value='';const button={dataset:{action:'make-go'},disabled:false};
  await h.handlers.click({target:{closest:()=>button}});
  assert.equal(button.disabled,false);assert.equal(h.requests(),0);
});
test('flip toggles hidden accessibility faces in both directions',()=>{
  const h=harness();h.api.setupStudy();h.api.flip();
  assert.equal(h.front.attrs['aria-hidden'],'true');assert.equal(h.back.attrs['aria-hidden'],'false');
  h.api.flip();assert.equal(h.front.attrs['aria-hidden'],'false');assert.equal(h.back.attrs['aria-hidden'],'true');
  assert.match(source,/class="fc-face back" aria-hidden="\$\{!s.flipped\}"/);
});
test('analytics respects stored consent and privacy signals',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const start=html.indexOf('window.dataLayer =');
  const script=html.slice(start,html.indexOf('</script>',start));
  for(const [dnt,gpc,consent,expected]of [['1',false,'1',0],['0',true,'1',0],['0',false,'0',0],['0',false,'1',1]]){
    let appended=0;const window={};
    const ctx={window,navigator:{doNotTrack:dnt,globalPrivacyControl:gpc},document:{createElement:()=>({}),head:{appendChild(){appended++;}}},localStorage:{getItem:()=>consent}};
    Object.defineProperty(ctx,'dataLayer',{get:()=>window.dataLayer});
    vm.runInNewContext(script,ctx);assert.equal(appended,expected);
  }
});

test('decks sync with the account: newer copy wins, deletions travel, local pictures stay', async () => {
  const storage = new Map(), remote = new Map();
  const window = { currentUser: { uid: 'a' }, userPlan: 'free', addEventListener() {},
    knoxDeckStore: { list: async () => [...remote].map(([id, v]) => ({ id, ...v })), put: async (uid, id, v) => { remote.set(id, structuredClone(v)); } } };
  const el = () => ({ hidden: true, className: '', innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, append() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const ctx = vm.createContext({ window, document: { createElement: el, querySelector: el, querySelectorAll: () => [], addEventListener() {}, body: { classList: { add() {}, remove() {}, contains: () => false } } },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }, validateDeck, schedule, studyQueue, parseTable, rowsToCards, parseList, parsePasted, toCsv, toTabText, cleanImage,
    setTimeout: () => 0, clearTimeout() {}, crypto: { randomUUID: () => 'x' }, structuredClone, console, Blob, URL, Date });
  vm.runInContext(source + '\nwindow.t={load,save,pullDecks,pushDecks,decks:()=>decks};', ctx);
  const t = window.t; t.load();
  const deck = (id, title, extra = {}) => ({ id, title, cards: [{ front: 'Q', back: 'A', due: 0, interval: 0, reviews: 0, ...extra }] });

  // A deck made on this device goes up to the account.
  t.save([deck('d1', 'Biology', { image: 'data:image/jpeg;base64,AAAA' })]);
  await t.pushDecks();
  assert.equal(JSON.parse(remote.get('d1').data).title, 'Biology');

  // Another device edits it later: pulling brings the newer copy (and keeps this device's picture if the account copy left it out).
  const newer = deck('d1', 'Biology (edited)', { localImage: true });
  remote.set('d1', { data: JSON.stringify({ ...newer, updatedAt: Date.now() + 5000 }), title: 'Biology (edited)', updatedAt: Date.now() + 5000 });
  remote.set('d2', { data: JSON.stringify({ ...deck('d2', 'History'), updatedAt: 5 }), title: 'History', updatedAt: 5 });
  assert.equal(await t.pullDecks(), true);
  assert.deepEqual(t.decks().map(d => d.title).sort(), ['Biology (edited)', 'History']);
  assert.equal(t.decks().find(d => d.id === 'd1').cards[0].image, 'data:image/jpeg;base64,AAAA');

  // Deleting here leaves a marker in the account; a marker from elsewhere removes the deck here.
  t.save(t.decks().filter(d => d.id !== 'd2'));
  await t.pushDecks();
  assert.equal(remote.get('d2').deleted, true);
  remote.set('d1', { deleted: true, updatedAt: Date.now() + 60000 });
  await t.pullDecks();
  assert.equal(t.decks().length, 0);
});
