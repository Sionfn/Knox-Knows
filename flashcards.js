import {validateDeck,schedule,studyQueue,parseTable,rowsToCards,parseList,parsePasted,toCsv,toTabText,cleanImage} from './flashcards-core.js';
const panel=document.createElement('section'); panel.id='flashcardsPanel'; panel.hidden=true;
panel.setAttribute('aria-label','Flashcards'); document.querySelector('#chatAndInput').append(panel);
// Backdrop layer (stays put; draws the Knox circles in CSS) + scrolling
// content layer on top.
const decor=document.createElement('div'); decor.className='fc-decor'; decor.setAttribute('aria-hidden','true');
const view=document.createElement('div'); view.className='fc-scroll';
// Toast floats over the top of the panel (outside the scrolling layer), so it
// can fade away without shifting the page.
const toast=document.createElement('div'); toast.className='fc-toast'; toast.setAttribute('role','status');
let toastTimer=0;
const hideToast=()=>{clearTimeout(toastTimer);toast.classList.remove('show');};
toast.addEventListener('click',hideToast);
// Screen-reader-only announcements (e.g. the answer after a flip): read aloud,
// never shown — the visible toast is for real messages only.
const announcer=document.createElement('div'); announcer.className='fc-sr'; announcer.setAttribute('aria-live','polite');
const announce=t=>{announcer.textContent='';setTimeout(()=>{announcer.textContent=t;},50);};
panel.append(decor,view,toast,announcer);
let decks=[], identity='', session=null, editing=null, dirty=false;
let generationVersion=0;
const key=()=>`knox.flashcards.v1.${window.currentUser?.uid || 'guest'}`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Deck stickers cycle through the same four colors as the topic chips.
const FLAVORS=['orange','green','blue','purple'], ICONS=['🧠','📚','💡','⭐'];
const FOX='/knox-logo-square.jpg';
// A deck keeps its color/emoji even when others are added, edited or deleted.
const flavorOf=id=>{let h=0;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))>>>0;return h%4;};
let pendingMessage='';

function load(){ identity=key(); session=null; editing=null; dirty=false; try{const raw=JSON.parse(localStorage.getItem(identity)||'[]'); if(!Array.isArray(raw))throw Error(); decks=raw.filter(d=>{try{validateDeck(d);return typeof d.id==='string';}catch{return false;}});}catch{decks=[];pendingMessage='Saved decks could not be read. Import a backup to recover them.';} }
function save(next){try{stamp(decks,next);localStorage.setItem(identity,JSON.stringify(next));decks=next;schedulePush();return true;}catch(err){message(/quota/i.test(err?.name+' '+err?.message)?'Your browser’s storage for Knox is full. Remove some of your own uploaded pictures, or export and delete old decks, then try again.':'Your browser could not save. Export your decks before closing this page.');return false;}}

// ── Decks in the student's account (window.knoxDeckStore in app.html) ──
// This browser keeps the decks (fast, works offline). Every change is
// stamped and sent to the account a moment later, and opening Flashcards
// pulls the account's decks: the newer copy of each deck wins, so decks
// follow the student to any device. A deleted deck leaves a marker so
// other devices drop it too. Guests' decks stay on this device.
const SYNC_LIMIT=900000; // one deck record stays under Firestore's 1 MB
const IS_DATA_IMAGE=/^data:/;
const delKey=()=>identity+'.deleted';
const syncUid=()=>window.currentUser?.uid||'';
let syncTimer=0, syncWarned=false;
const dirtyIds=new Set();
function deletedMap(){try{return JSON.parse(localStorage.getItem(delKey())||'{}')||{};}catch{return {};}}
function setDeleted(m){try{localStorage.setItem(delKey(),JSON.stringify(m));}catch{}}
// Called by save(): stamp the decks that changed, remember the ones deleted.
function stamp(prev,next){
  const before=new Map(prev.map(d=>[d.id,JSON.stringify(d)])), now=Date.now();
  // createdAt keeps the deck list in the same order on every device.
  for(const d of next){if(!d.createdAt)d.createdAt=d.updatedAt||now;if(before.get(d.id)!==JSON.stringify(d)){d.updatedAt=now;dirtyIds.add(d.id);}before.delete(d.id);}
  if(before.size){const m=deletedMap();for(const id of before.keys()){m[id]=now;dirtyIds.add(id);}setDeleted(m);}
}
function schedulePush(){if(!syncUid()||!window.knoxDeckStore)return;clearTimeout(syncTimer);syncTimer=setTimeout(pushDecks,2000);}
// A deck too big for one record goes without the pictures uploaded from this
// device (each device keeps its own); if it's still too big it stays local.
function packDeck(d){
  let data=JSON.stringify(d);
  if(data.length>SYNC_LIMIT)data=JSON.stringify({...d,cards:d.cards.map(c=>{if(!IS_DATA_IMAGE.test(c.image||''))return c;const{image,imageCredit,...rest}=c;return{...rest,localImage:true};})});
  if(data.length>SYNC_LIMIT){if(!syncWarned){syncWarned=true;message(`“${d.title}” is too big to save to your account, so it stays on this device. Export it to keep a backup.`);}return null;}
  return{data,title:d.title.slice(0,100),updatedAt:d.updatedAt||Date.now()};
}
async function pushDecks(){
  const uid=syncUid();
  if(!uid||!window.knoxDeckStore||identity!==key()||!dirtyIds.size)return;
  const ids=[...dirtyIds];dirtyIds.clear();
  const del=deletedMap();
  for(const id of ids){
    try{
      const d=decks.find(x=>x.id===id);
      if(d){const value=packDeck(d);if(value)await window.knoxDeckStore.put(uid,id,value);}
      else if(del[id])await window.knoxDeckStore.put(uid,id,{deleted:true,updatedAt:del[id]});
    }catch{dirtyIds.add(id);} // offline or signed out: try again on the next change or visit
  }
}
// → true when this device's decks changed.
async function pullDecks(){
  const uid=syncUid(), mine=identity;
  if(!uid||!window.knoxDeckStore)return false;
  let remote;try{remote=await window.knoxDeckStore.list(uid);}catch{return false;}
  if(mine!==identity||uid!==syncUid())return false;
  const del=deletedMap(), next=decks.slice(), seen=new Set();
  let changed=false;
  for(const r of remote){
    seen.add(r.id);
    const i=next.findIndex(d=>d.id===r.id), local=next[i], localTime=local?.updatedAt||0;
    if(r.deleted){if(local&&localTime<=r.updatedAt){next.splice(i,1);changed=true;}continue;}
    if((del[r.id]||0)>=r.updatedAt)continue; // deleted on this device after that save
    if(local&&localTime>=r.updatedAt){if(localTime>r.updatedAt)dirtyIds.add(r.id);continue;}
    let deck;try{deck=JSON.parse(r.data);validateDeck(deck);if(deck.id!==r.id)throw Error();}catch{continue;}
    // Pictures uploaded on this device that the account copy left out: keep them.
    deck.cards=deck.cards.map(c=>{if(!c.localImage)return c;const{localImage,...rest}=c;const m=local?.cards.find(x=>x.front===c.front&&IS_DATA_IMAGE.test(x.image||''));return m?{...rest,image:m.image,...(m.imageCredit?{imageCredit:m.imageCredit}:{})}:rest;});
    if(i>=0)next[i]=deck;else next.push(deck);
    changed=true;
  }
  // Decks only on this device (made before syncing, or offline): send them up.
  for(const d of next)if(!seen.has(d.id)){if(!d.updatedAt)d.updatedAt=Date.now();dirtyIds.add(d.id);}
  if(changed){try{localStorage.setItem(identity,JSON.stringify(next));decks=next;}catch{changed=false;}}
  schedulePush();
  return changed;
}

