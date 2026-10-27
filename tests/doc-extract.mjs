import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../doc-extract.js',import.meta.url),'utf8');
function reader({pages=[['Cells','are','living','units.']],word='Biology notes'}={}){
  let destroyed=0,reads=0;
  const doc={numPages:pages.length,getPage:async n=>{reads++;return {getTextContent:async()=>({items:pages[n-1].map(str=>({str,transform:[1,0,0,1,0,100]}))}),cleanup(){}};},destroy:async()=>{destroyed++;}};
  const window={mammoth:{extractRawText:async()=>({value:word})}};
  const context={window,document:{createElement(){throw Error('Unexpected DOM request');}},pdfLib:{GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve(doc)})}};
  vm.runInNewContext(source.replace('import(PDFJS_URL)','Promise.resolve(pdfLib)'),context);
  return {window,stats:()=>({destroyed,reads})};
}
const file=(name,type,size=100)=>({name,type,size,arrayBuffer:async()=>new ArrayBuffer(8)});
test('PDF extraction separates text items and cleans up resources',async()=>{
  const r=reader();const result=await r.window.knoxReadDocument(file('notes.pdf','application/pdf'));
  assert.match(result.text,/Cells are living units\./);assert.equal(result.pages,1);assert.equal(result.truncated,false);
  assert.equal(r.stats().destroyed,1);
});
test('PDF character and page limits report partial content accurately',async()=>{
  const r=reader({pages:Array.from({length:70},()=>['a'.repeat(16000)])});
  const result=await r.window.knoxReadDocument(file('long.pdf','application/pdf'));
  assert.equal(result.text.length,30000);assert.equal(result.truncated,true);assert.equal(result.pages,2);assert.equal(r.stats().destroyed,1);
});
test('DOCX text is cleaned, web-encoded names decoded and long names bounded',async()=>{
  const r=reader({word:'  Biology\u0000 notes\n\n\nCells.  '});
  const result=await r.window.knoxReadDocument(file('Unit%207%20%E2%80%93%20Cells.docx',''));
  assert.equal(result.name,'Unit 7 – Cells.docx');assert.equal(result.text,'Biology notes\n\nCells.');
  const long=await r.window.knoxReadDocument(file('a'.repeat(240)+'.docx',''));assert.equal(long.name.length,200);
});
test('empty Word, old DOC, unknown files and files over 20MB give useful errors',async()=>{
  const r=reader({word:'  '});
  await assert.rejects(r.window.knoxReadDocument(file('empty.docx','')),/empty/);
  await assert.rejects(r.window.knoxReadDocument(file('old.doc','')),/Old .doc files/);
  // Text files are readable now (since Oct 22); an audio file still isn't.
  await assert.rejects(r.window.knoxReadDocument(file('song.mp3','audio/mpeg')),/photos, PDFs, Word/);
  await assert.rejects(r.window.knoxReadDocument(file('huge.pdf','application/pdf',21*1024*1024)),/over 20 MB/);
});
