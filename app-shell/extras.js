/* App extras (iPhone app and the website's home-screen version): photo crop,
   answer actions, voice, gestures, answer reveal, daily goal, progress and
   badges, celebrations, Auto look and a first-open welcome. Website-only
   visitors never load this file (see app.html / mobile/build.mjs). */
(function(){
if(!window.knoxAppShell)return;
const w=window,$=id=>document.getElementById(id),native=!!w.knoxNativeApp;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch{return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}};
const uid=()=>w.currentUser?.uid||'';
const day=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const note=t=>w.knoxMobile?.note?.(t);

// ── Crop: after snapping or picking a photo, box just the problem you want ──
w.knoxCropPhoto=file=>new Promise(resolve=>{
 const url=URL.createObjectURL(file),img=new Image();
 img.onerror=()=>{URL.revokeObjectURL(url);resolve(file);};
 img.onload=()=>{
  const sheet=document.createElement('div');sheet.className='km-crop';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','Crop your photo');
  sheet.innerHTML='<p class="km-crop-tip">Drag the box around the problem you want help with</p><div class="km-crop-stage"><img alt=""><div class="km-crop-box"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div><div class="km-crop-actions"><button type="button" data-crop="cancel">Cancel</button><button type="button" data-crop="all">Whole photo</button><button type="button" data-crop="ok" class="go">Use this part</button></div>';
  const view=sheet.querySelector('img');view.src=url;document.body.append(sheet);
  const stage=sheet.querySelector('.km-crop-stage'),box=sheet.querySelector('.km-crop-box');
  let r={x:.08,y:.18,w:.84,h:.64};const MIN=.12;
  const draw=()=>{const iw=view.clientWidth,ih=view.clientHeight,ox=view.offsetLeft,oy=view.offsetTop;Object.assign(box.style,{left:ox+r.x*iw+'px',top:oy+r.y*ih+'px',width:r.w*iw+'px',height:r.h*ih+'px'});};
  view.onload=draw;requestAnimationFrame(draw);addEventListener('resize',draw);
  let drag=null;
  box.addEventListener('pointerdown',e=>{e.preventDefault();box.setPointerCapture(e.pointerId);drag={h:e.target.dataset.h||'move',x:e.clientX,y:e.clientY,r:{...r}};});
  box.addEventListener('pointermove',e=>{if(!drag)return;const dx=(e.clientX-drag.x)/view.clientWidth,dy=(e.clientY-drag.y)/view.clientHeight,o=drag.r;let n={...o};
   if(drag.h==='move'){n.x=Math.min(1-o.w,Math.max(0,o.x+dx));n.y=Math.min(1-o.h,Math.max(0,o.y+dy));}
   else{if(drag.h.includes('w')){n.x=Math.min(o.x+o.w-MIN,Math.max(0,o.x+dx));n.w=o.w+(o.x-n.x);}
    if(drag.h.includes('e'))n.w=Math.min(1-o.x,Math.max(MIN,o.w+dx));
    if(drag.h.includes('n')){n.y=Math.min(o.y+o.h-MIN,Math.max(0,o.y+dy));n.h=o.h+(o.y-n.y);}
    if(drag.h.includes('s'))n.h=Math.min(1-o.y,Math.max(MIN,o.h+dy));}
   r=n;draw();});
  box.addEventListener('pointerup',()=>{drag=null;});box.addEventListener('pointercancel',()=>{drag=null;});
  const done=v=>{removeEventListener('resize',draw);sheet.remove();URL.revokeObjectURL(url);resolve(v);};
  sheet.addEventListener('click',e=>{const a=e.target.closest('[data-crop]')?.dataset.crop;if(!a)return;
   if(a==='cancel')return done(null);
   if(a==='all')return done(file);
   const c=document.createElement('canvas'),sx=Math.round(r.x*img.naturalWidth),sy=Math.round(r.y*img.naturalHeight),sw=Math.round(r.w*img.naturalWidth),sh=Math.round(r.h*img.naturalHeight);
   c.width=sw;c.height=sh;c.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
   c.toBlob(b=>done(b?new File([b],file.name.replace(/\.\w+$/,'')+'-crop.jpg',{type:'image/jpeg'}):file),'image/jpeg',.92);
  });
 };
 img.src=url;
});

// ── Answer actions: Explain simpler / Similar problem / Make flashcards ──
w.knoxAnswerAction=async(id,kind)=>{
 const p=w._fbPayloads?.[id];if(!p)return;
 if(w._appAskBusy){note('Let Knox finish this answer first.');return;}
 if(kind==='cards'){
  if(!w.currentUser){w.openAuthModal?.('signup');return;}
  await w.knoxMobile?.navigate?.('flashcards');
  w.flashcardsMake?.(('Make flashcards from this:\n'+(p.question||'')+'\n\n'+(p.answer||'')).slice(0,4000));
  return;
 }
 const input=$('appChatInput');if(!input)return;
 input.value=kind==='simpler'?'Can you explain that more simply, like I’m new to this?':'Give me a similar practice problem to try. Don’t show the answer until I try it.';
 input.dispatchEvent(new Event('input',{bubbles:true}));w.appHandleAsk?.();
};

// ── Voice: talk instead of typing (where the browser supports it) ──
const Speech=w.SpeechRecognition||w.webkitSpeechRecognition;
const tools=document.querySelector('#inputOuter .input-tools'),send=$('appSendBtn');
if(Speech&&tools&&send&&!native){
 const mic=document.createElement('button');mic.type='button';mic.className='input-icon-btn km-mic';mic.setAttribute('aria-label','Ask out loud');mic.title='Ask out loud';
 mic.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>';
 send.before(mic);let rec=null;
 // Like messaging apps: 🎤 while the box is empty, ➤ Send once there's something to send.
 const outer=$('inputOuter'),input0=$('appChatInput'),pill=$('appImagePill');
 const swap=()=>{const has=!!input0?.value.trim()||(pill&&getComputedStyle(pill).display!=='none')||!!w._appImage||!!w._appDoc;outer?.classList.toggle('km-has-text',has||!!rec);};
 input0?.addEventListener('input',swap);if(pill)new MutationObserver(swap).observe(pill,{attributes:true,attributeFilter:['style','class']});swap();
 w.knoxSwapSend=swap;
 mic.onclick=()=>{
  if(rec){rec.stop();return;}
  const input=$('appChatInput'),start=input.value?input.value.replace(/\s*$/,' '):'';
  rec=new Speech();rec.lang=navigator.language||'en-US';rec.interimResults=true;rec.continuous=false;
  rec.onresult=e=>{let t='';for(const r of e.results)t+=r[0].transcript;input.value=start+t;input.dispatchEvent(new Event('input',{bubbles:true}));};
  rec.onend=()=>{rec=null;mic.classList.remove('on');swap();};rec.onerror=e=>{if(e.error==='not-allowed')note('Allow the microphone for Knox in Settings to ask out loud.');};
  mic.classList.add('on');try{rec.start();}catch{rec=null;mic.classList.remove('on');}
 };
}

// ── Gestures: swipe in from the left edge for History; swipe it away to close ──
let sx=0,sy=0,edge=false,inDrawer=false;
document.addEventListener('touchstart',e=>{const t=e.touches[0];sx=t.clientX;sy=t.clientY;edge=sx<24;inDrawer=!!e.target.closest('#mobileHistoryDrawer.open');},{passive:true});
document.addEventListener('touchend',e=>{const t=e.changedTouches[0],dx=t.clientX-sx,dy=Math.abs(t.clientY-sy);if(dy>50)return;
 if(edge&&dx>70&&!document.body.classList.contains('knox-mobile-home')&&!document.body.classList.contains('knox-mobile-account')&&!document.body.classList.contains('knox-flashcards'))w.openMobileHistory?.();
 else if(inDrawer&&dx<-70)w.closeMobileHistory?.();},{passive:true});

// ── New answers appear piece by piece instead of all at once ──
const thread=$('chatThread');
if(thread)new MutationObserver(list=>{for(const m of list){const row=m.target;if(!(row instanceof Element)||!row.id||!row.classList.contains('msg-wrap'))continue;
 const b=row.querySelector('.msg-knox-bubble');if(!b||b.querySelector('.thinking-row')||b.classList.contains('km-reveal'))continue;
 [...b.children].forEach((c,i)=>c.style.setProperty('--i',Math.min(i,12)));b.classList.add('km-reveal');}}).observe(thread,{childList:true,subtree:true});

// ── Daily goal, lifetime stats and celebrations ──
const GOAL=3;
const goalKey=()=>'knoxGoal.'+uid()+'.'+day(),statsKey=()=>'knoxStats.'+uid();
const stats=()=>({questions:0,cards:0,lessons:0,goalDays:0,bestStreak:0,...store.get(statsKey(),{})});
function bump(field){
 if(!uid())return;const s=stats();s[field]=(s[field]||0)+1;
 const before=store.get(goalKey(),0),after=before+1;store.set(goalKey(),after);
 if(before<GOAL&&after>=GOAL){s.goalDays=(s.goalDays||0)+1;celebrate('Daily goal done! 🎯');}
 store.set(statsKey(),s);dispatchEvent(new Event('knox-goal-changed'));
}
function confetti(){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const c=document.createElement('canvas');c.className='km-confetti';c.width=innerWidth;c.height=innerHeight;document.body.append(c);
 const g=c.getContext('2d'),colors=['#FF6B00','#58CC02','#1CB0F6','#CE82FF','#F2B705'],bits=Array.from({length:90},()=>({x:innerWidth/2,y:innerHeight*.35,vx:(Math.random()-.5)*12,vy:Math.random()*-12-4,s:4+Math.random()*5,c:colors[Math.random()*5|0],r:Math.random()*6}));
 let t=0;(function f(){g.clearRect(0,0,c.width,c.height);for(const b of bits){b.vy+=.35;b.x+=b.vx;b.y+=b.vy;b.r+=.2;g.save();g.translate(b.x,b.y);g.rotate(b.r);g.fillStyle=b.c;g.fillRect(-b.s/2,-b.s/2,b.s,b.s*.6);g.restore();}if(++t<90)requestAnimationFrame(f);else c.remove();})();
}
function celebrate(text){confetti();if(text)note(text);}
w.knoxCelebrate=celebrate;
// A successful answer advances the streak (app.html): count it.
document.addEventListener('DOMContentLoaded',()=>{
 const update=w.updateStreak;
 if(typeof update==='function')w.updateStreak=function(...a){const r=update.apply(this,a);
  bump('questions');
  setTimeout(()=>{const last=[...document.querySelectorAll('#chatThread .msg-knox-bubble')].pop();if(last&&/Lesson complete/.test(last.textContent)&&!last.dataset.kmCounted){last.dataset.kmCounted='1';const s=stats();s.lessons=(s.lessons||0)+1;store.set(statsKey(),s);celebrate('Lesson complete! 🎓');dispatchEvent(new Event('knox-goal-changed'));}},400);
  return r;};
});
document.addEventListener('click',e=>{if(e.target.closest('.fc-grade'))bump('cards');},true);
// Finishing a flashcard session gets confetti.
const fc=$('flashcardsPanel');
if(fc)new MutationObserver(()=>{const d=fc.querySelector('.fc-done');if(d&&!d.dataset.kmParty){d.dataset.kmParty='1';confetti();}}).observe(fc,{childList:true,subtree:true});

// ── Home: today's goal ring ──
function goalRing(){
 const home=$('knoxMobileHome')?.querySelector('.km-page-wrap');if(!home)return;
 let el=$('kmGoal');if(!el){el=document.createElement('section');el.id='kmGoal';el.className='km-goal';home.querySelector('.km-askbar')?.after(el);}
 if(!uid()){el.hidden=true;return;}el.hidden=false;
 const n=Math.min(GOAL,store.get(goalKey(),0)),pct=n/GOAL,C=2*Math.PI*22;
 const html=`<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" class="t"/><circle cx="26" cy="26" r="22" class="f" style="stroke-dasharray:${C};stroke-dashoffset:${C*(1-pct)}"/></svg><span><b>${n>=GOAL?'Daily goal done! 🎯':'Today’s goal: '+n+' of '+GOAL}</b><small>${n>=GOAL?'Nice work. Come back tomorrow to keep it going.':'Ask a question, finish a lesson step or review a card.'}</small></span>`;
 if(el.innerHTML!==html)el.innerHTML=html;
}

// ── You: progress and badges ──
function progress(){
 const acct=$('knoxMobileAccount')?.querySelector('.km-page-wrap');if(!acct)return;
 let el=$('kmProgress');if(!el){el=document.createElement('section');el.id='kmProgress';el.className='km-account-section';const ref=acct.querySelector('.km-account-section:nth-of-type(2)');if(ref)ref.after(el);else acct.append(el);}
 if(!uid()){el.hidden=true;return;}el.hidden=false;
 const s=stats(),streak=Number($('streakCount')?.textContent)||0;if(streak>(s.bestStreak||0)){s.bestStreak=streak;store.set(statsKey(),s);}
 const deck=w.knoxFlashcardsMobile?.summary?.()||{decks:[]},decks=deck.decks?.length||0;
 const tiles=[['🔥',streak,'day streak'],['💬',s.questions||0,'questions'],['🎓',s.lessons||0,'lessons done'],['🃏',s.cards||0,'cards reviewed']];
 const badges=[['🎓','First lesson',s.lessons>=1],['🔥','3-day streak',s.bestStreak>=3],['🔥','7-day streak',s.bestStreak>=7],['💬','10 questions',s.questions>=10],['🃏','First deck',decks>=1],['🧠','50 cards',s.cards>=50],['🎯','Daily goal',s.goalDays>=1],['🏆','5 lessons',s.lessons>=5]];
 const html=`<div class="km-section-heading"><h2>Your progress</h2></div><div class="km-stats">${tiles.map(([i,n,l])=>`<div class="km-stat"><span>${i}</span><b>${n}</b><small>${l}</small></div>`).join('')}</div>
  <div class="km-section-heading"><h2>Badges</h2><small class="km-badge-count">${badges.filter(b=>b[2]).length} of ${badges.length}</small></div>
  <div class="km-badges">${badges.map(([i,l,on])=>`<div class="km-badge${on?' on':''}" title="${esc(l)}"><span>${i}</span><small>${esc(l)}</small></div>`).join('')}</div>
  <p class="km-footer-note" style="margin-top:10px">Counted on this device.</p>`;
 if(el.innerHTML!==html)el.innerHTML=html;
}
const refresh=()=>{goalRing();progress();if(!$('knoxMobileAccount')?.hidden)setTimeout(autoButton,60);};
addEventListener('knox-goal-changed',refresh);addEventListener('knox-auth-changed',()=>setTimeout(refresh,300));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['class']});

