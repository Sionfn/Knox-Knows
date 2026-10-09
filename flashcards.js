import {validateDeck,parseLines,schedule,studyQueue} from './flashcards-core.js';
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
panel.append(decor,view,toast);
let decks=[], identity='', session=null, editing=null, dirty=false;
const key=()=>`knox.flashcards.v1.${window.currentUser?.uid || 'guest'}`;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Deck stickers cycle through the same four colors as the topic chips.
const FLAVORS=['orange','green','blue','purple'], ICONS=['🧠','📚','💡','⭐'];
const FOX='/knox-logo-square.jpg';
// A deck keeps its color/emoji even when others are added, edited or deleted.
const flavorOf=id=>{let h=0;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))>>>0;return h%4;};
let pendingMessage='';

function load(){ identity=key(); session=null; editing=null; dirty=false; try{const raw=JSON.parse(localStorage.getItem(identity)||'[]'); if(!Array.isArray(raw))throw Error(); decks=raw.filter(d=>{try{validateDeck(d);return typeof d.id==='string';}catch{return false;}});}catch{decks=[];pendingMessage='Saved decks could not be read. Import a backup to recover them.';} }
function save(next){try{localStorage.setItem(identity,JSON.stringify(next));decks=next;return true;}catch{message('Your browser could not save. Export your decks before closing this page.');return false;}}
// Messages show as a toast pinned to the top of the panel.
// Success messages fade after a few seconds, errors stay a little longer;
// clicking the message dismisses it right away.
function message(t,kind=''){clearTimeout(toastTimer);if(!t){hideToast();return;}toast.textContent=t;toast.className='fc-toast show'+(kind?' '+kind:'');toastTimer=setTimeout(hideToast,kind==='ok'?3500:6500);}
function btn(label,action,{cls='',attrs=''}={}){return `<button type="button" class="fc-btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;}
const badge=(normal,spooky)=>`<span class="fc-badge"><span class="hw-hide">${normal}</span><span class="hw-only">${spooky}</span></span>`;
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
const makeOpts={request:'',count:10,style:'qa',upgrade:false};
const EXAMPLES=[
  ['🍎','Sophomore · Newton’s laws','I’m a sophomore in physics learning Newton’s three laws of motion'],
  ['🧬','AP Bio · cell respiration','AP Biology: cellular respiration — glycolysis, Krebs cycle and the electron transport chain'],
  ['🏛️','8th grade · the Constitution','8th grade civics: the U.S. Constitution, the three branches and checks and balances'],
  ['🫀','Nursing · the heart','College nursing student: anatomy of the heart and the path of blood flow'],
];
// Plus (or comped) members make bigger decks for free; free users spend questions.
const isPlus=()=>['super','max','plus'].includes(window.userPlan)||window.userComped===true;
// Beta: only Plus members see Flashcards until the November launch. Set to true
// (and FREE_ACCESS in api/generate-flashcards.js) to show it to everyone.
const EVERYONE=false;
const canSee=()=>EVERYONE||isPlus();
const DECK_COST=3, FREE_MAX=10;
const chip=(label,action,on,attrs='')=>`<button type="button" class="fc-chip${on?' on':''}" data-action="${action}" ${attrs}>${label}</button>`;
function makeView(){
  session=null;editing=null;dirty=false;
  const plus=isPlus();
  if(!plus&&makeOpts.count>FREE_MAX)makeOpts.count=FREE_MAX;
  frame({badge:'<span class="fc-badge">✨ Make with Knox</span>',title:'Tell Knox what <span class="accent">you’re studying.</span>',
    sub:'Say your grade or class and the topic. Knox writes the cards at your level — you can edit them before you save.'},
   `<div class="fc-make">
      <label class="fc-field-label" for="fcMakeReq">What are you studying?</label>
      <textarea class="fc-textarea" id="fcMakeReq" rows="4" maxlength="4000" placeholder="I’m a sophomore in physics learning Newton’s laws of motion">${esc(makeOpts.request)}</textarea>
      <div class="fc-examples">${EXAMPLES.map(([ic,label,text])=>chip(`${ic} ${label}`,'make-example',false,`data-text="${esc(text)}"`)).join('')}</div>
      <div class="fc-make-opts">
        <div><span class="fc-field-label">How many cards?</span><div class="fc-chips">${[10,15,20].map(n=>!plus&&n>FREE_MAX?chip(`${n} <span class="fc-plus-tag">⚡ Plus</span>`,'upgrade',false,`title="Plus makes decks up to 20 cards"`):chip(String(n),'make-count',makeOpts.count===n,`data-count="${n}"`)).join('')}</div></div>
        <div><span class="fc-field-label">Card style</span><div class="fc-chips">${chip('Question → answer','make-style',makeOpts.style==='qa','data-style="qa"')}${chip('Term → definition','make-style',makeOpts.style==='term','data-style="term"')}</div></div>
      </div>
      ${makeOpts.upgrade?`<div class="fc-upsell">⚡ <span>Go unlimited with <b>Knox Plus</b> — make as many decks as you want, up to 20 cards each.</span>${btn('See Knox Plus','upgrade',{cls:'small'})}</div>`:''}
      <div class="fc-toolbar" style="margin-top:20px">${btn('← Decks','back',{cls:'ghost'})}${btn(plus?'✨ Make my deck':`✨ Make my deck · ${DECK_COST} questions`,'make-go',{cls:'primary'})}</div>
      <p class="fc-cost">${plus?'⚡ Knox Plus — unlimited decks, up to 20 cards each.':`Uses ${DECK_COST} of your daily questions · <b>Knox Plus</b> makes unlimited decks.`}</p>
      <p class="fc-note" style="margin-top:14px">Knox can make mistakes — read the cards over before you study them.</p>
    </div>`,true);
  panel.querySelector('#fcMakeReq')?.focus();
}
async function makeDeck(){
  const request=(panel.querySelector('#fcMakeReq')?.value||'').trim();
  makeOpts.request=request;makeOpts.upgrade=false;
  if(request.length<3){message('Tell Knox what you’re studying — the topic, and your grade or class if you like.');panel.querySelector('#fcMakeReq')?.focus();return;}
  const user=window.currentUser;
  if(!user?.getIdToken){message('Sign in to make decks with Knox.');window.openAuthModal?.();return;}
  frame(null,`<div class="fc-loading"><img src="${FOX}" alt=""><h2>Knox is writing your cards…</h2><p class="fc-sub">This usually takes a few seconds.</p><div class="fc-dots"><span></span><span></span><span></span></div></div>`,true);
  let data={},ok=false;
  try{
    const r=await fetch('/api/generate-flashcards',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+await user.getIdToken()},body:JSON.stringify({request,count:makeOpts.count,style:makeOpts.style})});
    data=await r.json().catch(()=>({}));ok=r.ok;
  }catch{data={error:'Couldn’t reach Knox. Check your connection and try again.'};}
  if(identity!==key()){load();home();return;}            // signed out / switched account meanwhile
  if(!ok||!Array.isArray(data.cards)){makeOpts.upgrade=!!data.upgrade;makeView();message(data.error||'Knox couldn’t make that deck. Please try again.');return;}
  editing={id:crypto.randomUUID(),title:data.title||'My Knox deck',cards:data.cards.map(c=>({front:c.front,back:c.back}))};
  renderEditor();dirty=true;makeOpts.request='';
  window.updateUsageIndicator?.(); // sidebar "questions left" reflects the spent credits
  const left=typeof data.creditsLeft==='number'?` You have ${data.creditsLeft} question${data.creditsLeft===1?'':'s'} left today.`:'';
  message(`Knox made ${editing.cards.length} cards. Read them over, change anything you like, then save!${left}`,'ok');
}

function home(query=''){
  session=null; editing=null; dirty=false;
  frame({badge:badge('🗂️ Knox Flashcards','🎃 Spooky study session'),title:'Practice makes<br><span class="accent">knowing.</span>',
    sub:'Build a deck, try to recall each answer before you flip, and Knox brings back the tricky cards more often.'},
   `<div class="fc-toolbar">${btn('✨ Make with Knox','make',{cls:'primary'})}${btn('+ Create deck','create',{cls:'primary blue'})}${btn('Try a sample','sample')}${btn('Import','import')}${btn('Export all','export-all',{attrs:decks.length?'':'disabled'})}</div>
    ${decks.length?`<div class="fc-search-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="fc-search" id="fcSearch" type="search" aria-label="Find a deck" placeholder="Find a deck…" value="${esc(query)}"></div>`:'<div style="height:22px"></div>'}
    <div class="fc-grid" id="fcDecks"></div>
    <p class="fc-note">Your decks are saved in this browser${window.currentUser?' for your account':''}. Use Export to back them up or move them to another device.</p>`,true);
  renderDecks(query);
  if(pendingMessage){message(pendingMessage);pendingMessage='';}
}
function renderDecks(query){
  const grid=panel.querySelector('#fcDecks');
  const results=decks.map(d=>[d,flavorOf(d.id)]).filter(([d])=>d.title.toLowerCase().includes(query.toLowerCase()));
  if(!results.length){
    grid.style.display='block';
    grid.innerHTML=decks.length
      ?`<div class="fc-empty"><h2>No matching decks</h2><p class="fc-sub">Try a different word, or clear the search.</p></div>`
      :`<div class="fc-empty"><img src="${FOX}" alt=""><h2>Your next “I know this!” starts here.</h2><p class="fc-sub">Make your own deck, or try the sample to see how studying works.</p></div>`;
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

function editor(deck){editing=deck?structuredClone(deck):{id:crypto.randomUUID(),title:'',cards:[{front:'',back:''}]};dirty=false;renderEditor();}
// One card row. Only the first card shows example text — repeating it on every
// blank card made new cards look like copies of card 1.
function cardRow(c,i){
  const ex=i===0;
  return `<div class="fc-row">
      <div class="fc-row-head"><span class="fc-num">${i+1}</span>${btn('Remove','remove',{cls:'ghost small danger',attrs:`data-index="${i}" aria-label="Remove card ${i+1}"`})}</div>
      <div class="fc-fields"><div><label class="fc-field-label" for="fcFront${i}">Question / term</label><textarea class="fc-textarea" id="fcFront${i}" data-field="front" data-index="${i}" maxlength="2000"${ex?' placeholder="What is photosynthesis?"':''}>${esc(c.front)}</textarea></div>
      <div><label class="fc-field-label" for="fcBack${i}">Answer / definition</label><textarea class="fc-textarea" id="fcBack${i}" data-field="back" data-index="${i}" maxlength="4000"${ex?' placeholder="How plants turn light, water and CO₂ into sugar and oxygen."':''}>${esc(c.back)}</textarea></div></div>
    </div>`;
}
// Redraw just the card list (keeps your scroll position, unlike renderEditor).
function renderRows(){
  panel.querySelector('#fcRows').innerHTML=editing.cards.map(cardRow).join('');
  const n=editing.cards.length;panel.querySelector('#fcCount').textContent=`${n} card${n===1?'':'s'}`;
}
function renderEditor(){
  const n=editing.cards.length;
  frame({badge:badge('✏️ Deck editor','🎃 Deck editor'),title:'Make it <span class="accent">memorable.</span>',
    sub:'One clear question per card, one focused answer. Short cards are easier to remember.'},
   `<div class="fc-topbar">${btn('← Decks','back',{cls:'ghost'})}<div class="fc-topbar-right"><span class="fc-pill" id="fcCount">${n} card${n===1?'':'s'}</span>${btn('Save','save',{cls:'primary small'})}</div></div>
    <div class="fc-deck-title-field"><label class="fc-field-label" for="fcTitle">Deck title</label><input class="fc-input" id="fcTitle" maxlength="100" value="${esc(editing.title)}" placeholder="Biology · Cell structures"></div>
    <div id="fcRows">${editing.cards.map(cardRow).join('')}</div>
    <div class="fc-add-row">${btn('+ Add card','add')}</div>
    <details class="fc-bulk"><summary>Paste cards from notes or a spreadsheet</summary><p>One card per line: the question, then a <b>Tab</b>, then the answer. Copying two columns from Google Sheets or Excel works. This adds cards to the deck — it doesn't write answers for you.</p><label class="fc-field-label" for="fcBulk">Tab-separated cards</label><textarea class="fc-textarea" id="fcBulk" placeholder="Question [Tab] Answer"></textarea><div style="margin-top:10px">${btn('Add pasted cards','bulk',{cls:'small'})}</div></details>
    <div class="fc-savebar">${btn('Cancel','back')}${btn('Save deck','save',{cls:'primary'})}</div>`);
}

function start(id,due){const deck=decks.find(d=>d.id===id);const queue=studyQueue(deck.cards,due);if(!queue.length){home();message('You’re all caught up! Use Practice all to review ahead.','ok');return;}session={id,queue,flipped:false,reviewed:0,again:0,total:queue.length};study();}
function controls(){
  const s=session;
  return s.flipped
    ?`<div class="fc-grades">${btn('<span><span class="k">1</span>Again</span><small>See it again soon</small>','again',{cls:'fc-grade again'})}${btn('<span><span class="k">2</span>Good</span><small>Got it</small>','good',{cls:'fc-grade good'})}${btn('<span><span class="k">3</span>Easy</span><small>Knew it cold</small>','easy',{cls:'fc-grade easy'})}</div>`
    :btn('Reveal answer','flip',{cls:'primary fc-reveal'});
}
function study(){
  const s=session,d=decks.find(d=>d.id===s.id);
  if(!s.queue.length){
    const gotIt=s.reviewed-s.again;
    frame(null,`<div class="fc-done"><img src="${FOX}" alt=""><h1 class="fc-title" tabindex="-1">Session <span class="accent">complete!</span> 🎉</h1>
      <p class="fc-sub">Nice work on <b>${esc(d.title)}</b>. Your schedule is saved — Knox will bring cards back when they’re due.</p>
      <div class="fc-stats"><div class="fc-stat orange"><b>${s.reviewed}</b><span>Reviews</span></div><div class="fc-stat green"><b>${gotIt}</b><span>Got it</span></div><div class="fc-stat red"><b>${s.again}</b><span>Again</span></div></div>
      <div class="fc-toolbar">${btn('Back to decks','back',{cls:'primary'})}${btn('Practice again','practice',{attrs:`data-id="${esc(d.id)}"`})}</div></div>`,true);
    return;
  }
  const c=d.cards[s.queue[0]];
  const pct=Math.round(s.reviewed/(s.reviewed+s.queue.length)*100);
  frame(null,`<div class="fc-topbar fc-study-top">${btn('← Finish','back',{cls:'ghost'})}<span class="fc-pill">${esc(d.title)}</span></div>
    <div class="fc-progress"><div class="fc-progress-text"><span>${s.reviewed} reviewed</span><span>${s.queue.length} to go</span></div><div class="fc-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div></div>
    <div class="fc-stage"><button type="button" class="fc-card${s.flipped?' is-flipped':''}" data-action="flip" aria-label="${s.flipped?'Show question':'Reveal answer'}"><div class="fc-card-inner">
      <div class="fc-face front"><span class="fc-face-label">Question</span><p class="fc-face-text">${esc(c.front)}</p><span class="fc-face-hint">Think of the answer, then tap to flip · Space</span></div>
      <div class="fc-face back"><span class="fc-face-label">Answer</span><p class="fc-face-text">${esc(c.back)}</p><span class="fc-face-hint">How did you do? Tap to see the question again</span></div>
    </div></button></div>
    <div class="fc-controls" id="fcControls">${controls()}</div>
    <p class="fc-tip">Again brings the card back later this session. Good and Easy schedule it for another day.</p>`,true);
}
// Flip in place so the card animates instead of being redrawn.
function flip(){
  session.flipped=!session.flipped;
  const card=panel.querySelector('.fc-card');
  card.classList.toggle('is-flipped',session.flipped);
  card.setAttribute('aria-label',session.flipped?'Show question':'Reveal answer');
  panel.querySelector('#fcControls').innerHTML=controls();
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

function exportData(data){const blob=new Blob([JSON.stringify({version:1,decks:data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='knox-flashcards.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function open(){if(!canSee())return;if(dirty&&!(await confirmLeave()))return;if(identity!==key())load();document.body.classList.add('knox-flashcards');panel.hidden=false;document.querySelectorAll('.sidebar-quicknav-link').forEach(b=>b.classList.toggle('sidebar-nav-active',b.classList.contains('fc-nav')));window.closeMobileHistory?.();home();panel.querySelector('.fc-title')?.focus();}
window.openFlashcards=open; // lets /app?open=flashcards reopen this section after a refresh
if(window.__knoxOpenFlashcardsWhenReady){window.__knoxOpenFlashcardsWhenReady=false;open();}
function close(){document.body.classList.remove('knox-flashcards');panel.hidden=true;session=null;editing=null;dirty=false;}
const icon='<span class="sq-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="15" height="15" rx="3"/><path d="M17 3H6a3 3 0 0 0-3 3v11M10 11h7M10 15h5"/></svg></span>';
document.querySelectorAll('.sidebar-quicknav').forEach(nav=>{const b=document.createElement('button');b.className='sidebar-quicknav-link fc-nav';b.type='button';b.title='Flashcards';b.setAttribute('aria-label','Flashcards');b.innerHTML=icon+'<span class="sidebar-collapsible">Flashcards</span><span class="fc-beta sidebar-collapsible">Beta</span>';b.addEventListener('click',open);nav.append(b);});
// Plus-only during beta (see EVERYONE): the tab stays hidden until the plan is known to be Plus,
// and closes if the account changes to one without Plus (e.g. sign-out).
function syncAccess(){const ok=canSee();document.querySelectorAll('.fc-nav').forEach(b=>b.classList.toggle('fc-locked',!ok));if(!ok&&document.body.classList.contains('knox-flashcards'))close();}
syncAccess();window.addEventListener('knox-plan-changed',syncAccess);
// Leaving Flashcards from the sidebar: ask first if a deck has unsaved edits,
// then replay the click so the sidebar does what was asked.
document.addEventListener('click',async e=>{if(!document.body.classList.contains('knox-flashcards'))return;const nav=e.target.closest('.sidebar-quicknav-link:not(.fc-nav),.sidebar-new-btn,.sidebar-history-item');if(!nav)return;if(!dirty){close();return;}e.preventDefault();e.stopImmediatePropagation();if(await confirmLeave()){close();nav.click();}},true);
window.addEventListener('knox-auth-changed',()=>{load();if(!panel.hidden)home();});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
panel.addEventListener('input',e=>{if(e.target.id==='fcSearch'){renderDecks(e.target.value);return;}if(e.target.id==='fcMakeReq'){makeOpts.request=e.target.value;return;}if(!editing)return;dirty=true;if(e.target.id==='fcTitle')editing.title=e.target.value;else if(e.target.dataset.field){const c=editing.cards[+e.target.dataset.index];c[e.target.dataset.field]=e.target.value;c.due=0;c.interval=0;}});
panel.addEventListener('click',async e=>{
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action,id=b.dataset.id;
 if(identity!==key()){load();home();return;}
 try{
 if(action==='create')editor();
 if(action==='make')makeView();
 if(action==='make-go'){b.disabled=true;await makeDeck();}
 if(action==='make-example'){makeOpts.request=b.dataset.text;const t=panel.querySelector('#fcMakeReq');t.value=b.dataset.text;t.focus();}
 if(action==='make-count'||action==='make-style'){if(action==='make-count')makeOpts.count=+b.dataset.count;else makeOpts.style=b.dataset.style;b.parentElement.querySelectorAll('.fc-chip').forEach(c=>c.classList.toggle('on',c===b));}
 if(action==='upgrade')window.goToPricing?.();
 if(action==='back'){if(!dirty||await knoxConfirm({title:'Discard your changes?',body:'You have edits that aren’t saved yet. If you go back now, they’ll be lost.',ok:'Discard',cancel:'Keep editing',danger:true}))home();}
 if(action==='edit')editor(decks.find(d=>d.id===id));
 if(action==='add'){if(editing.cards.length>=300)throw Error('Maximum 300 cards per deck.');editing.cards.push({front:'',back:''});dirty=true;const i=editing.cards.length-1;renderRows();const row=panel.querySelector('#fcRows').lastElementChild;row.classList.add('fc-row-new');row.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});panel.querySelector(`#fcFront${i}`)?.focus({preventScroll:true});}
 if(action==='remove'){editing.cards.splice(+b.dataset.index,1);if(!editing.cards.length)editing.cards.push({front:'',back:''});dirty=true;renderRows();}
 if(action==='bulk'){const cards=parseLines(panel.querySelector('#fcBulk').value);const existing=editing.cards.filter(c=>c.front.trim()||c.back.trim());validateDeck({title:editing.title||'Draft',cards:[...existing,...cards]});editing.cards=[...existing,...cards];dirty=true;renderEditor();message(`Added ${cards.length} card${cards.length===1?'':'s'}.`,'ok');}
 if(action==='save'){const before=editing.cards.length;editing.cards=editing.cards.filter(c=>c.front.trim()||c.back.trim());if(editing.cards.length&&editing.cards.length!==before)renderEditor();if(!editing.cards.length){editing.cards=[{front:'',back:''}];renderEditor();throw Error('Add at least one card with a question and an answer.');}const valid=validateDeck(editing);const next={...editing,title:valid.title,cards:editing.cards.map((c,i)=>({...valid.cards[i],...c,front:valid.cards[i].front,back:valid.cards[i].back}))};const exists=decks.some(d=>d.id===next.id);if(save(exists?decks.map(d=>d.id===next.id?next:d):[...decks,next])){home();message('Deck saved. Ready when you are!','ok');}}
 if(action==='delete'&&await knoxConfirm({title:'Delete this deck?',body:'This removes the deck and all its study progress. Export it first if you want a backup.',ok:'Delete deck',cancel:'Keep it',danger:true})){if(save(decks.filter(d=>d.id!==id)))home();}
 if(action==='export')exportData(decks.filter(d=>d.id===id));
 if(action==='export-all')exportData(decks);
 if(action==='sample'){const d=validateDeck({title:'Study smarter · Starter deck',cards:[{front:'What is active recall?',back:'Trying to pull an answer out of your memory before checking it.'},{front:'What is spaced repetition?',back:'Reviewing across several sessions, with longer gaps as you remember better.'},{front:'What makes a useful flashcard?',back:'One clear question, one focused answer, and enough context to avoid confusion.'}]});if(save([...decks,{...d,id:crypto.randomUUID()}])){home();message('Sample deck added — try Review due.','ok');}}
 if(action==='due'||action==='practice')start(id,action==='due');
 if(action==='flip'&&session)flip();
 if(['again','good','easy'].includes(action)&&session?.flipped){const s=session,index=s.queue[0];const next=structuredClone(decks);const d=next.find(d=>d.id===s.id);d.cards[index]=schedule(d.cards[index],action);if(!save(next))return;s.queue.shift();if(action==='again'){s.queue.push(index);s.again++;}s.reviewed++;s.flipped=false;study();}
 if(action==='import'){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';const owner=identity;input.onchange=async()=>{try{const f=input.files[0];if(!f)return;if(f.size>2000000)throw Error('Choose a JSON backup smaller than 2 MB.');const raw=JSON.parse(await f.text());if(owner!==key())return;if(raw.version!==1||!Array.isArray(raw.decks)||raw.decks.length>100)throw Error('Choose a Knox flashcard export (up to 100 decks).');const incoming=raw.decks.map(d=>({...validateDeck(d),id:crypto.randomUUID()}));if(save([...decks,...incoming])){home();message('Imported as new decks. Study schedules start fresh.','ok');}}catch(err){message(err.message);}};input.click();}
 }catch(err){message(err.message);}
});
// Space flips, 1/2/3 grade — but never while typing. A focused button
// already turns Space into a click, so leave that to the browser.
document.addEventListener('keydown',e=>{if(e.target?.id==='fcMakeReq'&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();panel.querySelector('[data-action="make-go"]')?.click();return;}if(!panel.hidden&&session&&e.key==='Escape'){e.preventDefault();home();return;}if(panel.hidden||!session||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;if(e.code==='Space'&&e.target.tagName==='BUTTON')return;const action=e.code==='Space'?'flip':({'1':'again','2':'good','3':'easy'}[e.key]);const b=action&&panel.querySelector(`[data-action="${action}"]`);if(b){e.preventDefault();b.click();}});
load();