// Messages show as a toast pinned to the top of the panel.
// Success messages fade after a few seconds, errors stay a little longer;
// clicking the message dismisses it right away.
function message(t,kind=''){clearTimeout(toastTimer);if(!t){hideToast();return;}toast.textContent=t;toast.className='fc-toast show'+(kind?' '+kind:'');toastTimer=setTimeout(hideToast,kind==='ok'?3500:6500);}
function btn(label,action,{cls='',attrs=''}={}){return `<button type="button" class="fc-btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;}
// Badge text with a Fall-mode variant (seasonal.css shows one or the other).
const badge=(normal,fall)=>`<span class="fc-badge"><span class="season-hide">${normal}</span><span class="season-only">${fall}</span></span>`;
// center: sit in the middle of the screen when the content is short (like the
// Ask Knox welcome screen); long content still starts at the top and scrolls.
function frame(head,body,center=false){
  hideToast();
  view.innerHTML=`<div class="fc-wrap${center?' center':''}">${head?`<header class="fc-head">
    <div class="fc-badges">${head.badge||''}</div>
    <h1 class="fc-title" tabindex="-1">${head.title}</h1>${head.sub?`<p class="fc-sub">${head.sub}</p>`:''}</header>`:''}${body}</div>`;
  view.scrollTop=0;
}

// ── Make with Knox (AI-written decks) ───────────────────────────────────────
const makeOpts={request:'',count:10,style:'qa',difficulty:'mixed',upgrade:false,files:[],reading:false};
// Setting: let Knox add pictures to new decks automatically (remembered on this device).
const PICS_KEY='knox.flashcards.autoPictures';
const autoPictures=()=>{try{return localStorage.getItem(PICS_KEY)!=='off';}catch{return true;}};
const setAutoPictures=on=>{try{localStorage.setItem(PICS_KEY,on?'on':'off');}catch{}};
const EXAMPLES=[
  ['🍎','Sophomore · Newton’s laws','I’m a sophomore in physics learning Newton’s three laws of motion'],
  ['🧬','AP Bio · cell respiration','AP Biology: cellular respiration — glycolysis, Krebs cycle and the electron transport chain'],
  ['🏛️','8th grade · the Constitution','8th grade civics: the U.S. Constitution, the three branches and checks and balances'],
  ['🫀','Nursing · the heart','College nursing student: anatomy of the heart and the path of blood flow'],
];
const isPlus=()=>['super','max','plus'].includes(window.userPlan)||window.userComped===true;
const EVERYONE=true; // launched Nov 1: everyone can use Flashcards
// Making a deck with Knox: Knox Plus is unlimited (up to 20 cards); free
// accounts spend DECK_COST credits per deck, up to FREE_MAX cards (the server
// in api/generate-flashcards.js enforces both).
const DECK_COST=2, FREE_MAX=10;
// Plan limits for decks Knox makes (match api/_plans.js): free 10 cards,
// Knox Plus 15, Mega Knox 40 plus difficulty and two more card styles.
const tierNow=()=>window.userTier||(isPlus()?'plus':'free');
const MAX_CARDS={free:10,plus:15,mega:40}, PHOTO_LIMIT={free:5,plus:5,mega:10}, DOC_CHARS={free:30000,plus:30000,mega:60000};
const tierTag=t=>t==='mega'?'<span class="fc-plus-tag mega">💎 Mega</span>':'<span class="fc-plus-tag">⚡ Plus</span>';
const canSee=()=>EVERYONE||isPlus();
const chip=(label,action,on,attrs='')=>`<button type="button" class="fc-chip${on?' on':''}" data-action="${action}" ${attrs}>${label}</button>`;
function makeView(){
  generationVersion++;session=null;editing=null;dirty=false;importNote=null;
  const plus=isPlus(), tier=tierNow(), mega=tier==='mega';
  if(makeOpts.count>MAX_CARDS[tier])makeOpts.count=MAX_CARDS[tier];
  if(!mega){if(['fill','tf'].includes(makeOpts.style))makeOpts.style='qa';makeOpts.difficulty='mixed';}
  frame({badge:'<span class="fc-badge">✨ Make with Knox</span>',title:'Tell Knox what <span class="accent">you’re studying.</span>',
    sub:'Say your grade or class and the topic. Knox writes the cards at your level — you can edit them before you save.'},
   `<div class="fc-topbar fc-make-top">${btn('← Decks','back',{cls:'ghost'})}</div>
    <div class="fc-make">
      <label class="fc-field-label" for="fcMakeReq">What are you studying?</label>
      <textarea class="fc-textarea" id="fcMakeReq" rows="4" maxlength="4000" placeholder="I’m a sophomore in physics learning Newton’s laws of motion">${esc(makeOpts.request)}</textarea>
      <div class="fc-doc-row">${makeOpts.files.map((f,i)=>`<span class="fc-doc-chip">${f.kind==='photo'?'🖼️':'📄'} <span>${esc(f.name)}${f.truncated?' · first part':''}</span><button type="button" class="fc-doc-x" data-action="doc-clear" data-index="${i}" aria-label="Remove ${esc(f.name)}">✕</button></span>`).join('')}
        ${makeOpts.reading?btn('Reading file…','doc-pick',{cls:'small',attrs:'disabled'}):makeOpts.files.length<MAX_MAKE_FILES?btn(makeOpts.files.length?'+ Add another':'📎 Add your notes, slides or photos','doc-pick',{cls:'small'}):''}
        <input type="file" id="fcDocInput" accept="${MAKE_ACCEPT}" multiple hidden></div>
      <p class="fc-doc-hint">PDF, Word, PowerPoint, text files or photos of your notes (up to ${PHOTO_LIMIT[tier]}) — or drag them here.</p>
      <div class="fc-examples no-ki">${EXAMPLES.map(([ic,label,text])=>chip(`${ic} ${label}`,'make-example',false,`data-text="${esc(text)}"`)).join('')}</div>
      <div class="fc-make-opts">
        <div><span class="fc-field-label">How many cards?</span><div class="fc-chips">${[10,15,20,30,40].map(n=>n>MAX_CARDS[tier]?chip(`${n} ${tierTag(n>MAX_CARDS.plus?'mega':'plus')}`,'upgrade',false,`title="${n>MAX_CARDS.plus?'Mega Knox makes decks up to 40 cards':'Knox Plus makes decks up to 15 cards'}"`):chip(String(n),'make-count',makeOpts.count===n,`data-count="${n}"`)).join('')}</div></div>
        <div><span class="fc-field-label">Card style</span><div class="fc-chips">${chip('Question → answer','make-style',makeOpts.style==='qa','data-style="qa"')}${chip('Term → definition','make-style',makeOpts.style==='term','data-style="term"')}${[['fill','Fill in the blank'],['tf','True or false']].map(([id,label])=>mega?chip(label,'make-style',makeOpts.style===id,`data-style="${id}"`):chip(`${label} ${tierTag('mega')}`,'upgrade',false,'title="Mega Knox: more card styles"')).join('')}</div></div>
        <div><span class="fc-field-label">Difficulty</span><div class="fc-chips">${[['mixed','Mixed'],['easy','Easy'],['medium','Medium'],['hard','Hard']].map(([id,label])=>mega||id==='mixed'?chip(label,'make-difficulty',makeOpts.difficulty===id,`data-difficulty="${id}"`):chip(`${label} ${tierTag('mega')}`,'upgrade',false,'title="Mega Knox: choose the difficulty"')).join('')}</div></div>
      </div>
      <label class="fc-switch"><input type="checkbox" id="fcAutoPics"${autoPictures()?' checked':''}><span class="fc-switch-track" aria-hidden="true"></span><span><b>Add pictures automatically</b><small>Knox adds a free picture to cards where one helps (a body part, a place, an artwork). You can always add or change pictures yourself.</small></span></label>
      ${makeOpts.upgrade?`<div class="fc-upsell">${mega?'⚡':'💎'} <span>${tier==='plus'?'<b>Mega Knox</b> makes decks up to 40 cards, with difficulty, more card styles and up to 10 photos.':'Go unlimited with <b>Knox Plus</b> (up to 15 cards a deck) or <b>Mega Knox</b> (up to 40, fully customizable).'}</span>${btn('See the plans','upgrade',{cls:'small'})}</div>`:''}
      <div class="fc-toolbar" style="margin-top:20px">${btn(plus?'✨ Make my deck':`✨ Make my deck · ${DECK_COST} credits`,'make-go',{cls:'primary'})}</div>
      <p class="fc-cost">${mega?'💎 Mega Knox — unlimited decks, up to 40 cards, any style and difficulty.':plus?'⚡ Knox Plus — unlimited decks, up to 15 cards each.':`Uses ${DECK_COST} of your daily credits · up to ${FREE_MAX} cards · <b>Knox Plus</b> makes unlimited decks.`}</p>
      <p class="fc-note" style="margin-top:14px">Knox can make mistakes — read the cards over before you study them.</p>
    </div>`,true);
  panel.querySelector('#fcMakeReq')?.focus();
}
// "Try a sample deck": Knox writes a brand-new deck on a random school topic —
// random size, card style and pictures on or off — and saves it right away.
const SAMPLE_TOPICS=['Middle school science: the planets of the solar system','High school biology: parts of the cell and what they do','U.S. history: the American Revolution','World geography: capital cities of Europe','Spanish 1: common everyday verbs','Chemistry: the first 20 elements of the periodic table','Art history: famous paintings and who painted them','Human anatomy: the major bones of the body','Earth science: rocks, minerals and the rock cycle','Physics: Newton’s three laws of motion','Literature: Shakespeare’s most famous plays','Music: instruments of the orchestra','Ancient Egypt: pharaohs, pyramids and daily life','Biology: how animals are classified','Geometry: shapes, angles and area formulas','Economics: supply, demand and markets','Computer science: basic programming ideas','Earth science: weather and climate','World history: key events of World War II','Greek mythology: the Olympian gods','Human body: the major organs and what they do','History of science: famous inventors and their inventions','Marine biology: animals of the ocean','Earth science: volcanoes and earthquakes','U.S. government: the three branches and checks and balances','French 1: greetings and everyday phrases','Paleontology: famous dinosaurs','Space exploration: famous missions and astronauts','Health: nutrition and the food groups','Ecology: ecosystems and food chains','World landmarks: famous buildings and where they are','Algebra 1: key vocabulary and rules'];
const pick=list=>list[Math.floor(Math.random()*list.length)];
async function sampleDeck(){
  const user=window.currentUser;
  if(!user?.getIdToken){message('Sign in to try a sample deck.');window.openAuthModal?.();return;}
  const owner=key(),version=++generationVersion;
  const options={request:pick(SAMPLE_TOPICS),count:pick([10,15,20]),style:pick(['qa','term']),pictures:Math.random()<0.5};
  frame(null,`<div class="fc-loading"><img src="${FOX}" alt=""><h2>Knox is picking a surprise deck…</h2><p class="fc-sub">A random topic, ${options.count} cards${options.pictures?', with pictures':''}. This takes a few seconds.</p><div class="fc-dots"><span></span><span></span><span></span></div><div class="fc-toolbar" style="margin-top:18px">${btn('Cancel','back',{cls:'ghost small'})}</div></div>`,true);
  let data={},ok=false;
  try{
    const token=await user.getIdToken();
    if(version!==generationVersion||owner!==key())return;
    const r=await fetch('/api/generate-flashcards',{method:'POST',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(options)});
    data=await r.json().catch(()=>({}));ok=r.ok;
  }catch{data={error:'Couldn’t reach Knox. Check your connection and try again.'};}
  if(version!==generationVersion||owner!==key())return;
  if(!ok||!Array.isArray(data.cards)){home();message(data.error||'Knox couldn’t make a sample deck. Please try again.');return;}
  let deck;
  try{
    const cards=data.cards.map(c=>({front:c.front,back:c.back,...cleanImage(c),...(typeof c.imageTopic==='string'&&c.imageTopic.trim()?{imageTopic:c.imageTopic.trim().slice(0,120)}:{})}));
    const valid=validateDeck({title:data.title||'Sample deck',cards});
    deck={id:crypto.randomUUID(),title:valid.title,cards:valid.cards.map((c,i)=>({...c,...(cards[i].imageTopic?{imageTopic:cards[i].imageTopic}:{})}))};
  }catch{home();message('Knox couldn’t make a sample deck. Please try again.');return;}
  window.updateUsageIndicator?.();
  if(save([...decks,deck])){home();message(`Sample deck added: ${deck.title} · ${deck.cards.length} cards. Try Review due!`,'ok');}
}
async function makeDeck(){
  const request=(panel.querySelector('#fcMakeReq')?.value||'').trim();
  makeOpts.request=request;makeOpts.upgrade=false;
  if(makeOpts.reading){message('Still reading your file — one moment.');return;}
  if(request.length<3&&!makeOpts.files.length){message('Tell Knox what you’re studying, or add your notes, slides or photos.');panel.querySelector('#fcMakeReq')?.focus();return;}
  const user=window.currentUser;
  if(!user?.getIdToken){message('Sign in to make decks with Knox.');window.openAuthModal?.();return;}
  const owner=key(), version=++generationVersion;
  const texts=makeOpts.files.filter(f=>f.kind==='text'),photos=makeOpts.files.filter(f=>f.kind==='photo');
  const options={request,count:makeOpts.count,style:makeOpts.style,difficulty:makeOpts.difficulty,pictures:autoPictures(),
    ...(texts.length?{document:{name:texts.map(f=>f.name).join(', ').slice(0,200),text:(texts.length===1?texts[0].text:texts.map(f=>`— ${f.name} —\n${f.text}`).join('\n\n')).slice(0,DOC_CHARS[tierNow()])}}:{}),
    ...(photos.length?{images:photos.map(({type,data})=>({type,data}))}:{})};
  frame(null,`<div class="fc-loading"><img src="${FOX}" alt=""><h2>Knox is writing your cards…</h2><p class="fc-sub">${photos.length||texts.length?'Reading your notes — this can take up to a minute.':'This usually takes 10–30 seconds.'}</p><div class="fc-dots"><span></span><span></span><span></span></div><div class="fc-toolbar" style="margin-top:18px">${btn('Cancel','make-cancel',{cls:'ghost small'})}</div></div>`,true);
  let data={},ok=false;
  try{
    const token=await user.getIdToken();
    if(version!==generationVersion||owner!==key())return;
    const r=await fetch('/api/generate-flashcards',{method:'POST',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(options)});
    data=await r.json().catch(()=>({}));ok=r.ok;
  }catch{data={error:'Couldn’t reach Knox. Check your connection and try again.'};}
  if(version!==generationVersion||owner!==key())return;
  if(!ok||!Array.isArray(data.cards)){makeOpts.upgrade=!!data.upgrade;makeView();message(data.error||'Knox couldn’t make that deck. Please try again.');return;}
  window.updateUsageIndicator?.(); // the sidebar's credits reflect the deck
  editing={id:crypto.randomUUID(),title:data.title||'My Knox deck',cards:data.cards.map(c=>({front:c.front,back:c.back,...cleanImage(c),...(typeof c.imageTopic==='string'&&c.imageTopic.trim()?{imageTopic:c.imageTopic.trim().slice(0,120)}:{})}))};
  renderEditor();dirty=true;makeOpts.request='';makeOpts.files=[];
  const left=typeof data.creditsLeft==='number'?` You have ${data.creditsLeft} credit${data.creditsLeft===1?'':'s'} left.`:'';
  message(`Knox made ${editing.cards.length} card${editing.cards.length===1?'':'s'}. Read them over, change anything you like, then save!${left}`,'ok');
}

const way=(action,flavor,icon,title,text)=>`<button type="button" class="fc-way" data-action="${action}" data-flavor="${flavor}"><span class="fc-way-icon" aria-hidden="true">${icon}</span><b>${title}</b><span>${text}</span></button>`;
function home(query=''){
  generationVersion++;
  session=null; editing=null; dirty=false; importNote=null;
  frame({badge:badge('🗂️ Knox Flashcards','🍂 Cozy fall study session'),title:'Practice makes<br><span class="accent">knowing.</span>',
    sub:'Build a deck, try to recall each answer before you flip, and Knox brings back the tricky cards more often.'},
   `<div class="fc-ways${decks.length?' has-decks':''}">
      ${way('make','orange','✨','Make with Knox','Knox writes the cards for you — from a topic, your notes, slides or photos.')}
      ${way('create','blue','✏️','Create your own','Type your own cards, add pictures, or paste a list.')}
      ${way('import','green','📥','Import cards','Bring in cards you’ve already made — from Excel, Google Sheets, another study app or a Knox backup.')}
    </div>
    <div class="fc-toolbar fc-toolbar-quiet">${btn(isPlus()?'Try a sample deck':`Try a sample deck · ${DECK_COST} credits`,'sample',{cls:'ghost small'})}${btn('Export all','export-all',{cls:'ghost small',attrs:decks.length?'':'disabled'})}</div>
    <p class="fc-sync-note">${window.currentUser?'☁️ Your decks save to your account, so they follow you to any device.':'Sign in to keep your decks on every device.'}</p>
    ${decks.length?`<div class="fc-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fc-search" id="fcSearch" type="search" aria-label="Find a deck" placeholder="Find a deck…" value="${esc(query)}"></div>`:'<div style="height:14px"></div>'}
    <div class="fc-grid" id="fcDecks"></div>
    <p class="fc-note">${window.currentUser?'This browser keeps an offline copy. Account sync resumes when you’re online. Export makes an extra backup.':'Guest decks stay in this browser. Export a backup before clearing browser data.'}</p>`,true);
  renderDecks(query);
  if(pendingMessage){message(pendingMessage);pendingMessage='';}
}
function renderDecks(query){
  const grid=panel.querySelector('#fcDecks');
  const results=[...decks].sort((a,b)=>(a.createdAt||a.updatedAt||0)-(b.createdAt||b.updatedAt||0)).map(d=>[d,flavorOf(d.id)]).filter(([d])=>d.title.toLowerCase().includes(query.toLowerCase()));
  if(!results.length){
    grid.style.display='block';
    grid.innerHTML=decks.length
      ?`<div class="fc-empty"><h2>No matching decks</h2><p class="fc-sub">Try a different word, or clear the search.</p></div>`
      :`<div class="fc-empty fc-empty-start"><img src="${FOX}" alt=""><div><h2>Your next “I know this!” starts here.</h2><p class="fc-sub">Pick a way to make your first deck above, or try the sample to see how studying works.</p></div></div>`;
    return;
  }
  grid.style.display='';
  grid.innerHTML=results.map(([d,i])=>{
    const due=d.cards.filter(c=>!c.due||c.due<=Date.now()).length;
    return `<article class="fc-deck" data-flavor="${FLAVORS[i%4]}">
      <div class="fc-deck-top"><div class="fc-deck-icon" aria-hidden="true">${ICONS[i%4]}</div>
        <div style="min-width:0"><h2 class="fc-deck-name">${esc(d.title)}</h2>
        <div class="fc-pills"><span class="fc-pill">${d.cards.length} card${d.cards.length===1?'':'s'}</span>${due?`<span class="fc-pill due">${due} due</span>`:'<span class="fc-pill done">✓ Caught up</span>'}</div></div></div>
      <div class="fc-deck-actions">${btn('Review due','due',{cls:'primary small',attrs:`data-id="${esc(d.id)}" ${due?'':'disabled'}`})}${btn('Practice all','practice',{cls:'small',attrs:`data-id="${esc(d.id)}"`})}</div>
      <div class="fc-deck-more">${btn('Edit','edit',{cls:'ghost small',attrs:`data-id="${esc(d.id)}"`})}${btn('Export','export',{cls:'ghost small',attrs:`data-id="${esc(d.id)}"`})}${btn('Delete','delete',{cls:'ghost small danger',attrs:`data-id="${esc(d.id)}"`})}</div>
    </article>`;}).join('');
}

function editor(deck){generationVersion++;importNote=null;editing=deck?structuredClone(deck):{id:crypto.randomUUID(),title:'',cards:[{front:'',back:''}]};dirty=false;renderEditor();}
// One card row. Only the first card shows example text — repeating it on every
// blank card made new cards look like copies of card 1.
function cardRow(c,i){
  const ex=i===0, pic=cleanImage(c).image;
  const tile=pic
    ?`<div class="fc-img-tile has-pic" title="${esc(c.imageCredit||'Your picture')}"><button type="button" class="fc-img-open" data-action="pic-open" data-index="${i}" aria-label="Change the picture on card ${i+1}"><img src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'"></button><button type="button" class="fc-img-del" data-action="pic-remove" data-index="${i}" aria-label="Remove the picture from card ${i+1}">🗑</button></div>`
    :`<button type="button" class="fc-img-tile" data-action="pic-open" data-index="${i}" aria-label="Add a picture to card ${i+1}"><span aria-hidden="true">🖼️</span>Image</button>`;
  return `<div class="fc-row">
      <div class="fc-row-head"><span class="fc-num">${i+1}</span>${btn('Remove','remove',{cls:'ghost small danger',attrs:`data-index="${i}" aria-label="Remove card ${i+1}"`})}</div>
      <div class="fc-row-body">${tile}
      <div class="fc-fields"><div><label class="fc-field-label" for="fcFront${i}">Question / term</label><textarea class="fc-textarea" id="fcFront${i}" data-field="front" data-index="${i}" maxlength="2000"${ex?' placeholder="What is photosynthesis?"':''}>${esc(c.front)}</textarea></div>
      <div><label class="fc-field-label" for="fcBack${i}">Answer / definition</label><textarea class="fc-textarea" id="fcBack${i}" data-field="back" data-index="${i}" maxlength="4000"${ex?' placeholder="How plants turn light, water and CO₂ into sugar and oxygen."':''}>${esc(c.back)}</textarea></div></div></div>
      ${pic?`<p class="fc-pic-credit">${c.imageCredit?esc(c.imageCredit):'Your picture'} · shows with the answer</p>`:''}
      ${picker&&picker.index===i?pickerHtml():''}
    </div>`;
}
// ── Picture picker: search free Wikimedia Commons images for
// what you typed, or upload your own. Every Commons file is freely licensed;
// its creator and license are saved as the credit.
let picker=null; // {index, query, results, loading, error}
const pickerCache=new Map();
function pickerHtml(){
  const p=picker, res=p.results||[];
  return `<div class="fc-picker" role="region" aria-label="Choose a picture">
    <div class="fc-picker-bar"><input class="fc-input" id="fcPicSearch" type="search" placeholder="Search pictures…" value="${esc(p.query)}" aria-label="Search pictures">${btn('Search','pic-search',{cls:'small'})}${btn('Upload your own','pic-add',{cls:'small',attrs:`data-index="${p.index}"`})}${btn('Close','pic-close',{cls:'ghost small'})}</div>
    ${p.loading?'<p class="fc-picker-note">Finding pictures…</p>'
      :p.error?`<p class="fc-picker-note">${esc(p.error)}</p>`
      :res.length?`<div class="fc-picker-grid">${res.map((r,k)=>`<button type="button" class="fc-picker-item" data-action="pic-pick" data-k="${k}" title="${esc(r.credit)}"><img src="${esc(r.thumb)}" alt="${esc(r.title)}" loading="lazy" referrerpolicy="no-referrer"></button>`).join('')}</div><p class="fc-picker-note">Free pictures from Wikimedia Commons — the creator is credited on your card.</p>`
      :p.query?'<p class="fc-picker-note">No pictures found. Try a simpler word, or upload your own.</p>':'<p class="fc-picker-note">Type what you want a picture of.</p>'}
  </div>`;
}
// Understand the card instead of searching its exact words. The topic is what
// the student typed, else the Wikipedia article Knox chose when it wrote the
// card, else a guess from the card's key words. Pictures come from that
// article first (its main picture, then its photos and diagrams — on-topic and
// freely licensed on Commons), then a wider Wikimedia Commons search.
const PIC_STOP=new Set('a an the of is are was were be been to in on at for by with and or what which who whom whose where when why how does do did can could would should will name called define definition explain describe example examples main basic type types kind kinds part parts known as its it this that these those your you i my me we our their they from into about than then there here also not no yes true false most more less many much one two three four five six seven eight nine ten first second third process function role purpose meaning term help helps use used make made give gives different between each other some'.split(' '));
const picWords=t=>[...new Set(String(t||'').toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu,' ').split(/\s+/).filter(w=>w.length>2&&!PIC_STOP.has(w)))];
const shortPhrase=t=>{const w=picWords(t);return w.length&&w.length<=3?w.join(' '):'';};
const wikiJson=url=>fetch(url,{signal:AbortSignal.timeout(8000)}).then(r=>r.ok?r.json():{});
const stripHtml=t=>String(t||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
const NOT_A_PICTURE=/logo|icon|symbol|flag|bandera|coat[ _]of[ _]arms|question[ _]book|wiki(quote|source|species|books|versity|data|tionary|news)|commons-|padlock|edit-|ambox|portal|disambig|stub|pencil|nuvola|crystal[ _]clear|gnome|oojs|increase|decrease|steady|loudspeaker|sound|audio|\.(ogg|oga|webm|pdf|tif)|lock-|protection|map[ _]marker|location[ _]map|blank[ _]map|signature|folder|text-x|document-|emblem/i;
// Just the creator's name: drop uploader notes, labels and stray symbols.
const cleanArtist=s => String(s || '').replace(/\s+\.\s.*$|(?<=\p{L}{3})\.\s.*$/u, '').replace(/\b(when using|this image|derivative work|if you use|please credit|cited as)\b.*$/i, '').replace(/^(original|author|photo|image|by)\s*:\s*/i, '').replace(/[^\p{L}\p{N}\s.,:'’&()\/-]/gu, '').replace(/[\s.,;:-]+$/, '').trim().slice(0, 60);
const picCredit=m=>['Wikimedia Commons',cleanArtist(stripHtml(m?.Artist?.value)),stripHtml(m?.LicenseShortName?.value).slice(0,40)].filter(Boolean).join(' · ');
const fileName=t=>stripHtml(t).replace(/^File:/,'').replace(/\.[a-z]+$/i,'');
const W='https://en.wikipedia.org/w/api.php?format=json&origin=*&action=query&redirects=1';
const C='https://commons.wikimedia.org/w/api.php?format=json&origin=*&action=query';
// Rank an article's pictures for a card: main picture and files whose names
// share the card's words first; animal pictures only if the card mentions them.
const ANIMALS=/\b(insects?|bugs?|beetles?|ants?|bees?|spiders?|crabs?|lobsters?|shrimps?|mammoths?|elephants?|dinosaurs?|dogs?|cats?|horses?|cows?|cattle|pigs?|sheep|goats?|birds?|chickens?|ducks?|fish|sharks?|whales?|dolphins?|frogs?|toads?|snakes?|lizards?|turtles?|monkeys?|apes?|gorillas?|chimpanzees?|mice|mouse|rats?|rabbits?|bats?|deer|bears?|lions?|tigers?|wolf|wolves|octopus|squid|worms?|snails?|krill|fly|flies|hawks?|eagles?|owls?|bison|mantis|shrimp)\b/;
const stem=w=>w.length>4?w.replace(/(ing|es|ed|s)$/,''):w;
const FILLER=new Set('the and for with from that this what which who whom how why when where are was were did does has have had its into about than then their there these those your you can could would should will not but all any each other some such only also more most very just one two three four five six seven eight nine ten first second third part parts type types kind main called name known used use make made give gives between during after before over under view english version file'.split(' '));
const nameWords=t=>[...new Set(String(t||'').replace(/^File:/,'').replace(/\.[a-z0-9]+$/i,'').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z]+/).filter(w=>w.length>2&&!FILLER.has(w)))];
function rankPictures(list,card,typed){
  const text=[typed,card?.front,card?.back,card?.imageTopic].join(' ').toLowerCase();
  const words=new Set(nameWords(text).flatMap(w=>[w,stem(w)]));
  return list.map((p,i)=>{const n=nameWords(p.file),a=n.join(' ').match(ANIMALS);return {p,i,skip:a&&!text.includes(a[1].replace(/s$/,'')),score:(p.main?1.5:0)+n.filter(w=>words.has(w)||words.has(stem(w))).length};})
    .filter(x=>!x.skip).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.p);
}
async function articlePictures(title){
  const [lead,images]=await Promise.all([
    wikiJson(`${W}&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`),
    wikiJson(`${W}&generator=images&gimlimit=40&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=480&titles=${encodeURIComponent(title)}`)]);
  const main='File:'+String(Object.values(lead.query?.pages||{})[0]?.pageimage||'').replace(/_/g,' ');
  let all=Object.values(images.query?.pages||{});
  // Files come back A–Z: on a long article the main picture can be past the first 40.
  if(main!=='File:'&&!all.some(p=>p.title===main))all=[...Object.values((await wikiJson(`${W}&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=480&titles=${encodeURIComponent(main)}`)).query?.pages||{}),...all];
  return all
    .filter(p=>p.imagerepository==='shared'&&!NOT_A_PICTURE.test(p.title)&&!/\.(stl|webm|ogv|mid)$/i.test(p.title)&&(p.imageinfo?.[0]?.width||0)>=150)
    .sort((a,b)=>(b.title===main)-(a.title===main))
    .map(p=>({thumb:String(p.imageinfo[0].thumburl).replace(/\?.*$/,''),title:fileName(p.title),file:p.title,main:p.title===main,credit:picCredit(p.imageinfo[0].extmetadata)}));
}
async function findPictures(typed,card){
  const front=String(card?.front||''), isQuestion=/\?\s*$/.test(front)||/^(what|which|who|where|when|why|how|name|define|list|explain|describe)\b/i.test(front.trim());
  const topicText=typed||card?.imageTopic||(!isQuestion&&shortPhrase(front))||shortPhrase(card?.back)||picWords(front).slice(0,4).join(' ')||picWords(card?.back).slice(0,4).join(' ');
  if(!topicText)return {label:'',results:[]};
  // Knox's chosen article is used as is; anything else goes through Wikipedia's search.
  let titles=[];
  if(!typed&&card?.imageTopic)titles=[card.imageTopic];
  else{
    const context=!typed&&isQuestion&&topicText!==shortPhrase(front)?picWords(front).filter(w=>!topicText.toLowerCase().includes(w)).slice(0,3).join(' '):'';
    titles=((await wikiJson(`${W}&list=search&srlimit=3&srnamespace=0&srsearch=${encodeURIComponent((topicText+' '+context).trim())}`)).query?.search||[]).map(r=>r.title);
  }
  const fromArticles=rankPictures((await Promise.all(titles.slice(0,2).map(t=>articlePictures(t).catch(()=>[])))).flat(),card,typed);
  // Not enough from the articles: fill up with a Commons search.
  let fromCommons=[];
  if(fromArticles.length<8){
    const q=typed||(topicText.split(' ').length<=3?topicText:titles[0])||topicText;
    const commons=await wikiJson(`${C}&generator=search&gsrnamespace=6&gsrlimit=16&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=480&gsrsearch=${encodeURIComponent(q+' filetype:bitmap|drawing')}`).catch(()=>({}));
    fromCommons=Object.values(commons.query?.pages||{}).filter(p=>!NOT_A_PICTURE.test(p.title)).sort((a,b)=>a.index-b.index).map(p=>{const ii=p.imageinfo?.[0]||{};return {thumb:String(ii.thumburl||'').replace(/\?.*$/,''),title:fileName(p.title),credit:picCredit(ii.extmetadata)};});
  }
  const seen=new Set();
  return {label:typed||titles[0]||topicText,results:[...fromArticles,...fromCommons].filter(r=>cleanImage({image:r.thumb}).image&&!seen.has(r.thumb)&&seen.add(r.thumb)).slice(0,12)};
}
async function searchPictures(typed){
  if(!picker)return;
  const card=editing?.cards[picker.index];
  const key=typed?'t:'+typed.trim():'c:'+(card?.imageTopic||'')+'|'+(card?.front||'')+'|'+(card?.back||'');
  picker.error='';
  if(typed!==null&&!typed.trim()){picker.query='';picker.results=[];renderRows();return;}
  if(pickerCache.has(key)){Object.assign(picker,pickerCache.get(key));renderRows();return;}
  picker.loading=true;renderRows();
  const want=picker;
  try{
    const {label,results}=await findPictures(typed?typed.trim():'',card);
    pickerCache.set(key,{query:label,results});
    if(picker!==want)return;
    picker.query=label;picker.results=results;
  }catch{if(picker===want)picker.error='Couldn’t reach Wikimedia right now. Try again, or upload your own picture.';}
  if(picker===want){picker.loading=false;renderRows();}
}
// Redraw just the card list (keeps your scroll position, unlike renderEditor).
function renderRows(){
  panel.querySelector('#fcRows').innerHTML=editing.cards.map(cardRow).join('');
  const n=editing.cards.length;panel.querySelector('#fcCount').textContent=`${n} card${n===1?'':'s'}`;
}
function renderEditor(){
  picker=null; // a fresh editor (or reload) starts with the picture picker closed
  const n=editing.cards.length;
  frame({badge:badge('✏️ Deck editor','🍂 Deck editor'),title:'Make it <span class="accent">memorable.</span>',
    sub:'One clear question per card, one focused answer. Short cards are easier to remember.'},
   `<div class="fc-topbar">${btn('← Decks','back',{cls:'ghost'})}<div class="fc-topbar-right"><span class="fc-pill" id="fcCount">${n} card${n===1?'':'s'}</span>${btn('Save','save',{cls:'primary small'})}</div></div>
    <div class="fc-deck-title-field"><label class="fc-field-label" for="fcTitle">Deck title</label><input class="fc-input" id="fcTitle" maxlength="100" value="${esc(editing.title)}" placeholder="Biology · Cell structures"></div>
    <div id="fcRows">${editing.cards.map(cardRow).join('')}</div>
    <input type="file" id="fcPicInput" accept="image/*" hidden>
    <div class="fc-add-row">${btn('+ Add card','add')}</div>
    <details class="fc-bulk"><summary>Paste a list of cards</summary><p>One card per line: the question, then the answer, separated by a <b>Tab</b>, “ - ” or “: ”. Copying two columns from Google Sheets or Excel works. This adds cards to the deck — it doesn't write answers for you.</p><label class="fc-field-label" for="fcBulk">Your cards</label><textarea class="fc-textarea" id="fcBulk" placeholder="Mitosis - cell division&#10;Osmosis - water moving across a membrane"></textarea><div style="margin-top:10px">${btn('Add pasted cards','bulk',{cls:'small'})}</div></details>
    <div class="fc-savebar">${btn('Cancel','back')}${btn('Save deck','save',{cls:'primary'})}</div>`);
}