// ── Auto look: follow the iPhone's Light/Dark setting ──
const dark=matchMedia('(prefers-color-scheme: dark)');
const autoOn=()=>store.get('knoxAutoTheme',false);
function applyAuto(){if(autoOn())w.knoxSetTheme?.(dark.matches?'dark':'light');}
dark.addEventListener?.('change',applyAuto);
function autoButton(){
 const looks=document.querySelector('#knoxMobileAccount .km-looks');if(!looks)return;
 let b=looks.querySelector('[data-auto]');
 if(!b){b=document.createElement('button');b.type='button';b.className='km-press';b.dataset.auto='1';b.innerHTML='<span aria-hidden="true">📱</span><b>Auto</b><small data-auto-label></small>';looks.prepend(b);
  looks.addEventListener('click',e=>{if(e.target.closest('[data-auto]')){store.set('knoxAutoTheme',true);applyAuto();}else if(e.target.closest('[data-look]'))store.set('knoxAutoTheme',false);setTimeout(autoButton,30);},true);}
 const on=autoOn();b.setAttribute('aria-pressed',String(on));b.querySelector('[data-auto-label]').textContent=on?'Selected':'';
 if(on)looks.querySelectorAll('[data-look]').forEach(x=>{x.setAttribute('aria-pressed','false');const l=x.querySelector('[data-selected-label]');if(l)l.textContent='';});
}
applyAuto();
new MutationObserver(()=>{if(!$('knoxMobileAccount')?.hidden)autoButton();}).observe(document.body,{attributes:true,attributeFilter:['class']});
// A look change redraws You's buttons; mark Auto again right after.
new MutationObserver(()=>setTimeout(autoButton,60)).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});

