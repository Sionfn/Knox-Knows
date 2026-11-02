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
const note=t=>w.knoxMobile?.note?.(t);
const model=w.knoxStudyModel;if(!model)return;
let progressStorage;try{progressStorage=localStorage;}catch{progressStorage={getItem:()=>null,setItem(){throw Error();}};}
const activity=model.createProgress(progressStorage);

// ── Crop: after snapping or picking a photo, box just the problem you want ──
let cancelCrop=null;
w.knoxCropPhoto=file=>new Promise(resolve=>{
 cancelCrop?.();const owner=uid(),viewVersion=w._appViewVersion,previous=document.activeElement;
 let settled=false,sheet=null,resize=null;const url=URL.createObjectURL(file),img=new Image();
 const alive=()=>!settled&&uid()===owner&&w._appViewVersion===viewVersion;
 const done=value=>{if(settled)return;settled=true;resize?.disconnect();sheet?.remove();URL.revokeObjectURL(url);if(cancelCrop===cancel)cancelCrop=null;removeEventListener('knox-auth-changed',cancel);removeEventListener('keydown',key,true);if(previous?.isConnected&&uid()===owner&&w._appViewVersion===viewVersion)previous.focus?.({preventScroll:true});resolve(value);};
 const cancel=()=>done(null);
 const key=e=>{if(!sheet)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();}else if(e.key==='Tab'){const all=[...sheet.querySelectorAll('button,input,summary')].filter(el=>el.getClientRects().length);if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0]?.focus();}}};
 cancelCrop=cancel;addEventListener('knox-auth-changed',cancel);addEventListener('keydown',key,true);
 img.onerror=()=>done(alive()?file:null);
 img.onload=()=>{
  if(!alive())return cancel();
  sheet=document.createElement('div');sheet.className='km-crop';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','Crop your photo');
  sheet.innerHTML='<p class="km-crop-tip">Choose the problem you want help with. Drag the box or use Adjust crop.</p><div class="km-crop-stage"><img alt="Your selected notes"><div class="km-crop-box" aria-hidden="true"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div><details class="km-crop-adjust"><summary>Adjust crop</summary><div class="km-crop-ranges">'+[['x','Left'],['y','Top'],['w','Width'],['h','Height']].map(([id,name])=>'<label>'+name+'<input type="range" min="0" max="100" step="1" data-range="'+id+'" aria-label="Crop '+name.toLowerCase()+'"></label>').join('')+'</div></details><div class="km-crop-actions"><button type="button" data-crop="cancel">Cancel</button><button type="button" data-crop="all">Whole photo</button><button type="button" data-crop="ok" class="go">Use this part</button></div>';
  const view=sheet.querySelector('img');view.src=url;document.body.append(sheet);
  const box=sheet.querySelector('.km-crop-box');let r=model.cropBounds({x:.08,y:.18,w:.84,h:.64}),drag=null;
  const draw=()=>{if(!alive())return cancel();const iw=view.clientWidth,ih=view.clientHeight;Object.assign(box.style,{left:view.offsetLeft+r.x*iw+'px',top:view.offsetTop+r.y*ih+'px',width:r.w*iw+'px',height:r.h*ih+'px'});for(const input of sheet.querySelectorAll('[data-range]')){const k=input.dataset.range;input.min=k==='w'||k==='h'?'12':'0';input.max=String(Math.round(100*(k==='x'?1-r.w:k==='y'?1-r.h:k==='w'?1-r.x:1-r.y)));input.value=String(Math.round(r[k]*100));input.setAttribute('aria-valuetext',input.value+' percent');}};
  view.onload=draw;requestAnimationFrame(draw);resize=new ResizeObserver(draw);resize.observe(sheet.querySelector('.km-crop-stage'));
  sheet.addEventListener('input',e=>{const k=e.target.dataset.range;if(!k)return;r=model.cropBounds({...r,[k]:Number(e.target.value)/100});draw();});
  box.addEventListener('pointerdown',e=>{e.preventDefault();box.setPointerCapture(e.pointerId);drag={h:e.target.dataset.h||'move',x:e.clientX,y:e.clientY,r:{...r}};});
  box.addEventListener('pointermove',e=>{if(!drag||!view.clientWidth||!view.clientHeight)return;const dx=(e.clientX-drag.x)/view.clientWidth,dy=(e.clientY-drag.y)/view.clientHeight,o=drag.r;let n={...o};
   if(drag.h==='move'){n.x=Math.min(1-o.w,Math.max(0,o.x+dx));n.y=Math.min(1-o.h,Math.max(0,o.y+dy));}
   else{if(drag.h.includes('w')){n.x=Math.min(o.x+o.w-.12,Math.max(0,o.x+dx));n.w=o.w+o.x-n.x;}if(drag.h.includes('e'))n.w=Math.min(1-o.x,Math.max(.12,o.w+dx));if(drag.h.includes('n')){n.y=Math.min(o.y+o.h-.12,Math.max(0,o.y+dy));n.h=o.h+o.y-n.y;}if(drag.h.includes('s'))n.h=Math.min(1-o.y,Math.max(.12,o.h+dy));}
   r=model.cropBounds(n);draw();});
  box.addEventListener('pointerup',()=>{drag=null;});box.addEventListener('pointercancel',()=>{drag=null;});
  sheet.addEventListener('click',e=>{const a=e.target.closest('[data-crop]')?.dataset.crop;if(!a)return;
   if(!alive())return cancel();if(a==='cancel')return cancel();if(a==='all')return done(file);
   sheet.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const c=document.createElement('canvas'),sx=Math.round(r.x*img.naturalWidth),sy=Math.round(r.y*img.naturalHeight),sw=Math.max(1,Math.round(r.w*img.naturalWidth)),sh=Math.max(1,Math.round(r.h*img.naturalHeight));const scale=Math.min(1,2200/Math.max(sw,sh));c.width=Math.max(1,Math.round(sw*scale));c.height=Math.max(1,Math.round(sh*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);c.toBlob(blob=>{if(!alive())return cancel();if(!blob){note('Could not crop this picture. Try Whole photo or another image.');sheet.querySelectorAll('button').forEach(b=>b.disabled=false);return;}done(new File([blob],file.name.replace(/\.\w+$/,'')+'-crop.jpg',{type:'image/jpeg'}));},'image/jpeg',.92);}catch{note('Could not crop this picture. Use the whole photo or try another one.');sheet.querySelectorAll('button').forEach(b=>b.disabled=false);}
  });
  sheet.querySelector('[data-crop="all"]').focus({preventScroll:true});
 };
 img.src=url;
});