function start(id,due){generationVersion++;const deck=decks.find(d=>d.id===id);const queue=studyQueue(deck.cards,due);if(!queue.length){home();message('You’re all caught up! Use Practice all to review ahead.','ok');return;}session={id,queue,flipped:false,reviewed:0,again:0,total:queue.length,retry:new Set()};study();}
function controls(){
  const s=session;
  return s.flipped
    ?`<div class="fc-grades">${btn('<span><span class="k">1</span>Again</span><small>See it again soon</small>','again',{cls:'fc-grade again'})}${btn('<span><span class="k">2</span>Good</span><small>Got it</small>','good',{cls:'fc-grade good'})}${btn('<span><span class="k">3</span>Easy</span><small>Knew it cold</small>','easy',{cls:'fc-grade easy'})}</div>`
    :btn('Reveal answer','flip',{cls:'primary fc-reveal'});
}

// Fill-in-the-blank cards: the back shows the sentence with the blank filled
// in (the answer highlighted), then the short reason — instead of a bare
// "2. One glucose…" that reads like a numbered list.
const BLANK=/_{3,}/;
function fillBack(c){
  const plain=`<p class="fc-face-text" id="fcAnswerText">${esc(c.back)}</p>`;
  if(!BLANK.test(c.front||''))return plain;
  const m=String(c.back||'').match(/^\s*(.+?)(?:[.!]\s+|\s+[—–-]\s+|$)([\s\S]*)$/);
  const ans=m&&m[1].trim().replace(/[.!]$/,'');
  if(!ans||ans.length>80)return plain;
  const [before,...after]=String(c.front).split(BLANK);
  return `<p class="fc-face-text" id="fcAnswerText">${esc(before)}<mark class="fc-fill">${esc(ans)}</mark>${esc(after.join('_____'))}</p>${m[2].trim()?`<p class="fc-fill-why">${esc(m[2].trim())}</p>`:''}`;
}