// ── First open: a quick welcome before signing in ──
function welcome(){
 if(store.get('knoxAppWelcomed',false)||w.currentUser)return;
 if(document.body.classList.contains('app-auth-pending')){setTimeout(welcome,400);return;}
 store.set('knoxAppWelcomed',true);
 const slides=[['📸','Snap it','Take a photo of any homework question. Knox reads it and walks you through it.'],['🎓','Learn it','Learn mode teaches step by step and checks your answers, so it actually sticks.'],['🃏','Remember it','Turn anything into flashcards. Knox brings them back right when it’s time to review.']];
 const o=document.createElement('div');o.className='km-welcome';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-label','Welcome to Knox Knows');
 o.innerHTML=`<img class="km-welcome-logo" src="/knox-logo-square.jpg" alt=""><div class="km-welcome-track">${slides.map(([i,t,d])=>`<section><span>${i}</span><h2>${t}</h2><p>${d}</p></section>`).join('')}</div><div class="km-welcome-dots">${slides.map((_,i)=>`<i${i?'':' class="on"'}></i>`).join('')}</div><button type="button" class="go" data-w="next">Next</button><button type="button" data-w="skip">I already have an account</button>`;
 document.body.append(o);
 const track=o.querySelector('.km-welcome-track'),dots=[...o.querySelectorAll('.km-welcome-dots i')],next=o.querySelector('[data-w="next"]');
 const at=()=>Math.round(track.scrollLeft/track.clientWidth);
 let page=0;const show=i=>{page=i;dots.forEach((d,k)=>d.classList.toggle('on',k===i));next.textContent=i===slides.length-1?'Get started free':'Next';};
 track.addEventListener('scroll',()=>show(at()),{passive:true});
 o.addEventListener('click',e=>{const a=e.target.closest('[data-w]')?.dataset.w;if(!a)return;
  if(a==='next'&&page<slides.length-1){show(page+1);track.scrollLeft=page*track.clientWidth;return;}
  o.remove();w.openAuthModal?.(a==='skip'?'login':'signup');});
}
setTimeout(welcome,600);
})();
