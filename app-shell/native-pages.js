/* Local mobile Home and You pages (Knox 2 look). Account activity comes from the
   shared signed-in history/deck stores; never invent progress, credits or streaks. */
window.createKnoxMobilePages=function({navigate,note,dialog,button,icon}){
 const $=id=>document.getElementById(id),w=window;
 const model=import((w.knoxShellBase||'/assets/')+'home-model.js');
 let reading='standard';try{if(localStorage.getItem('knoxMobileReading')==='large')reading='large';}catch{}
 document.documentElement.classList.toggle('knox-reading-large',reading==='large');
 const home=document.createElement('section'),account=document.createElement('section');
 home.id='knoxMobileHome';account.id='knoxMobileAccount';home.className=account.className='knox-mobile-page km2';home.hidden=account.hidden=true;
 home.setAttribute('aria-label','Home');account.setAttribute('aria-label','You');
 $('mainColumn').append(home,account);
 const svg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon[name]||extra[name]||icon.chat}</svg>`;
 const extra={camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>',
  keyboard:'<rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  quiz:'<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  coin:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5H14.5"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',left:'<path d="M19 12H5M11 18l-6-6 6-6"/>',arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',
  spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'};
 const tile=(name,color)=>`<span class="km-tile sm" data-color="${color}" aria-hidden="true">${svg(name)}</span>`;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const TIER={free:'🪙',plus:'⚡',mega:'💎'};
 // Ideas to tap: they fill the typing box (never send on their own).
 const STARTS=[
  ['🧮','orange','chat','Solve 3x + 7 = 22 step by step','Solve 3x + 7 = 22 and show me each step.'],
  ['🌱','green','chat','Explain photosynthesis simply','Explain photosynthesis like I’m 12, with an easy example.'],
  ['✍️','purple','learn','Help me write a strong thesis','Help me write a strong thesis for my essay. My topic is: '],
  ['🌎','blue','learn','Quiz me on World War I','Quiz me on the causes of World War I, one question at a time.'],
  ['🗣️','orange','learn','Teach me Spanish greetings','Teach me common Spanish greetings and quiz me on them.'],
  ['⚛️','blue','chat','What’s the difference between an atom and a molecule?','What’s the difference between an atom and a molecule?'],
 ];
 // ‹ › buttons for the sideways rows, so it's clear there's more to the right.
 const scrollCtl=(id,what)=>`<span class="km-scroll-ctl" data-row="${id}"><button type="button" class="km-press" data-scroll="-1" aria-label="Previous ${what}" disabled>${svg('left')}</button><button type="button" class="km-press" data-scroll="1" aria-label="More ${what}">${svg('arrow')}</button></span>`;
 const TOOLS=[
  ['learn','learn','Learn','Step-by-step lessons','go'],
  ['flashcards','flashcards','Flashcards','Turn anything into cards','go'],
  ['quiz','quiz','Quiz me','Practice until it sticks','quiz'],
  ['calculator','calculator','Calculator','Basic & scientific','go'],
 ];
 home.innerHTML=`<div class="km-page-wrap">
  <header class="km-topbar"><button type="button" class="km-top-avatar km-press" data-go="account" aria-label="You: account, plan and settings" data-avatar>K</button>
   <span class="km-top-right"><button type="button" class="km-flame-pill km-press" data-action="streak" aria-label="Your streak"><span class="knox-flame" aria-hidden="true">🔥</span><b data-streak-count>0</b></button><button type="button" class="km-plan-pill km-press" data-action="plans" id="kmPlanPill">🪙 Free</button></span></header>
  <section class="km-hero km-rise" aria-labelledby="kmHeroTitle">
   <div class="km-hero-glow" aria-hidden="true"></div>
   <div class="km-hero-top"><div class="km-hero-copy"><p class="km-hero-hi" id="kmGreeting">Hey there 👋</p><h1 id="kmHeroTitle">What are we<br>solving today?</h1></div><img class="km-hero-fox" src="/knox-logo-square.jpg" alt=""></div>
   <button type="button" class="km-hero-snap km-press" data-action="photo"><span class="km-hero-snap-icon">${svg('camera')}</span><span><b>Snap a question</b><small>Knox reads it and walks you through it</small></span><span class="km-hero-snap-go" aria-hidden="true">${svg('arrow')}</span></button>
   <div class="km-hero-row"><button type="button" class="km-hero-alt km-press" data-action="type">${svg('keyboard')}<span>Type it</span></button><button type="button" class="km-hero-alt km-press" data-action="file">${svg('file')}<span>Upload a file</span></button></div>
  </section>
  <div id="kmDrafts"></div>
  <button type="button" class="km-join km-press km-rise" data-action="signup" hidden><span class="km-join-gem" aria-hidden="true">🦊</span><span><b>Sign up free</b><small>Save your chats, build a streak and keep your decks.</small></span><span class="km-join-go" aria-hidden="true">${svg('arrow')}</span></button>
  <section class="km-today km-rise" aria-label="Today"><button type="button" class="km-streak-card km-press" data-action="streak"><span class="km-streak-flame" aria-hidden="true"><span class="knox-flame">🔥</span></span><span><b id="kmStreakCount">Your streak</b><small id="kmStreakNote">Study today to light it.</small></span></button><section id="kmGoal" class="km-goal" hidden></section></section>
  <div id="kmResume"></div>
  <section class="km-rise" aria-labelledby="kmStartsTitle"><div class="km-section-heading"><h2 id="kmStartsTitle">Try asking Knox</h2>${scrollCtl('kmStarts','ideas')}</div>
   <div class="km-starts" id="kmStarts" role="group" aria-labelledby="kmStartsTitle">${STARTS.map(([e,c,t,label,q],i)=>`<button type="button" class="km-start km-press" data-color="${c}" data-start="${i}"><span class="km-start-emoji" aria-hidden="true">${e}</span><b>${esc(label)}</b><small>${t==='learn'?'Learn with Knox':'Ask Knox'} →</small></button>`).join('')}</div></section>
  <section class="km-rise" aria-labelledby="kmToolsTitle"><div class="km-section-heading"><h2 id="kmToolsTitle">Study tools</h2></div>
   <div class="km-tools">${TOOLS.map(([id,color,label,copy,kind])=>`<button type="button" class="km-tool km-press" data-color="${color}" ${kind==='quiz'?'data-action="quiz"':`data-go="${id}"`}><span class="km-tool-icon" aria-hidden="true">${kind==='quiz'?svg('quiz'):svg(id)}</span><b>${label}</b><span>${copy}</span></button>`).join('')}</div></section>
  <section class="km-rise" aria-labelledby="kmReviewTitle"><div class="km-section-heading"><h2 id="kmReviewTitle">Review</h2>${scrollCtl('kmDeckRow','decks')}</div><div id="kmReview"></div></section>
  <section class="km-rise" id="kmRecentSection" aria-labelledby="kmRecentTitle"><div class="km-section-heading"><h2 id="kmRecentTitle">Recent</h2><button type="button" class="km-text-button" data-action="history">See all</button></div><div id="kmRecent"></div></section>
  <div id="kmHomePlan"></div>
  <p class="km-footer-note">Knox is AI and can make mistakes. Check important answers.</p>
 </div>`;
 account.innerHTML=`<div class="km-page-wrap">
  <section class="km-profile"><div class="km-profile-banner" aria-hidden="true"><span></span><span></span><span></span></div><div id="kmIdentity"></div></section>
  <section class="km-account-section" aria-labelledby="kmPlanTitle"><div class="km-section-heading"><h2 id="kmPlanTitle">Your plan</h2></div><div id="kmAccountPlan"></div></section>
  <section id="kmProgress" class="km-account-section" hidden></section>
  <section class="km-account-section" aria-labelledby="kmAppearanceTitle"><div class="km-section-heading"><h2 id="kmAppearanceTitle">Look</h2></div><div class="km-looks" role="group" aria-label="Appearance">${[['light','Light'],['dark','Dark'],['seasonal','Fall']].map(([id,label])=>`<button type="button" class="km-press" data-look="${id}" aria-pressed="false"><span class="km-look-swatch" data-swatch="${id}" aria-hidden="true"><i></i><i></i><i></i></span><b>${label}</b><small data-selected-label></small></button>`).join('')}</div>
   <div class="km-reading" role="group" aria-label="Answer text size"><button type="button" data-reading="standard" aria-pressed="true">Aa Standard</button><button type="button" data-reading="large" aria-pressed="false"><span style="font-size:1.2em">Aa</span> Larger</button></div></section>
  <section class="km-account-section" aria-labelledby="kmSettingsTitle"><div class="km-section-heading"><h2 id="kmSettingsTitle">Account & help</h2></div><div class="km-menu-list">
   <button type="button" class="km-press" data-action="settings">${tile('settings','grey')}<span>Account & settings<small>Profile, connections, account deletion</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="km-press" data-action="credits">${tile('coin','gold')}<span>Questions & limits<small>See your current allowance</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="km-press" data-action="support">${tile('help','calculator')}<span>Help & support<small>Answers, or talk to the Knox team</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="km-press" data-action="tour">${tile('map','learn')}<span>Show me around<small>A quick tour of your study tools</small></span><span aria-hidden="true">›</span></button>
  </div></section>
  <button type="button" class="km-signout km-press" data-action="signout">Sign out</button>
  <p class="km-draft-note">Unsent text drafts stay on this device for up to 7 days and are cleared when you sign out. Photos and files aren’t included. <button type="button" class="km-text-button" data-action="clear-drafts">Clear drafts</button></p>
  <div class="km-legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund">Refunds</a></div>
  <p class="km-footer-note">Knox Knows${w.knoxMobileConfig?.version&&w.knoxMobileConfig.version!=='web'?' · '+w.knoxMobileConfig.version:''} · Made for students 🦊</p>
 </div>`;
 let historyOwner=w.currentUser?.uid||'guest',renderVersion=0,refreshAt=0,refreshOwner='',refreshing=false;
 function block(id,html){const el=$(id);if(el && el.innerHTML!==html)el.innerHTML=html;}
 function historyRows(){return historyOwner===(w.currentUser?.uid||'guest')?[...document.querySelectorAll('#sidebarHistoryList .sidebar-history-item[data-conversation-id]:not(.shi-removing)')].map(el=>({id:el.dataset.conversationId,title:el.querySelector('.shi-text')?.textContent||el.title,kind:el.classList.contains('shi-learn')?'learn':'chat'})):[];}
 function greeting(first){const h=new Date().getHours(),part=h<5?'Up late':h<12?'Good morning':h<17?'Good afternoon':'Good evening';return `${part}${first?', '+esc(first):''} 👋`;}
 async function render(){
  const v=++renderVersion,uid=w.currentUser?.uid||'guest',user=w.currentUser;
  const {homeSummary,planDetails}=await model;if(v!==renderVersion||uid!==(w.currentUser?.uid||'guest'))return;
  const source=w.knoxFlashcardsMobile?.summary?.()||{uid,decks:[]};
  const activity=homeSummary({uid,sourceUid:source.uid,decks:source.decks,history:historyRows()}),plan=planDetails(w.userTier);
  const first=user?.displayName?.trim().split(/\s+/)[0]?.slice(0,30);
  block('kmGreeting',greeting(first));
  const pill=$('kmPlanPill');if(pill){pill.textContent=TIER[plan.current.id]+' '+(user?plan.current.name:'Free');pill.dataset.tier=plan.current.id;pill.hidden=!!w.knoxNativeApp&&plan.current.id==='free';}
  block('kmDrafts',(w.knoxMobile?.drafts?.()||[]).map(d=>`<button type="button" class="km-draft km-press" data-draft="${d.mode}">${tile(d.mode,d.mode)}<span><b>Continue your ${d.mode==='learn'?'Learn':'Ask'} draft</b><small>${esc(d.text.slice(0,75))}${d.text.length>75?'…':''}</small></span><span aria-hidden="true">→</span></button>`).join(''));
  const recentLesson=activity.recentLesson;
  block('kmResume',recentLesson?`<button type="button" class="km-resume km-press km-rise" data-conversation="${esc(recentLesson.id)}"><span class="km-resume-badge" aria-hidden="true">${svg('learn')}</span><span><span class="km-eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>${esc(recentLesson.title)}</h2></span><span class="km-resume-go" aria-hidden="true">${svg('arrow')}</span></button>`:'');
  block('kmReview',activity.decks.length?`<div class="km-review-hero${activity.due?' due':''}"><span class="km-review-count"><b>${activity.due||'✓'}</b><small>${activity.due?'card'+(activity.due===1?'':'s')+' due':'all caught up'}</small></span><span class="km-review-copy"><b>${activity.due?'Time for a quick review':'Nice! Nothing due right now'}</b><small>${activity.decks.length} deck${activity.decks.length===1?'':'s'} · ${activity.totalCards} cards</small></span>${activity.due?`<button type="button" class="km-review-go km-press" data-deck="${esc(activity.decks[0].id)}">Review</button>`:''}</div><div class="km-deck-row" id="kmDeckRow">${activity.decks.slice(0,6).map(d=>`<button type="button" class="km-deck km-press" data-deck="${esc(d.id)}"><span class="km-deck-stack" aria-hidden="true"><i></i><i></i></span><b>${esc(d.title)}</b><small>${d.due?d.due+' due':d.count+' cards'}</small></button>`).join('')}</div>`:`<button type="button" class="km-empty km-press" data-go="flashcards">${tile('flashcards','flashcards')}<span><b>Make your first deck</b><small>Turn a topic, your notes or a photo into flashcards.</small></span><span aria-hidden="true">→</span></button>`);
  block('kmRecent',activity.history.length?`<div class="km-recent-list">${activity.history.map(r=>`<button type="button" class="km-recent km-press" data-conversation="${esc(r.id)}">${r.kind==='learn'?tile('learn','learn'):tile('chat','chat')}<span><b>${esc(r.title)}</b><small>${r.kind==='learn'?'Learn lesson':'Ask Knox'}</small></span><span aria-hidden="true">›</span></button>`).join('')}</div>`:`<div class="km-empty km-empty-small"><span><b>${user?'Your work shows up here':'Keep your work together'}</b><small>${user?'Ask a question or start a lesson to begin.':'Sign in to keep your chats, lessons and decks.'}</small></span>${user?'':`<button type="button" class="km-inline-action" data-action="signin">Sign in →</button>`}</div>`);
  block('kmHomePlan',plan.suggested&&!w.knoxNativeApp?`<button type="button" class="km-upsell km-press km-rise" data-action="plans" data-tier="${plan.suggested.id}"><span class="km-upsell-shine" aria-hidden="true"></span><span class="km-upsell-gem" aria-hidden="true">${plan.suggested.id==='mega'?'💎':'⚡'}</span><span><small>${plan.suggested.id==='mega'?'GO BIGGER':'LEVEL UP'}</small><b>${esc(plan.suggested.name)}</b><span>${plan.suggested.id==='mega'?'40-card decks, longer files and the most of everything.':'Unlimited questions and full Learn lessons.'}</span></span><span class="km-upsell-go" aria-hidden="true">${svg('arrow')}</span></button>`:'');
  const initials=(user?.displayName||user?.email||'K').slice(0,1).toUpperCase();
  const photo=user?.photoURL&&/^https:\/\//.test(user.photoURL)?`<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">`:esc(initials);
  document.querySelectorAll('[data-avatar]').forEach(a=>{if(a.innerHTML!==photo)a.innerHTML=photo;});
  block('kmIdentity',`<div class="km-identity"><span class="km-avatar">${photo}</span><h1>${esc(user?.displayName||'Welcome to Knox')}</h1><p>${esc(user?.email||'Sign in to save your progress.')}</p><span class="km-tier" data-tier="${plan.current.id}">${user?TIER[plan.current.id]+' '+esc(plan.current.name):'Guest'}</span>${user?'':`<button type="button" class="km-solid-button km-press" data-action="signin">Sign in or create an account</button>`}</div>`);
  block('kmAccountPlan',`<div class="km-current-plan" data-tier="${plan.current.id}"><span class="km-current-gem" aria-hidden="true">${TIER[plan.current.id]}</span><span class="km-current-copy"><span class="km-eyebrow">${user?'CURRENT PLAN':'START FREE'}</span><h3>${esc(plan.current.name)}</h3><p>${esc(plan.current.label)}</p></span>${plan.current.id==='mega'||w.knoxNativeApp?`<button type="button" class="km-inline-action" data-action="plans">Compare →</button>`:`<button type="button" class="km-plan-cta km-press" data-action="plans" data-tier="${plan.current.id==='plus'?'mega':'plus'}">${plan.current.id==='plus'?'💎 Go Mega':'⚡ Upgrade'}</button>`}</div>`);
  home.querySelector('.km-join').hidden=!!user;home.querySelector('.km-today').hidden=!user;$('kmRecentSection').hidden=!user;
  const pillEl=$('streakPill'),count=Number($('streakCount')?.textContent),has=user&&Number.isFinite(count);
  $('kmStreakCount').textContent=has?`${count} day${count===1?'':'s'}`:'Your streak';
  document.querySelectorAll('[data-streak-count]').forEach(el=>{el.textContent=has?count:0;el.parentElement.classList.toggle('dim',!pillEl?.classList.contains('active'));el.parentElement.hidden=!user;});
  const lit=!!pillEl?.classList.contains('active');document.querySelector('#knoxMobileHome .km-streak-card')?.classList.toggle('lit',!!user&&lit);
  w.knoxFlameFest?.applyFlameStyle?.(); // the student's own flame (Slime, Purple…) on the app pages too
  $('kmStreakNote').textContent=user?(lit?'Studied today. Nice!':count>0?'Study today to keep it':'Start your streak today'):'Sign in to start a streak';
  const theme=w.knoxTheme?.()||'light',mo=new Date().getMonth();
  account.querySelectorAll('[data-look]').forEach(b=>{const selected=b.dataset.look===theme;b.setAttribute('aria-pressed',String(selected));b.querySelector('[data-selected-label]').textContent=selected?'✓':'';b.hidden=b.dataset.look==='seasonal'&&(mo<8||mo>10);});
  account.querySelectorAll('[data-reading]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reading===reading)));
  account.querySelector('[data-action="signout"]').hidden=!user;
  home.querySelectorAll('.km-starts,.km-deck-row').forEach(syncScroll);document.querySelector('.km-scroll-ctl[data-row="kmDeckRow"]')?.toggleAttribute('hidden',!$('kmDeckRow'));
 }
 function show(target){home.hidden=target!=='home';account.hidden=target!=='account';if(target==='home'||target==='account'){render();if(target==='home')refreshDecks();}}
 async function refreshDecks(){
  const uid=w.currentUser?.uid||'guest';if(refreshing || !w.knoxFlashcardsMobile || (uid===refreshOwner&&Date.now()-refreshAt<30000))return;
  refreshing=true;refreshOwner=uid;refreshAt=Date.now();
  try{await w.knoxFlashcardsMobile.refreshSummary?.();if(uid===(w.currentUser?.uid||'guest'))render();}finally{refreshing=false;if(uid!==(w.currentUser?.uid||'guest')&&!home.hidden)refreshDecks();}
 }
 // The App Store app only describes plans (no purchases inside the app).
 async function plans(){
  const {planDetails}=await model,plan=planDetails(w.userTier);
  const d=dialog('Find your kind of Knox.','Your current plan follows your account on every device.');
  const wrap=document.createElement('div');wrap.className='km-plan-list';wrap.innerHTML=plan.plans.map(p=>`<article data-tier="${p.id}" class="km-plan-option"><span class="km-tier" data-tier="${p.id}">${p.id===plan.current.id?'Your plan':esc(p.label)}</span><h3>${TIER[p.id]} ${esc(p.name)}</h3><ul>${p.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></article>`).join('');d.append(wrap);
  const explain=document.createElement('p');explain.className='km-plan-note';explain.textContent='Your existing subscription works here. Plan purchases aren’t available inside the app yet.';d.append(explain);button(d,'Done',()=>d.close());d.showModal();const heading=d.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});d.scrollTop=0;
 }
 // In-app Plans (the website's home-screen version): the same Stripe checkout
 // as the pricing page, without leaving the app.
 const PRICE={plus:{monthly:'$9.99',yearly:'$79.99',perMonth:'$6.67',save:'33%'},mega:{monthly:'$12.99',yearly:'$99.99',perMonth:'$8.33',save:'36%'}};
 // Honest side-by-side (api/_plans.js LIMITS).
 const COMPARE=[['Same smart Knox AI','✓','✓','✓'],['Questions','5 a day','Unlimited','Unlimited'],['Learn lesson length','20 msgs','30 msgs','50 msgs'],['Cards per AI deck','10','15','40'],['Photos per deck','5','5','10'],['File length','Standard','Standard','2× longer'],['Card styles & difficulty','—','—','✓']];
 let planBilling='monthly',planPick='';
 async function openPlans(){
  if(w.knoxNativeApp){plans();return;}
  const {planDetails}=await model,plan=planDetails(w.userTier),cur=plan.current.id;
  let device=false;try{device=localStorage.getItem('knoxMegaTrialDevice')==='1';}catch(_){}
  const trial=!w.currentUser||(cur==='free'&&!w.megaTrialUsed&&!device);
  if(!planPick||(cur==='mega'&&planPick==='plus'))planPick='mega';
  document.querySelector('.km-plans')?.remove();
  const sheet=document.createElement('div');sheet.className='km-sheet km-plans';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','Plans');
  const byId=Object.fromEntries(plan.plans.map(p=>[p.id,p]));
  const draw=()=>{
   const p=byId[planPick],yearly=planBilling==='yearly',price=PRICE[p.id],showTrial=p.id==='mega'&&trial&&!yearly;
   let cta;
   if(p.id===cur&&w.currentUser)cta=`<button type="button" class="km-pw-cta" disabled>✓ This is your plan</button>`;
   else if(cur==='mega'&&p.id==='plus')cta=`<button type="button" class="km-pw-cta" disabled>✓ Included in your Mega Knox</button>`;
   else cta=`<button type="button" class="km-pw-cta go km-press" data-buy="${p.id}"><span class="km-pw-cta-shine" aria-hidden="true"></span>${p.id==='mega'?(showTrial?'Start my free trial':cur==='plus'?'Upgrade to Mega Knox':'Get Mega Knox'):'Get Knox Plus'}</button>`;
   sheet.dataset.tier=p.id;
   sheet.innerHTML=`<div class="km-pw-hero"><button type="button" class="km-pw-close km-press" data-close aria-label="Close">${svg('close')}</button>
    <div class="km-pw-sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
    <img class="km-pw-fox" src="/knox-logo-square.jpg" alt=""><h1>Study with<br><span>more Knox</span></h1><p>Same smart AI on every plan. More room to learn when you upgrade.</p></div>
   <div class="km-pw-body">
    <div class="km-pw-switch" role="group" aria-label="Choose a plan">${['plus','mega'].map(id=>`<button type="button" data-pick="${id}" aria-pressed="${planPick===id}" data-tier="${id}">${TIER[id]} ${esc(byId[id].name)}${id===cur&&w.currentUser?'<small>Your plan</small>':''}</button>`).join('')}</div>
    <article class="km-pw-card" data-tier="${p.id}">${showTrial?'<span class="km-pw-ribbon">3 DAYS FREE</span>':''}
     <div class="km-billing" role="group" aria-label="Billing">${['monthly','yearly'].map(b=>`<button type="button" data-billing="${b}" aria-pressed="${planBilling===b}">${b==='monthly'?'Monthly':'Yearly <em>−'+price.save+'</em>'}</button>`).join('')}</div>
     <div class="km-pw-price"><b>${yearly?price.yearly:price.monthly}</b><span>${yearly?'/year':'/month'}</span></div>
     <p class="km-pw-sub">${showTrial?'Free for 3 days, then '+price.monthly+'/month. Cancel anytime.':yearly?'Just '+price.perMonth+'/month, billed once a year.':'Billed monthly. Cancel anytime.'}</p>
     <ul class="km-pw-features">${p.features.map(f=>`<li>${svg('check')}<span>${esc(f)}</span></li>`).join('')}</ul>
     ${cta}
    </article>
    ${showTrial?`<section class="km-pw-timeline" aria-label="How the free trial works"><h2>How your free trial works</h2><ol><li><span>🔓</span><b>Today</b><small>Everything in Mega Knox unlocks.</small></li><li><span>📚</span><b>Days 1–3</b><small>Study as much as you want. Cancel anytime in Manage billing.</small></li><li><span>💎</span><b>Day 3</b><small>Your trial ends and ${price.monthly}/month starts, unless you cancel before.</small></li></ol></section>`:''}
    <section class="km-pw-compare" aria-label="Compare plans"><h2>Compare plans</h2><div class="km-pw-table" role="table"><div role="row" class="km-pw-head"><span role="columnheader"></span>${['free','plus','mega'].map(id=>`<span role="columnheader" data-tier="${id}"${id===planPick?' class="on"':''}>${TIER[id]}<b>${id==='free'?'Free':id==='plus'?'Plus':'Mega'}</b></span>`).join('')}</div>${COMPARE.map(([label,...v])=>`<div role="row"><span role="rowheader">${esc(label)}</span>${v.map((x,i)=>`<span role="cell"${['free','plus','mega'][i]===planPick?' class="on"':''}>${x==='✓'?`<i class="km-pw-yes" aria-label="Included">${svg('check')}</i>`:x==='—'?'<i class="km-pw-no" aria-label="Not included">—</i>':esc(x)}</span>`).join('')}</div>`).join('')}</div><p class="km-pw-fine">Unlimited questions have a very high fair-use limit to stop automated abuse. Real studying never gets near it.</p></section>
    ${w.hasBillingAccount&&w.currentUser?'<button type="button" class="km-plan-manage km-press" data-manage>Manage billing</button>':''}
    <p class="km-plan-note">${trial?'One free trial per person. ':''}Cancel anytime · Secure checkout with Stripe</p></div>`;
  };
  draw();
  sheet.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-close')){sheet.remove();return;}
   if(b.dataset.pick){planPick=b.dataset.pick;draw();sheet.querySelector(`[data-pick="${planPick}"]`)?.focus({preventScroll:true});return;}
   if(b.dataset.billing){planBilling=b.dataset.billing;draw();sheet.querySelector(`[data-billing="${planBilling}"]`)?.focus({preventScroll:true});return;}
   if(b.hasAttribute('data-manage')){w.openBillingPortal?.(b);return;}
   if(!b.dataset.buy)return;
   if(!w.currentUser){sheet.remove();w.openAuthModal?.('signup');return;}
   const label=b.textContent;b.disabled=true;b.textContent='Opening Stripe…';
   try{
    const token=await w.currentUser.getIdToken();
    const r=await fetch('/api/create-checkout-session',{method:'POST',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({plan:b.dataset.buy==='mega'?'max':'super',billing:planBilling})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(data.error||'Could not open checkout. Please try again.');
    if(!data.url||!['https://checkout.stripe.com','https://billing.stripe.com'].includes(new URL(data.url).origin))throw Error('Invalid checkout link. Please contact support.');
    location.href=data.url;
   }catch(err){note(err.name==='TimeoutError'?'Checkout took too long to open. Please try again.':err.message);b.disabled=false;b.textContent=label;}
  });
  sheet.addEventListener('keydown',e=>{if(e.key==='Escape')sheet.remove();});
  document.body.append(sheet);sheet.querySelector('[data-close]').focus({preventScroll:true});
 }
 // Fill the typing box in Ask or Learn (nothing is sent until the student taps Send).
 // Runs inside the tap (Ask/Learn switch synchronously) so the keyboard opens right away.
 function prefill(target,text){
  navigate(target);
  const input=$('appChatInput');if(!input||document.body.classList.contains('knox-mobile-home')||!!w._learnModeActive!==(target==='learn'))return;
  if(!text){input.focus();return;}
  if(input.value.trim()){note('You already have a draft. Send or clear it first.');input.focus();return;}
  input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
  try{input.setSelectionRange(text.length,text.length);}catch{}
 }
 function syncScroll(row){const ctl=document.querySelector(`.km-scroll-ctl[data-row="${row.id}"]`);if(!ctl)return;const more=row.scrollWidth-row.clientWidth>4;ctl.hidden=!more;ctl.querySelector('[data-scroll="-1"]').disabled=row.scrollLeft<8;ctl.querySelector('[data-scroll="1"]').disabled=row.scrollLeft>row.scrollWidth-row.clientWidth-8;row.classList.toggle('km-more',!ctl.querySelector('[data-scroll="1"]').disabled);row.classList.toggle('km-less',row.scrollLeft>=8);}
 home.addEventListener('scroll',e=>{if(e.target.matches?.('.km-starts,.km-deck-row'))syncScroll(e.target);},{capture:true,passive:true});
 new ResizeObserver(()=>home.querySelectorAll('.km-starts,.km-deck-row').forEach(syncScroll)).observe(home);
 async function action(e){
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.action==='type'){prefill('chat','');return;}
  if(b.dataset.scroll){const row=$(b.parentElement.dataset.row);row?.scrollBy({left:Number(b.dataset.scroll)*row.clientWidth*.8,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return;}
  if(e.target.closest('[data-action="photo"]')){w.knoxSnap?.();return;}
  if(b.dataset.reading){reading=b.dataset.reading==='large'?'large':'standard';document.documentElement.classList.toggle('knox-reading-large',reading==='large');try{localStorage.setItem('knoxMobileReading',reading);}catch{}render();return;}
  if(b.dataset.draft){await w.knoxMobile?.resumeDraft(b.dataset.draft);return;}
  if(b.dataset.start){const s=STARTS[Number(b.dataset.start)];if(s)prefill(s[2],s[4]);return;}
  if(b.dataset.go){navigate(b.dataset.go);return;}
  if(b.dataset.conversation){const uid=w.currentUser?.uid;if(!uid){w.openAuthModal?.();return;}if(w._appAskBusy){note('Let Knox finish this answer first.');return;}b.disabled=true;try{const ok=await (w.knoxMobile?.openConversation||w.openConversation)?.(b.dataset.conversation);if(ok===false&&uid===w.currentUser?.uid)note('That conversation could not be opened. Please try again.');}finally{b.disabled=false;}return;}
  if(b.dataset.deck){if(!w.knoxFlashcardsMobile){note('Flashcards is still opening. Try again in a moment.');return;}await w.knoxFlashcardsMobile.review?.(b.dataset.deck);return;}
  switch(b.dataset.action){
   case 'file':if(!(await navigate('chat')))return;$('appFileInput')?.click();break;
   case 'quiz':prefill('learn','Quiz me on ');break;
   case 'history':if(!w.currentUser){w.openAuthModal?.();break;}w.openMobileHistory?.();break;
   case 'signin':w.openAuthModal?.();break;
   case 'signup':w.openAuthModal?.('signup');break;
   case 'plans':openPlans();break;
   case 'settings':w.openAppSettings?.();break;
   case 'credits':w.openUsageInfo?.();break;
   case 'streak':{
    if(!w.currentUser){w.openAuthModal?.();break;}
    if(w.knoxFlameFest?.active?.()){w.knoxFlameFest.open();break;}
    const count=Number($('streakCount')?.textContent)||0,studied=$('streakPill')?.classList.contains('active');
    const d=dialog('🔥 '+count+'-day streak',studied?'You studied today. Come back tomorrow to keep your flame growing.':'Study today to light your flame. A little progress each day adds up.');
    button(d,'Study with Knox',()=>{d.close();navigate('learn');},'primary');button(d,'Done',()=>d.close());d.showModal();break;
   }
   case 'support':w.openHelp?.();break;
   case 'tour':w.knoxTour?.start();break;
   case 'clear-drafts':w.knoxMobile?.clearDrafts();break;
   case 'signout':w.appHandleLogout?.();break;
  }
  if(b.dataset.look){w.knoxSetTheme?.(b.dataset.look);render();}
 }
 home.addEventListener('click',action);account.addEventListener('click',action);
 const historyList=$('sidebarHistoryList');if(historyList)new MutationObserver(()=>{if(!home.hidden)render();}).observe(historyList,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','data-row-key']});
 // Watch the streak count and whether today's flame is lit. Never watch the flame
 // icon's classes: render() restyles it (applyFlameStyle), which would loop.
 let renderSoon=0;const later=()=>{clearTimeout(renderSoon);renderSoon=setTimeout(render,30);};
 const status=$('streakPill');if(status){new MutationObserver(later).observe(status,{childList:true,subtree:true,characterData:true});new MutationObserver(later).observe(status,{attributes:true,attributeFilter:['title','class']});}
 w.addEventListener('knox-plan-changed',render);w.addEventListener('knox-mobile-data',()=>{if(!home.hidden){render();refreshDecks();}});
 w.addEventListener('knox-auth-changed',()=>{historyOwner=w.currentUser?.uid||'guest';refreshAt=0;renderVersion++;render();if(!home.hidden)refreshDecks();});
 new MutationObserver(()=>{if(!account.hidden)render();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
 return {show,render,refreshDecks,home,account,action,openPlans};
};