function study(){
  const s=session,d=decks.find(d=>d.id===s.id);
  if(!s.queue.length){
    const gotIt=s.reviewed-s.again;
    frame(null,`<div class="fc-done"><img src="${FOX}" alt=""><h1 class="fc-title" tabindex="-1">Session <span class="accent">complete!</span> <span class="no-ki">🎉</span></h1>
      <p class="fc-sub">Nice work on <b>${esc(d.title)}</b>. Your schedule is saved — Knox will bring cards back when they’re due.</p>
      <div class="fc-stats"><div class="fc-stat orange"><b>${s.reviewed}</b><span>Reviews</span></div><div class="fc-stat green"><b>${gotIt}</b><span>Got it</span></div><div class="fc-stat red"><b>${s.again}</b><span>Again</span></div></div>
      <div class="fc-toolbar">${btn('Back to decks','back',{cls:'primary'})}${btn('Practice again','practice',{attrs:`data-id="${esc(d.id)}"`})}</div></div>`,true);
    return;
  }
  const c=d.cards[s.queue[0]],retry=s.retry.has(s.queue[0]);
  const pct=Math.round(s.reviewed/(s.reviewed+s.queue.length)*100);
  frame(null,`<div class="fc-topbar fc-study-top">${btn('← Finish','back',{cls:'ghost'})}<span class="fc-pill">${esc(d.title)}</span></div>
    <div class="fc-progress"><div class="fc-progress-text"><span>${s.reviewed} reviewed</span><span>${s.queue.length} to go</span></div><div class="fc-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div></div>
    <div class="fc-stage"><button type="button" class="fc-card${s.flipped?' is-flipped':''}" data-action="flip" aria-label="${s.flipped?'Show question':'Reveal answer'}" aria-describedby="${s.flipped?'fcAnswerText':'fcQuestionText'}"><div class="fc-card-inner">
      <div class="fc-face front" aria-hidden="${s.flipped}"><span class="fc-face-label${retry?' retry':''}">${retry?'↻ Try again':'Question'}</span><p class="fc-face-text" id="fcQuestionText">${esc(c.front)}</p><span class="fc-face-hint">Think of the answer, then tap to flip · Space</span></div>
      <div class="fc-face back" aria-hidden="${!s.flipped}"><span class="fc-face-label">Answer</span>${fillBack(c)}${cleanImage(c).image?`<img class="fc-card-img" src="${esc(c.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.retried){this.nextElementSibling?.remove();this.remove()}else{this.dataset.retried=1;const u=this.src;setTimeout(()=>{this.src=u+(u.includes('?')?'&':'?')+'retry=1'},1500)}">${c.imageCredit?`<span class="fc-img-credit">${esc(c.imageCredit)}</span>`:''}`:''}<span class="fc-face-hint">How did you do? Tap to see the question again</span></div>
    </div></button></div>
    <div class="fc-controls" id="fcControls">${controls()}</div>
    <p class="fc-tip">Again brings the card back in a few cards. Good and Easy schedule it for another day.</p>`,true);
}
// Flip in place so the card animates instead of being redrawn.
function flip(){
  session.flipped=!session.flipped;
  const card=panel.querySelector('.fc-card');
  card.classList.toggle('is-flipped',session.flipped);
  card.setAttribute('aria-label',session.flipped?'Show question':'Reveal answer');
  card.setAttribute('aria-describedby',session.flipped?'fcAnswerText':'fcQuestionText');
  card.querySelector('.front').setAttribute('aria-hidden',String(session.flipped));
  card.querySelector('.back').setAttribute('aria-hidden',String(!session.flipped));
  announce(session.flipped?'Answer: '+decks.find(d=>d.id===session.id).cards[session.queue[0]].back:'Question shown');
  panel.querySelector('#fcControls').innerHTML=controls();
  panel.querySelector('#fcControls button')?.focus({preventScroll:true});
}

