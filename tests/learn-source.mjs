import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { SOURCE_CHUNKS, encodeLearnSource, decodeLearnSource, selectLearnSource } from '../learn-source.js';
const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const document = { kind: 'document', name: 'notes.docx', text: 'Original page: 7x + 11 = 46. 🌻'.repeat(1200) };
const image = { kind: 'image', type: 'image/png', data: 'a'.repeat(4000000) };
test('full original documents and maximum-sized photos round-trip without truncation', () => {
  for (const source of [document, image]) {
    const chunks = encodeLearnSource(source, 'message-1');
    assert.ok(chunks.length <= SOURCE_CHUNKS);
    assert.ok(chunks.every(c => Buffer.byteLength(JSON.stringify(c)) < 1000000));
    assert.deepEqual(decodeLearnSource(chunks.reverse()), source);
  }
});
test('incomplete, mixed, duplicate and oversized source chunks cannot restore a wrong worksheet', () => {
  const chunks = encodeLearnSource(image, 'message-1');
  for (const rows of [chunks.slice(1), [...chunks, chunks[0]], chunks.map((c,i)=>i?c:{...c,materialId:'other'}),
    chunks.map((c,i)=>i?c:{...c,index:1}), [{...chunks[0],data:'x'.repeat(700001)}], [{...chunks[0],total:7}]]) {
    assert.throws(() => decodeLearnSource(rows));
  }
  assert.equal(decodeLearnSource([]), null);
  for (const bad of [{...image,data:'a'.repeat(4000001)}, {...image,type:'text/html'}, {...document,text:'x'.repeat(60001)}, {kind:'image',type:'image/png',data:'<script>'}]) {
    assert.throws(() => encodeLearnSource(bad,'message-1'));
  }
});
test('new documents replace old photos, and cached files never cross account/session/mode boundaries', () => {
  const input = { uid:'a',sessionId:'s',learn:true,cached:{uid:'a',sessionId:'s',source:image} };
  assert.equal(selectLearnSource(input), image);
  assert.deepEqual(selectLearnSource({...input,document}), document);
  assert.deepEqual(selectLearnSource({...input,image}), image);
  for (const override of [{uid:'b'},{sessionId:'other'},{learn:false},{uid:null}]) assert.equal(selectLearnSource({...input,...override}), null);
});

function historyHarness() {
  const writes = [], store = new Map();
  const context = {
    SOURCE_CHUNKS, encodeLearnSource,
    window: { currentUser:{uid:'u1'},_appViewVersion:1 }, db:{}, crypto:{randomUUID:()=> 'message-1'},
    console,deletedHistory:new Set(),loadSidebarHistory(){},
    collection:(...args)=>args.filter(a=>a!==context.db).join('/'),
    doc:(...args)=>args.filter(a=>a!==context.db).join('/'),
    runTransaction:async (_, callback)=>{
      const staged=[];
      const value=await callback({
        get:async ref=>({exists:()=>store.has(ref),data:()=>store.get(ref)}),
        set:(ref,data)=>staged.push(['set',ref,data]),update:(ref,data)=>staged.push(['update',ref,data]),delete:ref=>staged.push(['delete',ref]),
      });
      writes.push(staged);
      staged.forEach(([op,ref,data])=>op==='delete'?store.delete(ref):store.set(ref,op==='update'?{...store.get(ref),...data}:data));
      return value;
    },
  };
  runInNewContext(app.slice(app.indexOf('  async function saveHistory('),app.indexOf('  window.saveHistory =')),context);
  return { context,writes,store };
}
test('history saves the answer and all photo chunks atomically; replacement removes unused slots', async () => {
  const {context,writes,store}=historyHarness();
  const parent='users/u1/conversations/c1';store.set(parent,{type:'learn'});
  const base={uid:'u1',conversationId:'c1',learnMode:true,sessionId:'s',viewVersion:1};
  assert.equal(await context.saveHistory('photo','try this',{...base,messageId:'first',source:image}),true);
  assert.equal(writes[0].filter(([op,p])=>op==='set'&&p.includes('/sourceMaterials/')).length,6);
  assert.equal(writes[0].filter(([op,p])=>op==='set'&&p.includes('/messages/')).length,1);
  assert.equal(await context.saveHistory('notes','new source',{...base,messageId:'second',source:document}),true);
  assert.equal(writes[1].filter(([op,p])=>op==='delete'&&p.includes('/sourceMaterials/')).length,5);
  const rows=[...store].filter(([p])=>p.includes('/sourceMaterials/')).map(([,v])=>v);
  assert.deepEqual(decodeLearnSource(rows),document);
  const before=writes.length;
  await context.saveHistory('notes','new source',{...base,messageId:'second',source:document});
  assert.equal(writes[before].length,0,'retrying a saved message does not rewrite the latest source');
  assert.equal(await context.saveHistory('bad','bad',{...base,uid:'other',source:image}),false);
});
test('conversation deletion drains source material before deleting the parent and propagates failures', async () => {
  const commits=[];let reset=0;
  const context={SOURCE_CHUNKS,window:{currentUser:{uid:'u1'},_currentConversationId:'c',appStartNewChat(){reset++;}},db:{},deletedHistory:new Set(),
    doc:(_, ...parts)=>parts.join('/'),collection:(p,n)=>p+'/'+n,query:x=>x,limit:n=>n,updateDoc:async()=>{},
    getDocs:async path=>({docs:path.endsWith('sourceMaterials')?[{ref:'source0'},{ref:'source1'}]:[{ref:'message'}]}),
    writeBatch:()=>{const refs=[];return {delete:r=>refs.push(r),commit:async()=>commits.push(refs)};}};
  const code=app.slice(app.indexOf('async function deleteConversation('),app.indexOf('window.deleteConversation ='));
  runInNewContext(code,context);await context.deleteConversation('c');
  assert.deepEqual(commits,[['source0','source1'],['message','users/u1/conversations/c']]);assert.equal(reset,1);
  context.getDocs=async()=>{throw Error('offline');};
  await assert.rejects(context.deleteConversation('c2'),/offline/);assert.equal(reset,1);
});