// ── Answer actions: Explain simpler / Similar problem / Make flashcards ──
let actionBusy=false;
w.knoxAnswerAction=async(id,kind)=>{
 const p=w._fbPayloads?.[id],owner=uid(),prompt=model.followup(p,kind);if(!p||!prompt||actionBusy)return;
 if(w._appAskBusy){note('Let Knox finish this answer first.');return;}
 actionBusy=true;
 try{
  if(kind==='cards'){if(!owner){w.openAuthModal?.('signup');return;}await w.flashcardsMake?.(prompt.slice(0,4000));return;}
  const target=p.mode==='learn'?'learn':'chat';
  if(!(await w.knoxMobile?.navigate?.(target))||uid()!==owner)return;
  const input=$('appChatInput');if(!input)return;
  if(input.value.trim()){
   const d=document.createElement('dialog');d.className='knox-native-dialog';d.setAttribute('aria-label','Keep your current draft');
   const h=document.createElement('h2');h.textContent='You already have a draft.';const copy=document.createElement('p');copy.textContent='Keep it as it is, or add this follow-up below it. Nothing is sent until you tap Send.';d.append(h,copy);
   for(const [label,append] of [['Keep draft',false],['Add follow-up',true]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{if(append&&uid()===owner){input.value=input.value+'\n\n'+prompt;input.dispatchEvent(new Event('input',{bubbles:true}));}d.close();};d.append(button);}
   d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal();
  }else{input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();note('Follow-up ready. Review it, then tap Send.');}
 }finally{actionBusy=false;}
};

// ── Voice: talk instead of typing (where the browser supports it) ──
const Speech=w.SpeechRecognition||w.webkitSpeechRecognition;
const tools=document.querySelector('#inputOuter .input-tools'),send=$('appSendBtn');
if(Speech&&tools&&send&&!native){
 const mic=document.createElement('button');mic.type='button';mic.className='input-icon-btn km-mic';mic.setAttribute('aria-label','Dictate a question');mic.title='Dictate a question';
 mic.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>';
 send.before(mic);let rec=null,voiceWriting=false;
 const stopVoice=()=>{const old=rec;rec=null;try{old?.abort?.();}catch{}mic.classList.remove('on');swap();};
 addEventListener('knox-auth-changed',stopVoice);
 inputWatch();function inputWatch(){ $('appChatInput')?.addEventListener('input',()=>{if(rec&&!voiceWriting)stopVoice();}); }
 new MutationObserver(()=>{if(rec&&(!rec.knoxAlive()||document.body.classList.contains('knox-mobile-home')||document.body.classList.contains('knox-mobile-account')||document.body.classList.contains('knox-flashcards')))stopVoice();}).observe(document.body,{attributes:true,attributeFilter:['class']});
 // Like messaging apps: 🎤 while the box is empty, ➤ Send once there's something to send.
 const outer=$('inputOuter'),input0=$('appChatInput'),pill=$('appImagePill');
 const swap=()=>{const has=!!input0?.value.trim()||(pill&&getComputedStyle(pill).display!=='none')||!!w._appImage||!!w._appDoc;outer?.classList.toggle('km-has-text',has||!!rec);};
 input0?.addEventListener('input',swap);if(pill)new MutationObserver(swap).observe(pill,{attributes:true,attributeFilter:['style','class']});swap();
 w.knoxSwapSend=swap;
 mic.onclick=()=>{
  if(rec){stopVoice();return;}if(w._appAskBusy){note('Let Knox finish this answer first.');return;}
  const input=$('appChatInput'),start=input.value?input.value.replace(/\s*$/,' '):'',owner=uid(),viewVersion=w._appViewVersion,instance=new Speech();
  rec=instance;instance.knoxAlive=()=>rec===instance&&uid()===owner&&w._appViewVersion===viewVersion;
  instance.lang=navigator.language||'en-US';instance.interimResults=true;instance.continuous=false;
  instance.onresult=e=>{if(!instance.knoxAlive())return;let t='';for(const row of e.results)t+=row[0].transcript;voiceWriting=true;try{input.value=start+t;input.dispatchEvent(new Event('input',{bubbles:true}));}finally{voiceWriting=false;}};
  instance.onend=()=>{if(rec===instance){rec=null;mic.classList.remove('on');swap();}};
  instance.onerror=e=>{if(!instance.knoxAlive())return;if(e.error==='not-allowed')note('Allow dictation in your browser settings, or type your question.');else if(e.error!=='aborted')note('Dictation stopped. You can keep typing.');stopVoice();};
  mic.classList.add('on');swap();try{instance.start();}catch{stopVoice();note('Dictation is not available. You can still type your question.');}
 };
}

// ── Keyboard (home-screen version): like Gauth. While the keyboard is open the
// app is pinned to exactly the visible area (iOS's visual viewport: its top
// offset and height), updated every frame as the keyboard slides, so the typing
// box rides right on top of the keyboard. The page color fills behind it.
// (The App Store app resizes natively.)
if(!native&&w.visualViewport){
 const vv=w.visualViewport,root=document.documentElement;let base=innerHeight,frame=0;
 const typing=()=>document.activeElement?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]),textarea,[contenteditable="true"]');
 const apply=()=>{
  frame=0;base=Math.max(base,innerHeight);
  const open=typing()&&base-vv.height>120;
  root.style.setProperty('--vvh',vv.height+'px');root.style.setProperty('--vvt',vv.offsetTop+'px');
  if(open){
   if(!root.classList.contains('km-kb')){root.classList.add('native-keyboard','km-kb');const t=$('chatThread');if(t&&t._kmStick)requestAnimationFrame(()=>{t.scrollTop=t.scrollHeight;});}
  }else if(root.classList.contains('km-kb')&&!typing()||base-vv.height<=120){root.classList.remove('km-kb');root.style.setProperty('--vvt','0px');}
 };
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(apply);};
 vv.addEventListener('resize',schedule);vv.addEventListener('scroll',schedule);
 addEventListener('orientationchange',()=>setTimeout(()=>{base=innerHeight;schedule();},400));
 // If you were reading the latest message, keep it in view while the keyboard opens.
 $('appChatInput')?.addEventListener('focus',()=>{const t=$('chatThread');if(t)t._kmStick=t.scrollHeight-t.scrollTop-t.clientHeight<80;schedule();});
 document.addEventListener('focusout',()=>setTimeout(schedule,60));
}

