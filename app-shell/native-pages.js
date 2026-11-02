/* Local mobile Home and You pages. Account activity comes from the shared
   signed-in history/deck stores; never invent progress, credits or streaks. */
window.createKnoxMobilePages=function({navigate,note,dialog,button,icon}){
 const $=id=>document.getElementById(id),w=window;
 const model=import((w.knoxShellBase||'/assets/')+'home-model.js');
 let reading='standard';try{if(localStorage.getItem('knoxMobileReading')==='large')reading='large';}catch{}
 document.documentElement.classList.toggle('knox-reading-large',reading==='large');
 const home=document.createElement('section'),account=document.createElement('section');
 home.id='knoxMobileHome';account.id='knoxMobileAccount';home.className=account.className='knox-mobile-page';home.hidden=account.hidden=true;
 home.setAttribute('aria-label','Home');account.setAttribute('aria-label','You');
 $('mainColumn').append(home,account);
 const svg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon[name]||icon.chat}</svg>`;
 // The website's own sidebar icons, so the app's tiles match it exactly.
 const SITE_ICON={chat:'[data-nav="chat"] .sq-icon svg',learn:'[data-nav="learn"] .sq-icon svg',calculator:'[data-nav="calculator"] .sq-icon svg',flashcards:'.fc-nav .sq-icon svg'};
 const siteSvg=name=>{const el=SITE_ICON[name]&&document.querySelector(SITE_ICON[name]);return el?el.outerHTML:svg(name);};
 const tile=(name,color=name,size='')=>`<span class="km-tile${size?' '+size:''}" data-color="${color}" aria-hidden="true">${siteSvg(name)}</span>`;
 const extra={camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>',up:'<path d="M12 19V5M5 12l7-7 7 7"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',coin:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5H14.5"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>'};
 const xsvg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra[name]}</svg>`;
 const xtile=(name,color)=>`<span class="km-tile sm" data-color="${color}" aria-hidden="true">${xsvg(name)}</span>`;
 // The logo bar with the streak flame and profile is the app header (native-ui.js).
 const topbar=()=>`<header class="km-topbar"><span class="km-brand"><img class="km-logo" src="/knox-logo-square.jpg" alt=""><b>Knox Knows</b></span><span class="km-top-right"><button type="button" class="km-flame-pill km-press" data-action="streak" aria-label="Your streak"><span class="knox-flame" aria-hidden="true">🔥</span><b data-streak-count>0</b></button><button type="button" class="km-top-avatar km-press" data-go="account" aria-label="You" data-avatar>K</button></span></header>`;
 home.innerHTML=`<div class="km-page-wrap">
  ${topbar()}
  <div class="km-heading"><span class="km-chip">🦊 Your AI study companion</span><h1 id="kmGreeting">Hey there!<br><span>What are we tackling today?</span></h1></div>
  <div class="km-askbar"><button type="button" class="km-askbar-text" data-go="chat">Ask Knox anything…</button><button type="button" class="km-askbar-cam" data-action="photo" aria-label="Snap your homework">${xsvg('camera')}</button><button type="button" class="km-askbar-go" data-go="chat" aria-label="Open Ask Knox">${xsvg('up')}</button></div>
  <div id="kmDrafts"></div>
  <div id="kmResume"></div>
  <section aria-labelledby="kmToolsTitle"><div class="km-section-heading"><h2 id="kmToolsTitle">What are we working on?</h2></div>
   <div class="km-tools">${[['chat','Ask Knox','Snap it, ask it, get it'],['learn','Learn','Step by step, at your pace'],['flashcards','Flashcards','Make it stick'],['calculator','Calculator','Basic & scientific']].map(([id,label,copy])=>`<button type="button" class="km-tool km-press" data-go="${id}" data-color="${id}">${tile(id)}<b>${label}</b><span>${copy}</span></button>`).join('')}</div>
  </section>
  <section aria-labelledby="kmReviewTitle"><div class="km-section-heading"><h2 id="kmReviewTitle">A little review goes a long way.</h2></div><div id="kmReview"></div></section>
  <section aria-labelledby="kmRecentTitle"><div class="km-section-heading"><h2 id="kmRecentTitle">Your recent work</h2><button type="button" class="km-text-button" data-action="history">See all</button></div><div id="kmRecent"></div></section>
  <div id="kmHomePlan"></div>
  <p class="km-footer-note">Keep asking. You’re getting somewhere.</p>
 </div>`;
 account.innerHTML=`<div class="km-page-wrap">
  <div class="km-heading"><span class="km-chip">🦊 Your corner of Knox</span><h1>You<span>.</span></h1></div>
  <div id="kmIdentity"></div>
  <section class="km-account-section" aria-labelledby="kmPlanTitle"><div class="km-section-heading"><h2 id="kmPlanTitle">Your plan</h2></div><div id="kmAccountPlan"></div></section>
  <section class="km-account-section" aria-labelledby="kmStreakTitle"><div class="km-section-heading"><h2 id="kmStreakTitle">Keep your flame going.</h2></div><button type="button" class="km-streak-card km-press" data-action="streak"><span aria-hidden="true"><span class="knox-flame">🔥</span></span><span><b id="kmStreakCount">Your study streak</b><small id="kmStreakNote">Study a little, come back a little stronger.</small></span><span aria-hidden="true">↗</span></button></section>
  <section class="km-account-section" aria-labelledby="kmAppearanceTitle"><div class="km-section-heading"><h2 id="kmAppearanceTitle">Make yourself at home.</h2></div><div class="km-looks" role="group" aria-label="Appearance">${[['light','Light','☀️'],['dark','Dark','🌙'],['seasonal','Fall','🍂']].map(([id,label,symbol])=>`<button type="button" class="km-press" data-look="${id}" aria-pressed="false"><span aria-hidden="true">${symbol}</span><b>${label}</b><small data-selected-label></small></button>`).join('')}</div></section>
  <section class="km-account-section" aria-labelledby="kmReadingTitle"><div class="km-section-heading"><h2 id="kmReadingTitle">Comfortable reading</h2></div><div class="km-reading" role="group" aria-label="Answer text size"><button type="button" data-reading="standard" aria-pressed="true">Standard</button><button type="button" data-reading="large" aria-pressed="false">Larger text</button></div><p class="km-draft-note">Applies to Ask and Learn answers and flashcard text.</p></section>
  <section class="km-account-section" aria-labelledby="kmSettingsTitle"><div class="km-section-heading"><h2 id="kmSettingsTitle">Account & help</h2></div><div class="km-menu-list">
   <button type="button" class="km-press" data-action="settings">${xtile('settings','grey')}<span>Account & settings<small>Profile, connections and account deletion</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="km-press" data-action="credits">${xtile('coin','gold')}<span>Questions & limits<small>Understand your current allowance</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="km-press" data-action="support">${xtile('help','calculator')}<span>Help & support<small>Find answers or talk to the Knox team</small></span><span aria-hidden="true">›</span></button>
   <button type="button" class="km-press" data-action="tour">${xtile('map','learn')}<span>Show me around<small>A quick tour of your study tools</small></span><span aria-hidden="true">›</span></button>
  </div></section>
  <p class="km-draft-note">Unsent text drafts stay on this device for up to 7 days and are cleared when you sign out. Photos and files are not included in recovered drafts.</p><button type="button" class="km-text-button" data-action="clear-drafts">Clear unsent text drafts</button>
  <div class="km-legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/refund">Refund policy</a></div>
  <button type="button" class="km-signout km-press" data-action="signout">Sign out</button>
  <p class="km-footer-note">Knox is AI and can make mistakes. Check important answers.</p>
  <p class="km-footer-note" style="margin-top:6px">Knox Knows${w.knoxMobileConfig?.version&&w.knoxMobileConfig.version!=='web'?' · '+w.knoxMobileConfig.version:''}</p>
 </div>`;
 let historyOwner=w.currentUser?.uid||'guest',renderVersion=0,refreshAt=0,refreshOwner='',refreshing=false;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function block(id,html){const el=$(id);if(el && el.innerHTML!==html)el.innerHTML=html;}
 function historyRows(){return historyOwner===(w.currentUser?.uid||'guest')?[...document.querySelectorAll('#sidebarHistoryList .sidebar-history-item[data-conversation-id]:not(.shi-removing)')].map(el=>({id:el.dataset.conversationId,title:el.querySelector('.shi-text')?.textContent||el.title,kind:el.classList.contains('shi-learn')?'learn':'chat'})):[];}
 async function render(){
  const v=++renderVersion,uid=w.currentUser?.uid||'guest',user=w.currentUser;
  const {homeSummary,planDetails}=await model;if(v!==renderVersion||uid!==(w.currentUser?.uid||'guest'))return;
  const source=w.knoxFlashcardsMobile?.summary?.()||{uid,decks:[]};
  const activity=homeSummary({uid,sourceUid:source.uid,decks:source.decks,history:historyRows()}),plan=planDetails(w.userTier);
  const first=user?.displayName?.trim().split(/\s+/)[0]?.slice(0,30);
  block('kmGreeting',`Hey ${first?esc(first):'there'}!<br><span>What are we tackling today?</span>`);
  block('kmDrafts',(w.knoxMobile?.drafts?.()||[]).map(d=>`<button type="button" class="km-draft km-press" data-draft="${d.mode}">${tile(d.mode,d.mode,'sm')}<span><b>Continue your ${d.mode==='learn'?'Learn':'Ask'} draft</b><small>${esc(d.text.slice(0,75))}${d.text.length>75?'…':''}</small></span><span aria-hidden="true">→</span></button>`).join(''));
  const recentLesson=activity.recentLesson;
  block('kmResume',recentLesson?`<button type="button" class="km-resume km-press" data-conversation="${esc(recentLesson.id)}"><img class="km-resume-knox" src="/knox-logo-square.jpg" alt=""><span><span class="km-eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>${esc(recentLesson.title)}</h2><span class="km-resume-cta">Keep learning <span aria-hidden="true">→</span></span></span></button>`:'');
  block('kmReview',activity.decks.length?`<div class="km-review-summary"><b>${activity.due?activity.due+' card'+(activity.due===1?'':'s')+' ready for review':'All caught up for now.'}</b><span>${activity.decks.length} saved deck${activity.decks.length===1?'':'s'} · ${activity.totalCards} cards</span></div><div class="km-deck-list">${activity.decks.slice(0,3).map(d=>`<button type="button" class="km-deck km-press" data-deck="${esc(d.id)}">${tile('flashcards','flashcards','sm')}<span><b>${esc(d.title)}</b><small>${d.due?d.due+' due':d.count+' cards · practice anytime'}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div>`:`<div class="km-empty">${tile('flashcards','flashcards','sm')}<b>Your next “I know this!” starts here.</b><p>Turn a topic or your notes into a deck, then come back for a quick review.</p><button type="button" class="km-inline-action" data-go="flashcards">Explore Flashcards →</button></div>`);
  block('kmRecent',activity.history.length?`<div class="km-recent-list">${activity.history.map(r=>`<button type="button" class="km-recent km-press" data-conversation="${esc(r.id)}">${r.kind==='learn'?tile('learn','learn','sm'):tile('chat','chat','sm')}<span><b>${esc(r.title)}</b><small>${r.kind==='learn'?'Learn lesson':'Ask Knox'}</small></span><span aria-hidden="true">›</span></button>`).join('')}</div>`:`<div class="km-empty km-empty-small"><b>${user?'Fresh start. Good things ahead.':'Your work belongs together.'}</b><p>${user?'Your saved questions and lessons will appear here.':'Sign in to keep your chats, lessons and decks with your account.'}</p>${user?'':`<button type="button" class="km-inline-action" data-action="signin">Sign in →</button>`}</div>`);
  block('kmHomePlan',plan.suggested?`<button type="button" class="km-plan-discovery km-press" data-action="plans" data-tier="${plan.suggested.id}"><span class="km-tile" data-color="${plan.suggested.id==='mega'?'gold':'flashcards'}" aria-hidden="true" style="font-size:22px">${plan.suggested.id==='mega'?'💎':'⚡'}</span><span><small>A LITTLE MORE ROOM TO GROW</small><b>${esc(plan.suggested.name)}</b><span>${plan.suggested.id==='mega'?'Bigger decks. More ways to study.':'More questions. More possibilities.'}</span></span><span aria-hidden="true">→</span></button>`:'');
  const initials=(user?.displayName||user?.email||'K').slice(0,1).toUpperCase();
  const photo=user?.photoURL&&/^https:\/\//.test(user.photoURL)?`<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">`:esc(initials);
  document.querySelectorAll('[data-avatar]').forEach(a=>{if(a.innerHTML!==photo)a.innerHTML=photo;});
  block('kmIdentity',`<div class="km-identity"><span class="km-avatar">${photo}</span><span><h2>${esc(user?.displayName||'Make yourself at home.')}</h2><p>${esc(user?.email||'Sign in to save your progress.')}</p><span class="km-tier" data-tier="${plan.current.id}">${user?(plan.current.id==='mega'?'💎 ':plan.current.id==='plus'?'⚡ ':'🪙 ')+esc(plan.current.name):'Guest'}</span></span></div>${user?'':`<button type="button" class="km-solid-button" data-action="signin">Sign in or create an account</button>`}`);
  block('kmAccountPlan',`<div class="km-current-plan" data-tier="${plan.current.id}"><span class="km-eyebrow">${user?'YOUR CURRENT PLAN':'START FREE'}</span><h3>${esc(plan.current.name)}</h3><p>${esc(plan.current.label)}</p>${plan.current.id==='mega'?'<button type="button" class="km-inline-action" data-action="plans">Compare plans →</button>':`<button type="button" class="km-plan-cta km-press" data-action="plans" data-tier="${plan.current.id==='plus'?'mega':'plus'}">${plan.current.id==='plus'?'💎 Upgrade to Mega Knox':'⚡ See Plus & Mega'}</button>`}</div>`);
  const pill=$('streakPill'),count=Number($('streakCount')?.textContent);
  $('kmStreakCount').textContent=user&&Number.isFinite(count)?`${count}-day streak`:'Your study streak';
  document.querySelectorAll('[data-streak-count]').forEach(el=>{el.textContent=user&&Number.isFinite(count)?count:0;el.parentElement.classList.toggle('dim',!pill?.classList.contains('active'));el.parentElement.hidden=!user;});
  w.knoxFlameFest?.applyFlameStyle?.(); // the student's own flame (Slime, Purple…) on the app pages too
  $('kmStreakNote').textContent=user?(pill?.classList.contains('active')?'You studied today. Keep it going.':count>0?'Study today to keep your flame.':'Start with one question today.'):'Sign in to build a streak and see your calendar.';
  const theme=w.knoxTheme?.()||'light',mo=new Date().getMonth();
  account.querySelectorAll('[data-look]').forEach(b=>{const selected=b.dataset.look===theme;b.setAttribute('aria-pressed',String(selected));b.querySelector('[data-selected-label]').textContent=selected?'Selected':'';b.hidden=b.dataset.look==='seasonal'&&(mo<8||mo>10);});
  account.querySelectorAll('[data-reading]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reading===reading)));
  account.querySelector('[data-action="signout"]').hidden=!user;
 }
 function show(target){home.hidden=target!=='home';account.hidden=target!=='account';if(target==='home'||target==='account'){render();if(target==='home')refreshDecks();}}
 async function refreshDecks(){
  const uid=w.currentUser?.uid||'guest';if(refreshing || !w.knoxFlashcardsMobile || (uid===refreshOwner&&Date.now()-refreshAt<30000))return;
  refreshing=true;refreshOwner=uid;refreshAt=Date.now();
  try{await w.knoxFlashcardsMobile.refreshSummary?.();if(uid===(w.currentUser?.uid||'guest'))render();}finally{refreshing=false;if(uid!==(w.currentUser?.uid||'guest')&&!home.hidden)refreshDecks();}
 }
 async function plans(){
  const {planDetails}=await model,plan=planDetails(w.userTier);
  const d=dialog('Find your kind of Knox.','Your current plan follows your account on every device.');
  const wrap=document.createElement('div');wrap.className='km-plan-list';wrap.innerHTML=plan.plans.map(p=>`<article data-tier="${p.id}" class="km-plan-option"><span class="km-tier" data-tier="${p.id}">${p.id===plan.current.id?'Your plan':esc(p.label)}</span><h3>${esc(p.name)}</h3><ul>${p.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></article>`).join('');d.append(wrap);
  const explain=document.createElement('p');explain.className='km-plan-note';explain.textContent=w.knoxNativeApp?'Your existing subscription works here. Plan purchases aren’t available inside the app yet.':'Manage your plan any time from Account & settings.';d.append(explain);button(d,'Done',()=>d.close());d.showModal();const heading=d.querySelector('h2');heading.tabIndex=-1;heading.focus({preventScroll:true});d.scrollTop=0;
 }
 // In-app Plans (the website's home-screen version): the same checkout as the
 // pricing page, without leaving the app. The App Store app only describes plans.
 const PRICE={plus:{monthly:'$9.99',yearly:'$79.99'},mega:{monthly:'$12.99',yearly:'$99.99'}};
 let planBilling='monthly';
 async function openPlans(){
  if(w.knoxNativeApp){plans();return;}
  const {planDetails}=await model,plan=planDetails(w.userTier),cur=plan.current.id;
  let device=false;try{device=localStorage.getItem('knoxMegaTrialDevice')==='1';}catch(_){}
  const trial=!w.currentUser||(cur==='free'&&!w.megaTrialUsed&&!device);
  document.querySelector('.km-plans')?.remove();
  const sheet=document.createElement('div');sheet.className='km-sheet km-plans';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','Plans');
  const card=p=>{
   const yearly=planBilling==='yearly',price=p.id==='free'?'$0':PRICE[p.id][planBilling],per=p.id==='free'?'forever':yearly?'/yr':'/mo';
   let btn;
   if(p.id===cur&&w.currentUser)btn=`<button type="button" class="km-plan-btn" disabled>✓ Your plan</button>`;
   else if(p.id==='free')btn='';
   else if(cur==='mega'&&p.id==='plus')btn=`<button type="button" class="km-plan-btn" disabled>✓ Included in Mega</button>`;
   else btn=`<button type="button" class="km-plan-btn go km-press" data-buy="${p.id}">${p.id==='mega'?(trial&&!yearly?'Start free trial':cur==='plus'?'Upgrade to Mega Knox':'Get Mega Knox'):'Get Knox Plus'}</button>`;
   return `<article class="km-plan-card" data-tier="${p.id}">${p.id==='mega'&&trial&&!yearly?'<span class="km-plan-ribbon">3-DAY FREE TRIAL</span>':''}<span class="km-plan-name">${p.id==='mega'?'💎 ':p.id==='plus'?'⚡ ':'🪙 '}${esc(p.name)}</span><div class="km-plan-price"><b>${price}</b><span>${per}</span></div><ul>${p.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>${btn}</article>`;
  };
  const draw=()=>{sheet.innerHTML=`<div class="km-sheet-bar"><button type="button" class="km-sheet-close km-press" data-close>✕ Close</button></div><div class="km-plans-body"><span class="km-chip">🦊 Plans</span><h1>Find your kind<br><span>of Knox.</span></h1>
   <div class="km-billing" role="group" aria-label="Billing">${['monthly','yearly'].map(b=>`<button type="button" data-billing="${b}" aria-pressed="${planBilling===b}">${b==='monthly'?'Monthly':'Yearly · save 33%'}</button>`).join('')}</div>
   <div class="km-plan-cards">${plan.plans.map(card).join('')}</div>
   ${w.hasBillingAccount&&w.currentUser?'<button type="button" class="km-plan-manage km-press" data-manage>Manage billing</button>':''}
   <p class="km-plan-note">${trial?'One free trial per person. ':''}Cancel anytime. Payments are handled securely by Stripe.</p></div>`;};
  draw();
  sheet.addEventListener('click',async e=>{
   const b=e.target.closest('button');if(!b)return;
   if(b.hasAttribute('data-close')){sheet.remove();return;}
   if(b.dataset.billing){planBilling=b.dataset.billing;draw();return;}
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
  document.body.append(sheet);sheet.querySelector('[data-close]').focus({preventScroll:true});
 }
 async function action(e){
  const b=e.target.closest('button');if(!b)return;
  if(e.target.closest('[data-action="photo"]')){if(!(await navigate('chat')))return;document.querySelector('button[onclick*="appFileInput"]')?.click();return;}
  if(b.dataset.reading){reading=b.dataset.reading==='large'?'large':'standard';document.documentElement.classList.toggle('knox-reading-large',reading==='large');try{localStorage.setItem('knoxMobileReading',reading);}catch{}render();return;}
  if(b.dataset.draft){await w.knoxMobile?.resumeDraft(b.dataset.draft);return;}
  if(b.dataset.go){navigate(b.dataset.go);return;}
  if(b.dataset.conversation){const uid=w.currentUser?.uid;if(!uid){w.openAuthModal?.();return;}if(w._appAskBusy){note('Let Knox finish this answer first.');return;}b.disabled=true;try{const ok=await (w.knoxMobile?.openConversation||w.openConversation)?.(b.dataset.conversation);if(ok===false&&uid===w.currentUser?.uid)note('That conversation could not be opened. Please try again.');}finally{b.disabled=false;}return;}
  if(b.dataset.deck){if(!w.knoxFlashcardsMobile){note('Flashcards is still opening. Try again in a moment.');return;}await w.knoxFlashcardsMobile.review?.(b.dataset.deck);return;}
  switch(b.dataset.action){
   case 'history':if(!w.currentUser){w.openAuthModal?.();break;}w.openMobileHistory?.();break;
   case 'signin':w.openAuthModal?.();break;
   case 'plans':openPlans();break;
   case 'settings':w.openAppSettings?.();break;
   case 'credits':w.openUsageInfo?.();break;
   case 'streak':{
    if(!w.currentUser){w.openAuthModal?.();break;}
    if(w.knoxFlameFest?.active?.()){w.knoxFlameFest.open();break;}
    const count=Number($('streakCount')?.textContent)||0,studied=$('streakPill')?.classList.contains('active');
    const d=dialog('Your '+count+'-day streak',studied?'You studied today. Come back tomorrow to keep your flame growing.':'Study today to light your flame. A little progress each day adds up.');
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
 const status=$('streakPill');if(status)new MutationObserver(()=>{render();}).observe(status,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title']});
 w.addEventListener('knox-plan-changed',render);w.addEventListener('knox-mobile-data',()=>{if(!home.hidden){render();refreshDecks();}});
 w.addEventListener('knox-auth-changed',()=>{historyOwner=w.currentUser?.uid||'guest';refreshAt=0;renderVersion++;render();if(!home.hidden)refreshDecks();});
 new MutationObserver(()=>{if(!account.hidden)render();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
 return {show,render,refreshDecks,home,account,action,openPlans};
};