// Knox-style confirm dialog (the browser's built-in dialog can't be styled).
// Resolves true for the main action, false for cancel / Esc / backdrop.
function knoxConfirm({title,body,ok='OK',cancel='Cancel',danger=false}){
  return new Promise(resolve=>{
    const prev=document.activeElement;
    const wrap=document.createElement('div');
    wrap.className='fc-modal';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-labelledby','fcModalTitle');wrap.setAttribute('aria-describedby','fcModalBody');
    wrap.innerHTML=`<div class="fc-modal-card"><img src="${FOX}" alt=""><h2 id="fcModalTitle">${esc(title)}</h2><p id="fcModalBody">${esc(body)}</p>
      <div class="fc-modal-actions"><button type="button" class="fc-btn" data-r="0">${esc(cancel)}</button><button type="button" class="fc-btn ${danger?'danger-solid':'primary'}" data-r="1">${esc(ok)}</button></div></div>`;
    const buttons=()=>[...wrap.querySelectorAll('button')];
    const onKey=e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();done(false);}
      else if(e.key==='Tab'){const [a,b]=buttons();if(e.shiftKey&&document.activeElement===a){e.preventDefault();b.focus();}else if(!e.shiftKey&&document.activeElement===b){e.preventDefault();a.focus();}}
      else e.stopImmediatePropagation(); // keep study shortcuts (Space, 1–3) out while it's open
    };
    const done=v=>{wrap.remove();document.removeEventListener('keydown',onKey,true);prev?.focus?.({preventScroll:true});resolve(v);};
    wrap.addEventListener('click',e=>{const r=e.target.closest('[data-r]');if(r)done(r.dataset.r==='1');else if(e.target===wrap)done(false);});
    document.addEventListener('keydown',onKey,true);
    document.body.append(wrap);
    wrap.querySelector('[data-r="0"]').focus();
  });
}
const confirmLeave=()=>knoxConfirm({title:'Leave without saving?',body:'Your deck has changes that aren’t saved yet. If you leave now, they’ll be lost.',ok:'Leave',cancel:'Keep editing',danger:true});