// ── Gestures: swipe in from the left edge for History; swipe it away to close ──
let sx=0,sy=0,edge=false,inDrawer=false;
document.addEventListener('touchstart',e=>{if(e.touches.length!==1||e.target.closest('dialog,[role="dialog"],input,textarea,.km-crop')){edge=inDrawer=false;return;}const t=e.touches[0];sx=t.clientX;sy=t.clientY;edge=sx<24;inDrawer=!!e.target.closest('#mobileHistoryDrawer.open');},{passive:true});
document.addEventListener('touchend',e=>{const t=e.changedTouches[0],dx=t.clientX-sx,dy=Math.abs(t.clientY-sy);if(dy>50)return;
 if(edge&&dx>70&&!document.body.classList.contains('knox-mobile-home')&&!document.body.classList.contains('knox-mobile-account')&&!document.body.classList.contains('knox-flashcards'))w.openMobileHistory?.();
 else if(inDrawer&&dx<-70)w.closeMobileHistory?.();},{passive:true});

// ── New answers appear piece by piece instead of all at once ──
const thread=$('chatThread');
if(thread)new MutationObserver(list=>{
 if(!w._appAskBusy)return; // Restored history should appear immediately.
 for(const mutation of list)for(const node of mutation.addedNodes){if(!(node instanceof Element))continue;const bubbles=node.matches('.msg-knox-bubble')?[node]:[...node.querySelectorAll('.msg-knox-bubble')];for(const bubble of bubbles){if(bubble.querySelector('.thinking-row')||bubble.classList.contains('km-reveal'))continue;[...bubble.children].forEach((child,i)=>child.style.setProperty('--i',Math.min(i,12)));bubble.classList.add('km-reveal');}}
}).observe(thread,{childList:true,subtree:true});

