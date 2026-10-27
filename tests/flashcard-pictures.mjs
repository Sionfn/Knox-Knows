import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../api/generate-flashcards.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('const WIKI_HEADERS'),source.indexOf('export default async function handler'));
const file=(name,src,main=false)=>({name,src,main,credit:'Wikimedia Commons · Artist · CC BY 4.0'});
function harness(articles={}){
 const calls=[];let active=0,peak=0;
 const ctx={console,AbortSignal,LIMITS:{mega:{deckCards:40}},fetch:async raw=>{
  const u=new URL(raw);calls.push(u);peak=Math.max(peak,++active);await Promise.resolve();active--;
  const title=u.searchParams.get('titles');const a=articles[title]||{pictures:[]};
  const pages=Object.fromEntries(a.pictures.map((p,i)=>[i,{title:p.name,imagerepository:'shared',imageinfo:[{width:600,thumburl:p.src,extmetadata:{Artist:{value:'Artist'},LicenseShortName:{value:'CC BY 4.0'}}}]}]));
  return {ok:true,json:async()=>u.searchParams.has('list')?{query:{search:[]}}:u.searchParams.get('prop')==='pageimages'?{query:{pages:{1:{title,pageimage:a.pictures.find(p=>p.main)?.name.replace(/^File:/,'').replace(/ /g,'_')}}}}:{query:{pages}}};
 }};
 runInNewContext(helper,ctx);return {ctx,calls,peak:()=>peak};
}
test('a relevant used picture is reused instead of leaving a blank when irrelevant unused files remain',async()=>{
 const relevant=file('File:Chlorophyll absorption spectrum.svg','https://upload.wikimedia.org/chlorophyll.png',true);
 const h=harness({Chlorophyll:{pictures:[relevant,file('File:Research institute building.jpg','https://upload.wikimedia.org/building.jpg')]}});
 const cards=[{front:'What makes a leaf green?',back:'Chlorophyll.',imageTitle:'Chlorophyll'},{front:'What does chlorophyll absorb?',back:'Light energy for photosynthesis.',imageTitle:'Chlorophyll'}];
 await h.ctx.addPictures(cards);
 assert.ok(cards.every(c=>c.image===relevant.src));assert.ok(cards.every(c=>c.imageCredit.includes('CC BY 4.0')));
 assert.equal(h.calls.filter(u=>u.searchParams.get('titles')==='Chlorophyll').length,2,'same article fetched once per deck');
});
test('visual backup articles fill missing primary pictures and internal suggestions are removed',async()=>{
 const h=harness({'Bone tissue':{pictures:[file('File:Bone tissue diagram.png','https://upload.wikimedia.org/bone.png',true)]}});
 const cards=[{front:'What does an osteocyte do?',back:'Maintains bone tissue.',imageTitle:'Missing specific title',imageAlternatives:['Missing backup','Bone tissue']}];
 await h.ctx.addPictures(cards);
 assert.equal(cards[0].image,'https://upload.wikimedia.org/bone.png');assert.equal(cards[0].imageTopic,'Bone tissue');
 assert.equal(cards[0].imageAlternatives,undefined);assert.equal(cards[0].imageTitle,undefined);
});
test('missing primary suggestions can start with a valid backup and unrelated animals remain excluded',async()=>{
 const h=harness({'Human eye':{pictures:[file('File:Krill eye.png','https://upload.wikimedia.org/krill.png',true),file('File:Human eye diagram.png','https://upload.wikimedia.org/human.png')]}});
 const cards=[{front:'What does the human retina do?',back:'Detects light at the back of the human eye.',imageAlternatives:['Human eye']}];
 await h.ctx.addPictures(cards);
 assert.equal(cards[0].image,'https://upload.wikimedia.org/human.png');
});
test('expired picture budget leaves usable cards without doing network work or leaking metadata',async()=>{
 const h=harness();const cards=[{front:'Question',back:'Answer',imageTitle:'Topic',imageAlternatives:['Other topic']}];
 await h.ctx.addPictures(cards,Date.now()-1);
 assert.equal(h.calls.length,0);assert.equal(cards[0].front,'Question');assert.equal(cards[0].image,undefined);
 assert.equal(cards[0].imageAlternatives,undefined);assert.equal(cards[0].imageTitle,undefined);
});
test('Earth-weight cards use a relevant backup instead of a broad article galaxy photo',async()=>{
 const h=harness({Gravity:{pictures:[file('File:UGC 1810 and UGC 1813 captured by Hubble.jpg','https://upload.wikimedia.org/galaxy.jpg',true)]},Weight:{pictures:[file('File:Mass versus weight Earth.svg','https://upload.wikimedia.org/weight.png',true)]}});
 const cards=[{front:'How does gravity give an object weight near Earth?',back:'Weight is the gravitational force on the object.',imageTitle:'Gravity',imageAlternatives:['Weight']}];
 await h.ctx.addPictures(cards);assert.equal(cards[0].image,'https://upload.wikimedia.org/weight.png');
 const actual={front:'What are the interacting galaxies UGC 1810 and UGC 1813?',back:'Two galaxies viewed by Hubble.',imageTitle:'Gravity'};
 await h.ctx.addPictures([actual]);assert.equal(actual.image,'https://upload.wikimedia.org/galaxy.jpg','real astronomy questions can use astronomy pictures');
});
test('large decks bound concurrent article requests rather than sending every lookup at once',async()=>{
 const articles=Object.fromEntries(Array.from({length:16},(_,i)=>['Topic '+i,{pictures:[file('File:Topic diagram '+i+'.png','https://upload.wikimedia.org/'+i+'.png',true)]}]));
 const h=harness(articles);const cards=Object.keys(articles).map(t=>({front:t+' question',back:'Answer',imageTitle:t}));
 await h.ctx.addPictures(cards);
 assert.equal(cards.filter(c=>c.image).length,16);assert.ok(h.peak()<=8,'at most four articles / eight requests at once');
});