// Import: cards you already have (files or pasted). Notes and photos are
// Make with Knox's job — Import says so and offers to hand them over.
// Files Make with Knox can read (doc-extract.js).
const MAKE_ACCEPT='.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.txt,.md,text/plain,image/*,.heic,.heif';
const IMPORT_ACCEPT='.json,application/json,.csv,text/csv,.tsv,.txt,text/plain,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_MAKE_FILES=12; // photos (5, or 10 on Mega Knox) plus a few files — PHOTO_LIMIT / DOC_CHARS set the rest
let importNote=null; // {files} — notes or photos dropped on Import
function importView(){
  generationVersion++;session=null;editing=null;dirty=false;
  const row=(icon,title,types,text)=>`<div class="fc-format"><span class="fc-format-icon" aria-hidden="true">${icon}</span><div><b>${title}</b> <span class="fc-format-types">${types}</span><p>${text}</p></div></div>`;
  const note=importNote?.files?.length?`<div class="fc-import-note" role="status"><p>📝 <b>${esc(importNote.files.length===1?importNote.files[0].name:importNote.files.length+' files')}</b> ${importNote.files.length===1?'looks':'look'} like notes or photos, not finished cards. Import brings in cards you already have — Make with Knox turns notes into cards.</p><div class="fc-toolbar">${btn('✨ Make cards from '+(importNote.files.length===1?'it':'them'),'import-to-make',{cls:'primary small'})}${btn('Never mind','import-note-x',{cls:'ghost small'})}</div></div>`:'';
  frame({badge:'<span class="fc-badge">📥 Import</span>',title:'Bring your <span class="accent">cards in.</span>',sub:'Already made cards somewhere else? Bring them here. Nothing is saved until you look it over.'},
   `<div class="fc-topbar fc-make-top">${btn('← Decks','back',{cls:'ghost'})}</div>
    <div class="fc-make">
      ${note}
      <button type="button" class="fc-dropzone" data-action="import-pick"><span class="fc-dropzone-icon" aria-hidden="true">📥</span><b>Drag a file here</b><span>or click to choose</span></button>
      <input type="file" id="fcImportInput" accept="${IMPORT_ACCEPT}" hidden>
      <span class="fc-field-label" style="margin-top:20px;display:block">Files that work</span>
      ${row('📊','Spreadsheet','.xlsx · .csv · .tsv','Excel or Google Sheets (File → Download → .csv): the question in the first column, the answer in the second.')}
      ${row('📋','Another study app','.txt','Export your cards as plain text from the app you used, then paste them below or choose the .txt file.')}
      ${row('🗂️','Knox backup','.json','A file you saved with Export — your decks come back exactly as they were.')}
      <label class="fc-field-label" for="fcPaste" style="margin-top:20px;display:block">Or paste your cards</label>
      <textarea class="fc-textarea" id="fcPaste" rows="5" placeholder="mitochondria	powerhouse of the cell&#10;osmosis - water moving across a membrane&#10;atom: the smallest unit of an element"></textarea>
      <p class="fc-doc-hint">One card per line — question, then answer, separated by a Tab, “ - ” or “: ”.</p>
      <div class="fc-toolbar" style="margin-top:12px">${btn('Use these cards','import-paste',{cls:'primary blue small'})}</div>
    </div>`,true);
}
const forMake=f=>window.knoxIsPhoto?.(f)||window.knoxIsDocument?.(f);
const openCards=(cards,name,kind)=>{
  generationVersion++;importNote=null;
  editing={id:crypto.randomUUID(),title:name.replace(/\.[^.]+$/,'').slice(0,100)||'Imported deck',cards};
  renderEditor();dirty=true;message(`Found ${cards.length} card${cards.length===1?'':'s'}${kind?' in your '+kind:''}. Look them over, then Save.`,'ok');
};
// Notes/photos on Import: explain, and let the student hand them to Make with Knox.
const notesOnImport=files=>{importNote={files};importView();};
async function importFiles(list){
  const files=[...(list||[])].filter(Boolean);
  if(!files.length)return;
  const cardFiles=files.filter(f=>!forMake(f)||/\.(txt|md|csv|tsv|json)$/i.test(f.name));
  if(!cardFiles.length){notesOnImport(files);return;}
  if(files.length>1)message('Import one file at a time — Knox used '+cardFiles[0].name+'.');
  await importFile(cardFiles[0]);
}
async function importFile(f){
  if(!f)return;
  const owner=identity,name=f.name.toLowerCase();
  if(/\.apkg$/.test(name))throw Error('For an Anki deck, use File → Export → “Notes in Plain Text” in Anki, then import that .txt file.');
  if(/\.xls$/.test(name))throw Error('That’s an old Excel file. Save it as .xlsx or .csv, then import it.');
  if(/\.(doc|ppt)$/.test(name))throw Error(`Old .${name.split('.').pop()} files aren’t supported — save it as .${name.endsWith('.doc')?'docx':'pptx'} or PDF and try again.`);
  if(/\.xlsx$/.test(name)||f.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){
    const rows=await window.knoxReadSpreadsheet(f);
    if(owner!==key())return;
    openCards(rowsToCards(rows),f.name,'spreadsheet');return;
  }
  if(forMake(f)&&!/\.(txt|md|markdown|csv|tsv|json)$/.test(name)){notesOnImport([f]);return;}
  if(f.size>2000000)throw Error('Choose a file smaller than 2 MB.');
  const text=await f.text();
  if(owner!==key())return;
  if(/\.(txt|md|markdown)$/.test(name)){
    const cards=parseList(text);
    if(cards){openCards(cards,f.name,'list');return;}
    notesOnImport([f]);return; // notes, not a card list
  }
  if(name.endsWith('.json')||f.type==='application/json'){
    let raw;try{raw=JSON.parse(text);}catch{throw Error('That .json file isn’t a Knox backup.');}
    if(raw.version!==1||!Array.isArray(raw.decks)||raw.decks.length>100)throw Error('Choose a Knox flashcard export (up to 100 decks).');
    const incoming=raw.decks.map(d=>({...validateDeck(d),id:crypto.randomUUID()}));
    if(save([...decks,...incoming])){home();message(`Imported ${incoming.length} deck${incoming.length===1?'':'s'}. Study schedules start fresh.`,'ok');}
    return;
  }
  if(/\.(csv|tsv)$/.test(name)||/^text\//.test(f.type)){openCards(parseTable(text),f.name);return;}
  throw Error('Import takes spreadsheets (.xlsx, .csv), card lists (.txt) and Knox backups (.json).');
}
// Export: a Knox backup (moves decks between devices) or a spreadsheet.
let exportTarget=null;
function exportView(target){
  exportTarget=target;generationVersion++;
  session=null;editing=null;dirty=false;
  const what=target.length===1?`“${esc(target[0].title)}”`:`all ${target.length} decks`;
  frame({badge:'<span class="fc-badge">📤 Export</span>',title:'Take your <span class="accent">cards with you.</span>',sub:`Save ${what} as a file.`},
   `<div class="fc-topbar fc-make-top">${btn('← Decks','back',{cls:'ghost'})}</div>
    <div class="fc-make">
      <span class="fc-field-label">Choose a format</span>
      <button type="button" class="fc-format fc-format-btn" data-action="export-json"><span class="fc-format-icon" aria-hidden="true">🗂️</span><div><b>Knox backup</b> <span class="fc-format-types">.json</span><p>Best for moving decks to another device or browser. Import it back into Knox anytime.</p></div></button>
      <button type="button" class="fc-format fc-format-btn" data-action="export-csv"><span class="fc-format-icon" aria-hidden="true">📊</span><div><b>Spreadsheet</b> <span class="fc-format-types">.csv</span><p>Opens in Google Sheets and Excel. Study progress isn’t included.</p></div></button>
      <button type="button" class="fc-format fc-format-btn" data-action="export-text"><span class="fc-format-icon" aria-hidden="true">📋</span><div><b>Copy as text</b> <span class="fc-format-types">copy &amp; paste</span><p>Copies your cards, one per line — paste them into a doc, a spreadsheet or another study app.</p></div></button>
    </div>`,true);
}
function exportCsv(data){const blob=new Blob(['\uFEFF'+toCsv(data)],{type:'text/csv'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(data.length===1?data[0].title.replace(/[^\w\- ]+/g,'').trim()||'knox-flashcards':'knox-flashcards')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function exportData(data){const blob=new Blob([JSON.stringify({version:1,decks:data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='knox-flashcards.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function open(){if(!canSee())return;if(dirty&&!(await confirmLeave()))return;window.closeCalc?.();/* calculator open: close it first, or it stays on top */if(identity!==key())load();document.body.classList.add('knox-flashcards');panel.hidden=false;document.querySelectorAll('.sidebar-quicknav-link').forEach(b=>b.classList.toggle('sidebar-nav-active',b.classList.contains('fc-nav')));window.closeMobileHistory?.();home();panel.querySelector('.fc-title')?.focus();
 // Bring in decks from the account; redraw the deck list if still on it.
 pullDecks().then(changed=>{if(changed&&!panel.hidden&&!session&&!editing&&panel.querySelector('.fc-ways'))home();});}
window.openFlashcards=open; // lets /app?open=flashcards reopen this section after a refresh
// From a finished Learn lesson: open Make with Knox with the lesson filled in.
window.flashcardsMake=async request=>{if(!canSee())return false;await open();if(panel.hidden)return false;makeOpts.request=String(request||'').slice(0,4000);makeView();return true;};
if(window.__knoxOpenFlashcardsWhenReady){window.__knoxOpenFlashcardsWhenReady=false;open();}
function close(){generationVersion++;document.body.classList.remove('knox-flashcards');panel.hidden=true;session=null;editing=null;dirty=false;}
const icon='<span class="sq-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="15" height="15" rx="3"/><path d="M17 3H6a3 3 0 0 0-3 3v11M10 11h7M10 15h5"/></svg></span>';
document.querySelectorAll('.sidebar-quicknav').forEach(nav=>{const b=document.createElement('button');b.className='sidebar-quicknav-link fc-nav';b.type='button';b.setAttribute('aria-label','Flashcards');b.innerHTML=icon+'<span class="sidebar-collapsible">Flashcards</span>';b.addEventListener('click',open);nav.append(b);});
// Visibility (see EVERYONE): if Flashcards is ever limited to Knox Plus again, the tab stays hidden until the plan is known to be Knox Plus,
// and closes if the account changes to one without Knox Plus (e.g. sign-out).
function syncAccess(){const ok=canSee();document.querySelectorAll('.fc-nav').forEach(b=>b.classList.toggle('fc-locked',!ok));if(!ok&&document.body.classList.contains('knox-flashcards'))close();}
syncAccess();window.addEventListener('knox-plan-changed',syncAccess);
// Leaving Flashcards from the sidebar: ask first if a deck has unsaved edits,
// then replay the click so the sidebar does what was asked.
document.addEventListener('click',async e=>{if(!document.body.classList.contains('knox-flashcards'))return;const nav=e.target.closest('.sidebar-quicknav-link:not(.fc-nav),.sidebar-new-btn,.sidebar-history-item');if(!nav)return;if(!dirty){close();return;}e.preventDefault();e.stopImmediatePropagation();if(await confirmLeave()){close();nav.click();}},true);
// Notes for Make with Knox, read in the browser by doc-extract.js: PDF, Word,
// PowerPoint and text files become text; photos (and scanned PDFs) are shrunk
// JPEGs that Knox looks at directly.
async function takeFiles(list){
  const files=[...(list||[])].filter(Boolean);
  if(!files.length)return;
  makeOpts.request=(panel.querySelector('#fcMakeReq')?.value??makeOpts.request??'');
  makeOpts.reading=true;makeView();
  const owner=key();
  const addPhoto=(p,name)=>{
    if(makeOpts.files.filter(f=>f.kind==='photo').length>=PHOTO_LIMIT[tierNow()])throw Error(`Knox can use up to ${PHOTO_LIMIT[tierNow()]} photos per deck${tierNow()==='mega'?'':' — Mega Knox takes up to 10'}.`);
    makeOpts.files.push({kind:'photo',name:name||p.name,type:p.type,data:p.data});
  };
  try{
    for(const file of files){
      if(makeOpts.files.length>=MAX_MAKE_FILES){message(`That’s plenty for one deck — up to ${MAX_MAKE_FILES} files.`);break;}
      try{
        if(window.knoxIsPhoto?.(file)&&!window.knoxIsDocument?.(file)){const p=await window.knoxShrinkPhoto(file);if(owner!==key())return;addPhoto(p);continue;}
        const doc=await window.knoxReadDocument(file);
        if(owner!==key())return;
        if(doc.kind==='image'){addPhoto(await window.knoxShrinkPhoto(doc.file),doc.name+' (page 1)');continue;} // scanned PDF
        const used=makeOpts.files.reduce((n,f)=>n+(f.kind==='text'?f.text.length+f.name.length+8:0),0),room=DOC_CHARS[tierNow()]-used-doc.name.length-8;
        if(room<500)throw Error(`That’s a lot of reading for one deck — make this one, then another with ${doc.name}.`);
        makeOpts.files.push({kind:'text',name:doc.name,text:doc.text.slice(0,room),truncated:doc.truncated||doc.text.length>room});
      }catch(err){message(err.message||'Knox couldn’t read that file.');}
    }
  }finally{makeOpts.reading=false;if(owner===key()&&panel.querySelector('#fcMakeReq'))makeView();}
}
// Shrink a picked photo so decks stay small in browser storage (~60 KB each;
// a browser keeps about 5 MB for all of a student's decks).
async function shrinkPicture(file){
  if(!window.knoxIsPhoto?.(file)&&!/^image\//.test(file.type))throw Error('Choose a picture (JPEG, PNG, WEBP, GIF or HEIC).');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    try{await new Promise((ok,bad)=>{img.onload=ok;img.onerror=bad;img.src=url;});}
    catch{throw Error(/\.hei[cf]$/i.test(file.name)?'This browser can’t open iPhone HEIC photos. Take a screenshot of it, or try Safari.':'Knox couldn’t open that picture. Try a JPEG or PNG.');}
    for(const edge of [560,420,320]){
      const k=Math.min(1,edge/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*k));canvas.height=Math.max(1,Math.round(img.naturalHeight*k));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for(const q of [0.78,0.66,0.55]){const data=canvas.toDataURL('image/jpeg',q);if(data.length<=90000)return data;}
    }
    throw Error('That picture is too detailed to store. Try a simpler or cropped picture.');
  }finally{URL.revokeObjectURL(url);}
}
panel.addEventListener('keydown',e=>{if(e.target.id==='fcPicSearch'&&e.key==='Enter'){e.preventDefault();searchPictures(e.target.value);}if(e.target.id==='fcPicSearch'&&e.key==='Escape'){picker=null;renderRows();}});
function useOwnPicture(f,i){
  const deck=editing;if(!f||!deck?.cards[i])return;
  shrinkPicture(f).then(data=>{if(editing!==deck||!deck.cards[i])return;deck.cards[i].image=data;delete deck.cards[i].imageCredit;dirty=true;picker=null;renderRows();}).catch(err=>message(err.message||'Knox couldn’t use that picture.'));
}
panel.addEventListener('change',e=>{if(e.target.id==='fcPicInput'){const f=e.target.files[0],i=+e.target.dataset.index;e.target.value='';useOwnPicture(f,i);return;}
  if(e.target.id==='fcAutoPics'){setAutoPictures(e.target.checked);return;}
  if(e.target.id==='fcDocInput'){const fs=[...e.target.files];e.target.value='';takeFiles(fs);}
  if(e.target.id==='fcImportInput'){const fs=[...e.target.files];e.target.value='';importFiles(fs).catch(err=>message(err.message||'Knox couldn’t import that file.'));}});
// Files dropped anywhere while Flashcards is open: Make with Knox adds them
// as notes; any other screen imports them (never while editing a deck).
window.flashcardsTakeDrop=files=>{
  if(panel.hidden)return false;
  const list=[...files];
  if(panel.querySelector('#fcMakeReq')){takeFiles(list);return true;}
  if(panel.querySelector('.fc-loading')){message('Knox is still writing your cards — one moment.');return true;}
  // In the editor, a photo dropped while the picture picker is open goes on that card.
  if(editing){
    if(picker&&list.length===1&&window.knoxIsPhoto?.(list[0])){useOwnPicture(list[0],picker.index);return true;}
    message(picker?'Drop one picture to put it on this card.':'To add a picture, click Image on a card. To bring in more cards, save this deck and choose Import.');return true;
  }
  if(session){message('Finish this study session first, then drop your file on Decks.');return true;}
  if(!panel.querySelector('#fcImportInput'))importView();
  importFiles(list).catch(err=>message(err.message||'Knox couldn’t import that file.'));
  return true;
};
window.addEventListener('knox-auth-changed',()=>{generationVersion++;Object.assign(makeOpts,{request:'',count:10,style:'qa',difficulty:'mixed',upgrade:false,files:[],reading:false});load();if(!panel.hidden)home();});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
panel.addEventListener('input',e=>{if(e.target.id==='fcSearch'){renderDecks(e.target.value);return;}if(e.target.id==='fcMakeReq'){makeOpts.request=e.target.value;return;}if(!editing)return;dirty=true;if(e.target.id==='fcTitle')editing.title=e.target.value;else if(e.target.dataset.field){const c=editing.cards[+e.target.dataset.index];c[e.target.dataset.field]=e.target.value;c.due=0;c.interval=0;if(e.target.dataset.field==='front')delete c.imageTopic;}});
panel.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action,id=b.dataset.id;
 if(identity!==key()){load();home();return;}
 try{
 if(action==='create')editor();
 if(action==='make')makeView();
 if(action==='doc-pick')panel.querySelector('#fcDocInput')?.click();
 if(action==='doc-clear'){makeOpts.request=panel.querySelector('#fcMakeReq')?.value??makeOpts.request;makeOpts.files.splice(+b.dataset.index,1);makeView();}
 if(action==='make-go'){b.disabled=true;try{await makeDeck();}finally{b.disabled=false;}}
 if(action==='make-example'){makeOpts.request=b.dataset.text;const t=panel.querySelector('#fcMakeReq');t.value=b.dataset.text;t.focus();}
 if(action==='make-count'||action==='make-style'||action==='make-difficulty'){if(action==='make-count')makeOpts.count=+b.dataset.count;else if(action==='make-style')makeOpts.style=b.dataset.style;else makeOpts.difficulty=b.dataset.difficulty;b.parentElement.querySelectorAll('.fc-chip').forEach(c=>c.classList.toggle('on',c===b));}
 if(action==='upgrade')window.goToPricing?.();
 if(action==='back'){if(!dirty||await knoxConfirm({title:'Discard your changes?',body:'You have edits that aren’t saved yet. If you go back now, they’ll be lost.',ok:'Discard',cancel:'Keep editing',danger:true}))home();}
 if(action==='edit')editor(decks.find(d=>d.id===id));
 if(action==='add'){if(editing.cards.length>=300)throw Error('Maximum 300 cards per deck.');editing.cards.push({front:'',back:''});dirty=true;const i=editing.cards.length-1;renderRows();const row=panel.querySelector('#fcRows').lastElementChild;row.classList.add('fc-row-new');row.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});panel.querySelector(`#fcFront${i}`)?.focus({preventScroll:true});}
 if(action==='pic-add'){const input=panel.querySelector('#fcPicInput');input.dataset.index=b.dataset.index;input.click();}
 if(action==='pic-remove'){const c=editing.cards[+b.dataset.index];delete c.image;delete c.imageCredit;dirty=true;if(picker?.index===+b.dataset.index)picker=null;renderRows();}
 if(action==='pic-open'){const i=+b.dataset.index,c=editing.cards[i];picker={index:i,query:'',results:[]};renderRows();panel.querySelector('#fcPicSearch')?.focus();if((c.front||c.back||'').trim())searchPictures(null);}
 if(action==='pic-search')searchPictures(panel.querySelector('#fcPicSearch')?.value||'');
 if(action==='pic-close'){picker=null;renderRows();}
 if(action==='pic-pick'&&picker){const r=picker.results[+b.dataset.k],c=editing.cards[picker.index];if(r&&c){c.image=r.thumb;c.imageCredit=r.credit.slice(0,200);dirty=true;}picker=null;renderRows();}
 if(action==='remove'){picker=null;editing.cards.splice(+b.dataset.index,1);if(!editing.cards.length)editing.cards.push({front:'',back:''});dirty=true;renderRows();}
 if(action==='bulk'){const cards=parsePasted(panel.querySelector('#fcBulk').value);const existing=editing.cards.filter(c=>c.front.trim()||c.back.trim());validateDeck({title:editing.title||'Draft',cards:[...existing,...cards]});editing.cards=[...existing,...cards];dirty=true;renderEditor();message(`Added ${cards.length} card${cards.length===1?'':'s'}.`,'ok');}
 if(action==='save'){const before=editing.cards.length;editing.cards=editing.cards.filter(c=>c.front.trim()||c.back.trim());if(editing.cards.length&&editing.cards.length!==before)renderEditor();if(!editing.cards.length){editing.cards=[{front:'',back:''}];renderEditor();throw Error('Add at least one card with a question and an answer.');}const valid=validateDeck(editing);const next={...editing,title:valid.title,cards:editing.cards.map((c,i)=>({...valid.cards[i],...c,front:valid.cards[i].front,back:valid.cards[i].back}))};const exists=decks.some(d=>d.id===next.id);if(save(exists?decks.map(d=>d.id===next.id?next:d):[...decks,next])){home();message('Deck saved. Ready when you are!','ok');}}
 if(action==='delete'&&await knoxConfirm({title:'Delete this deck?',body:'This removes the deck and all its study progress. Export it first if you want a backup.',ok:'Delete deck',cancel:'Keep it',danger:true})){if(save(decks.filter(d=>d.id!==id)))home();}
 if(action==='export')exportView(decks.filter(d=>d.id===id));
 if(action==='export-all')exportView(decks);
 if(action==='export-json'&&exportTarget){exportData(exportTarget);message('Saved a Knox backup (.json).','ok');}
 if(action==='export-csv'&&exportTarget){exportCsv(exportTarget);message('Saved a spreadsheet (.csv).','ok');}
 if(action==='export-text'&&exportTarget){try{await navigator.clipboard.writeText(toTabText(exportTarget));message(`Copied ${exportTarget.reduce((n,d)=>n+d.cards.length,0)} cards — paste them anywhere.`,'ok');}catch{message('Your browser blocked copying. Use the Spreadsheet option instead.');}}
 if(action==='import-paste'){const cards=parsePasted(panel.querySelector('#fcPaste')?.value);openCards(cards,'Pasted cards');}
 if(action==='import-to-make'&&importNote){const files=importNote.files;importNote=null;makeView();await takeFiles(files);}
 if(action==='import-note-x'){importNote=null;importView();}
 if(action==='make-cancel'){generationVersion++;makeView();message('Stopped. Your request is still here.','ok');}
 if(action==='import-pick')panel.querySelector('#fcImportInput')?.click();
 if(action==='sample'){b.disabled=true;try{await sampleDeck();}finally{b.disabled=false;}}
 if(action==='due'||action==='practice')start(id,action==='due');
 if(action==='flip'&&session)flip();
 if(['again','good','easy'].includes(action)&&session?.flipped){const s=session,index=s.queue[0];const next=structuredClone(decks);const d=next.find(d=>d.id===s.id);d.cards[index]=schedule(d.cards[index],action);if(!save(next))return;s.queue.shift();if(action==='again'){s.queue.splice(Math.min(3,s.queue.length),0,index);s.retry.add(index);s.again++;if(s.queue.length>1)message('↻ Knox will bring this one back in a few cards.','ok');}else s.retry.delete(index);s.reviewed++;s.flipped=false;if(s.reviewed===5||(!s.queue.length&&s.reviewed>=3))window.knoxFlameFest?.studied();study();}
 if(action==='import')importView();
 }catch(err){message(err.message);}
});
// Space flips, 1/2/3 grade — but never while typing. A focused button
// already turns Space into a click, so leave that to the browser.
document.addEventListener('keydown',e=>{if(e.target?.id==='fcMakeReq'&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();panel.querySelector('[data-action="make-go"]')?.click();return;}if(!panel.hidden&&session&&e.key==='Escape'){e.preventDefault();home();return;}if(panel.hidden||!session||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='Space'&&e.target.tagName==='BUTTON')return;const action=e.code==='Space'?'flip':({'1':'again','2':'good','3':'easy'}[e.key]);const b=action&&panel.querySelector(`[data-action="${action}"]`);if(b){e.preventDefault();b.click();}});
load();