// ── Daily goal, lifetime stats and celebrations ──
const GOAL=3;
const stats=()=>activity.read(uid());
function confetti(){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const c=document.createElement('canvas');c.className='km-confetti';c.setAttribute('aria-hidden','true');c.width=innerWidth;c.height=innerHeight;document.body.append(c);
 const g=c.getContext('2d'),colors=['#FF6B00','#58CC02','#1CB0F6','#CE82FF','#F2B705'],bits=Array.from({length:90},()=>({x:innerWidth/2,y:innerHeight*.35,vx:(Math.random()-.5)*12,vy:Math.random()*-12-4,s:4+Math.random()*5,c:colors[Math.random()*5|0],r:Math.random()*6}));
 let t=0;(function f(){g.clearRect(0,0,c.width,c.height);for(const b of bits){b.vy+=.35;b.x+=b.vx;b.y+=b.vy;b.r+=.2;g.save();g.translate(b.x,b.y);g.rotate(b.r);g.fillStyle=b.c;g.fillRect(-b.s/2,-b.s/2,b.s,b.s*.6);g.restore();}if(++t<90)requestAnimationFrame(f);else c.remove();})();
}
function celebrate(text){confetti();if(text)note(text);}
w.knoxCelebrate=celebrate;
addEventListener('knox-study-completed',e=>{
 const result=activity.record(e.detail,uid());if(!result.recorded)return;
 if(result.goal)celebrate('Daily goal done! 🎯');else if(result.lesson)celebrate('Lesson complete! 🎓');
 dispatchEvent(new Event('knox-goal-changed'));
});
// Finishing a flashcard session gets confetti.
const fc=$('flashcardsPanel');
if(fc)new MutationObserver(()=>{const d=fc.querySelector('.fc-done');if(d&&!d.dataset.kmParty){d.dataset.kmParty='1';confetti();}}).observe(fc,{childList:true,subtree:true});

// ── Home: today's goal ring ──
function goalRing(){
 const home=$('knoxMobileHome')?.querySelector('.km-page-wrap');if(!home)return;
 let el=$('kmGoal');if(!el){el=document.createElement('section');el.id='kmGoal';el.className='km-goal';home.querySelector('.km-askbar')?.after(el);}
 if(!uid()){el.hidden=true;return;}el.hidden=false;
 const n=Math.min(GOAL,activity.today(uid())),pct=n/GOAL,C=2*Math.PI*22;
 const html=`<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" class="t"/><circle cx="26" cy="26" r="22" class="f" style="stroke-dasharray:${C};stroke-dashoffset:${C*(1-pct)}"/></svg><span><b>${n>=GOAL?'Daily goal done! 🎯':'Today’s goal: '+n+' of '+GOAL}</b><small>${n>=GOAL?'Nice work. Come back tomorrow to keep it going.':'Ask a question, finish a lesson step or review a card.'}</small></span>`;
 if(el.innerHTML!==html)el.innerHTML=html;
}

// ── You: progress and badges ──
function progress(){
 const acct=$('knoxMobileAccount')?.querySelector('.km-page-wrap');if(!acct)return;
 let el=$('kmProgress');if(!el){el=document.createElement('section');el.id='kmProgress';el.className='km-account-section';const ref=acct.querySelector('.km-account-section:nth-of-type(2)');if(ref)ref.after(el);else acct.append(el);}
 if(!uid()){el.hidden=true;return;}el.hidden=false;
 const s=stats(),streak=Number($('streakCount')?.textContent)||0;s.bestStreak=Math.max(streak,s.bestStreak);
 const deck=w.knoxFlashcardsMobile?.summary?.()||{decks:[]},decks=deck.decks?.length||0;
 const tiles=[['🔥',streak,'day streak'],['💬',s.questions||0,'study replies'],['🎓',s.lessons||0,'lessons done'],['🃏',s.cards||0,'cards reviewed']];
 const badges=[['🎓','First lesson',s.lessons>=1],['🔥','3-day streak',s.bestStreak>=3],['🔥','7-day streak',s.bestStreak>=7],['💬','10 study replies',s.questions>=10],['🃏','First deck',decks>=1],['🧠','50 cards',s.cards>=50],['🎯','Daily goal',s.goalDays>=1],['🏆','5 lessons',s.lessons>=5]];
 const html=`<div class="km-section-heading"><h2>Your progress</h2></div><div class="km-stats">${tiles.map(([i,n,l])=>`<div class="km-stat"><span>${i}</span><b>${n}</b><small>${l}</small></div>`).join('')}</div>
  <div class="km-section-heading"><h2>Badges</h2><small class="km-badge-count">${badges.filter(b=>b[2]).length} of ${badges.length}</small></div>
  <div class="km-badges">${badges.map(([i,l,on])=>`<div class="km-badge${on?' on':''}" aria-label="${esc(l)}: ${on?'unlocked':'not yet unlocked'}" title="${esc(l)}"><span>${i}</span><small>${esc(l)}</small></div>`).join('')}</div>
  <p class="km-footer-note" style="margin-top:10px">Successful study activity on this device. Counts are not a mastery score.</p>`;
 if(el.innerHTML!==html)el.innerHTML=html;
}
const refresh=()=>{goalRing();progress();if(!$('knoxMobileAccount')?.hidden)setTimeout(autoButton,60);};
addEventListener('knox-goal-changed',refresh);addEventListener('knox-auth-changed',refresh);
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
  o.remove();w.openAuthModal?.(a==='skip'?'signin':'signup');});
}
setTimeout(welcome,600);
})();
