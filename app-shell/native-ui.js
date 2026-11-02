/* App-only navigation and platform integrations. Website behavior stays shared.
   Runs in the iPhone app (Capacitor) and in the website's home-screen version
   (window.knoxAppShell, see app-shell.js), where web stand-ins replace plugins. */
(function(){
const native=!!window.Capacitor?.isNativePlatform?.();
if(!native && !window.knoxAppShell)return;
const $=id=>document.getElementById(id), cap=window.Capacitor;
const noop=async()=>{}, listen=async()=>({remove(){}});
const WEB={
 Share:{share:o=>navigator.share?navigator.share(o):Promise.reject(Error('cancel'))},
 Filesystem:{writeFile:noop,deleteFile:noop}, Camera:{getPhoto:()=>Promise.reject(Error('cancel'))},
 Keyboard:{addListener:listen,setStyle:noop}, StatusBar:{setStyle:noop}, SplashScreen:{hide:noop}, Haptics:{selectionChanged:noop},
 Browser:{open:async({url})=>{window.open(url,'_blank','noopener');}},
 Network:{getStatus:async()=>({connected:navigator.onLine}),addListener:listen},
 App:{addListener:async(event,fn)=>{if(event==='appStateChange')document.addEventListener('visibilitychange',()=>fn({isActive:document.visibilityState==='visible'}));return{remove(){}};}},
};
const plugin=name=>native?(cap.Plugins?.[name] || cap.registerPlugin(name)):WEB[name];
const p={share:plugin('Share'),files:plugin('Filesystem'),keyboard:plugin('Keyboard'),
 browser:plugin('Browser'),camera:plugin('Camera'),network:plugin('Network'),
 app:plugin('App'),haptics:plugin('Haptics'),splash:plugin('SplashScreen')};
const quiet=promise=>Promise.resolve(promise).catch(()=>{});
let toastTimer;
function note(text){let el=$('knoxNativeNote');if(!el){el=document.createElement('div');el.id='knoxNativeNote';el.className='knox-native-note';el.setAttribute('role','status');document.body.append(el);}el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},5500);}
let dialogId=0;
function dialog(title,text){const el=document.createElement('dialog');el.className='knox-native-dialog';const h=document.createElement('h2');h.textContent=title;h.id='knoxDialogTitle'+(++dialogId);el.setAttribute('aria-labelledby',h.id);const body=document.createElement('p');body.textContent=text;el.append(h,body);document.body.append(el);el.addEventListener('close',()=>el.remove(),{once:true});return el;}
function button(el,label,fn,cls=''){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=fn;el.append(b);return b;}

// Cache temporary exports only until the share sheet closes; never put private
// decks in a public documents folder without the student's explicit Save choice.
let exporting=false;
if(native)window.knoxNativeExport=async(text,filename)=>{
 if(exporting)return false;exporting=true;let path;
 try{
  path='knox-export-'+crypto.randomUUID()+'/'+filename.replace(/[^\w .-]/g,'').slice(0,100);
  const saved=await p.files.writeFile({path,data:text,directory:'CACHE',encoding:'utf8',recursive:true});
  await p.share.share({title:'Knox flashcards',files:[saved.uri],dialogTitle:'Save or share your flashcards'});
  return true;
 }catch(err){if(!/cancel|dismiss/i.test(err?.message||''))note('The file could not be shared. Your decks are still saved in Knox.');return false;}
 finally{if(path)quiet(p.files.deleteFile({path,directory:'CACHE'}));exporting=false;}
};

if(native)window.knoxNativeShareAnswer=async(id)=>{
 const text=window._fbPayloads?.[id]?.answer;if(!text)return;
 try{await p.share.share({title:'Knox Knows',text,dialogTitle:'Share this answer'});}catch(err){if(!/cancel|dismiss/i.test(err?.message||''))note('The answer could not be shared. Try Copy instead.');}
};
let cameraBusy=false;
async function takePhoto(source,intoCards=false){
 if(cameraBusy)return;cameraBusy=true;
 const uid=window.currentUser?.uid, version=window._appViewVersion;
 try{
  const photo=await p.camera.getPhoto({source,resultType:'uri',quality:85,width:2200,height:2200,correctOrientation:true});
  if(uid!==window.currentUser?.uid || version!==window._appViewVersion)return;
  const blob=await (await fetch(photo.webPath)).blob();
  if(uid!==window.currentUser?.uid || version!==window._appViewVersion)return;
  const file=new File([blob],'Knox photo.jpg',{type:blob.type||'image/jpeg'});
  if(intoCards)await window.knoxFlashcardsMobile?.addFiles([file]);else await window.handleImageFile?.(file);
 }catch(err){if(!/cancel|dismiss/i.test(err?.message||''))note('Could not open photos. Check Knox’s camera/photo access in iPhone Settings.');}
 finally{cameraBusy=false;}
}
function attachments(intoCards=false){
 const d=dialog('Add your notes','Take a photo, choose a picture, or open a document from Files.');
 button(d,'Take photo',()=>{d.close();takePhoto('CAMERA',intoCards);});
 button(d,'Photo library',()=>{d.close();takePhoto('PHOTOS',intoCards);});
 button(d,'Choose file',()=>{d.close();$(intoCards?'fcDocInput':'appFileInput')?.click();});
 button(d,'Cancel',()=>d.close());d.showModal();
}
// The camera button opens the camera right away (like other apps); the paperclip
// next to it is for the photo library and files.
const webCamera=document.createElement('input');webCamera.type='file';webCamera.accept='image/*';webCamera.setAttribute('capture','environment');webCamera.hidden=true;
webCamera.onchange=()=>{const f=webCamera.files?.[0];webCamera.value='';if(f)window.handleImageFile?.(f);};document.body.append(webCamera);
function openCamera(){if(native)takePhoto('CAMERA');else webCamera.click();}
window.knoxOpenCamera=openCamera;
document.addEventListener('click',e=>{
 const clip=e.target.closest('.km-clip');
 if(clip){e.preventDefault();e.stopImmediatePropagation();if(native)attachments(false);else $('appFileInput')?.click();return;}
 const target=e.target.closest('button[onclick*="appFileInput"],button[data-action="doc-pick"]');
 if(!target)return;
 if(target.dataset.action==='doc-pick'){if(native){e.preventDefault();e.stopImmediatePropagation();attachments(true);}return;}
 e.preventDefault();e.stopImmediatePropagation();openCamera();
},true);
const camBtn=document.querySelector('button[onclick*="appFileInput"]');
if(camBtn&&!document.querySelector('.km-clip')){
 camBtn.setAttribute('aria-label','Take a photo');camBtn.title='Take a photo';
 const clipBtn=document.createElement('button');clipBtn.type='button';clipBtn.className=camBtn.className+' km-clip';clipBtn.setAttribute('aria-label','Add a photo or file');clipBtn.title='Add a photo or file';
 clipBtn.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>';
 camBtn.before(clipBtn);
}

// Ask and Learn share a renderer. Retain the actual message nodes (and their
// listeners), draft, attachment and lesson state when switching between them.
const slots=new Map();let owner=window.currentUser?.uid||'', busy=false, current='home',calculatorReturn='home';
let draftTimer,draftEdited=false;
let draftStorage;try{draftStorage=localStorage;}catch{draftStorage={getItem:()=>null,setItem(){throw Error('Storage unavailable');},removeItem(){}};}
const drafts=window.createKnoxDraftStore(draftStorage);
function saveDraft(force=false){clearTimeout(draftTimer);const text=$('appChatInput')?.value||'';if(owner&&owner===window.currentUser?.uid&&(text||draftEdited||force===true)){drafts.save(owner,mode(),text,window._currentConversationId||null);draftEdited=false;}}
$('appChatInput')?.addEventListener('input',()=>{draftEdited=true;clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,250);});
window.addEventListener('pagehide',saveDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft();});
const disclaimer=document.querySelector('.input-disclaimer');if(disclaimer)disclaimer.textContent='Knox is AI and can make mistakes. Check important answers.';
const stateFields=['_learnModeActive','_conversation','_currentConversationId','_learnSessionId','_learnSource','_learnStyle','_appImage','_appDoc','_fbPayloads','_appRenewLearn'];
function mode(){return window._learnModeActive?'learn':'chat';}
function remember(){
 saveDraft();
 const t=$('chatThread'), input=$('appChatInput');if(!t)return;
 slots.set(mode(),{state:Object.fromEntries(stateFields.map(k=>[k,window[k]])),nodes:[...t.childNodes],
  hidden:t.classList.contains('hidden'),welcome:$('welcomeScreen')?.style.display,scroll:t.scrollTop,
  draft:input?.value||'',height:input?.style.height||'',pill:$('appImagePill')?.getAttribute('class')||'',
  pillDisplay:$('appImagePill')?.style.display,pillName:$('appImagePillName')?.textContent,pillThumb:$('appImagePillThumb')?.src});
}
function restore(target){
 const slot=slots.get(target);if(!slot){const input=$('appChatInput');input.value='';input.style.height='';return;}
 for(const k of stateFields)window[k]=slot.state[k];
 document.body.classList.toggle('knox-learn-mode',target==='learn');
 const t=$('chatThread');t.replaceChildren(...slot.nodes);t.classList.toggle('hidden',slot.hidden);
 $('welcomeScreen').style.display=slot.welcome;
 const input=$('appChatInput');input.value=slot.draft;input.style.height=slot.height;
 const pill=$('appImagePill');pill.className=slot.pill;pill.style.display=slot.pillDisplay||'none';
 $('appImagePillName').textContent=slot.pillName||'';$('appImagePillThumb').src=slot.pillThumb||'';
 requestAnimationFrame(()=>{t.scrollTop=slot.scroll;});window.syncActiveHistoryRows?.();
}
const icons={chat:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.4 8.4 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z"/>',learn:'<path d="M12 7v14M3 3h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v17h-5a4 4 0 0 0-4 1 4 4 0 0 0-4-1H3Z"/>',flashcards:'<rect x="6" y="6" width="15" height="15" rx="3"/><path d="M17 3H6a3 3 0 0 0-3 3v11M10 11h7M10 15h5"/>',calculator:'<rect x="5" y="2" width="14" height="20" rx="4"/><path d="M9 7h6M9 12h.01M15 12h.01M9 17h.01M15 17h.01"/>'};
icons.home='<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>';
icons.account='<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>';
const pages=window.createKnoxMobilePages({navigate,note,dialog,button,icon:icons});

// App header on every tab: logo, the tab's name, streak flame and profile. It
// takes each screen's own background, so the top (and the status bar) blends in.
const bar=document.createElement('header');bar.className='km-appbar';
bar.innerHTML='<span class="km-brand"><img class="km-logo" src="/knox-logo-square.jpg" alt=""><b data-appbar-title>Knox Knows</b></span><span class="km-top-right"><button type="button" class="km-flame-pill km-press" data-action="streak" aria-label="Your streak"><span class="knox-flame" aria-hidden="true">🔥</span><b data-streak-count>0</b></button><button type="button" class="km-top-avatar km-press" data-go="account" aria-label="You" data-avatar>K</button><button type="button" class="km-bar-action" data-study-action="history" aria-label="Open study history" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></svg></button><button type="button" class="km-bar-action" data-study-action="new" aria-label="New chat" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></span>';
document.body.prepend(bar);
// Full screen: the header is gone. Ask/Learn keep History and New as two small
// floating buttons; Home shows the logo, flame and profile in the page itself.
const float=document.createElement('div');float.className='km-float';float.append(...bar.querySelectorAll('[data-study-action]'));document.body.append(float);
const strip=document.createElement('div');strip.className='km-statusfill';strip.setAttribute('aria-hidden','true');document.body.prepend(strip);
const onBar=e=>{const action=e.target.closest('[data-study-action]')?.dataset.studyAction;if(action==='new')newStudy();else if(action==='history')window.openMobileHistory?.();else pages.action(e);};
bar.addEventListener('click',onBar);float.addEventListener('click',onBar);
const TITLES={home:'Knox Knows',chat:'Ask Knox',learn:'Learn',flashcards:'Flashcards',calculator:'Calculator',account:'You'};
let themeMeta=document.querySelector('meta[name="theme-color"]');
function paint(){
 const surface=current==='home'?$('knoxMobileHome'):current==='account'?$('knoxMobileAccount'):current==='flashcards'?$('flashcardsPanel'):$('chatAndInput')||$('mainColumn');
 let el=surface,bg='';
 while(el){bg=getComputedStyle(el).backgroundColor;if(bg&&!/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(bg))break;el=el.parentElement;bg='';}
 bg=bg||getComputedStyle(document.body).backgroundColor;
 bar.style.background=bg;if(themeMeta)themeMeta.content=bg;document.documentElement.style.setProperty('--km-top',bg);
 bar.querySelector('[data-appbar-title]').textContent=TITLES[current]||'Knox Knows';
 bar.dataset.tab=current;
 const study=['chat','learn'].includes(current);
 float.hidden=!study;float.querySelectorAll('button').forEach(b=>{b.hidden=false;});
 float.querySelector('[data-study-action="new"]').setAttribute('aria-label',current==='learn'?'New lesson':'New chat');
 const drawerNew=document.querySelector('#mobileHistoryDrawer .sidebar-new-btn');if(drawerNew){drawerNew.textContent=current==='learn'?'+ New lesson':'+ New chat';drawerNew.setAttribute('aria-label',current==='learn'?'New lesson':'New chat');}
 bar.querySelector('[data-go="account"]').hidden=study;
 bar.querySelector('[data-action="streak"]').hidden=study||!window.currentUser;
}
window.knoxPaintAppBar=paint;

// Pages that live on the website (updates, privacy, redeem…) open inside the
// app with a close button; there's no browser back button on the home screen.
function openPage(url){
 const sheet=document.createElement('div');sheet.className='km-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
 sheet.innerHTML='<div class="km-sheet-bar"><button type="button" class="km-sheet-close km-press">✕ Close</button></div>';
 const frame=document.createElement('iframe');frame.src=url;frame.title='Knox Knows';sheet.append(frame);
 sheet.querySelector('.km-sheet-close').onclick=()=>sheet.remove();
 document.body.append(sheet);
}
window.knoxOpenPage=openPage;
if(!native){
 window.knoxOpenPlans=()=>pages.openPlans();
 document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');if(!a||a.target==='_blank'&&!/knoxknowsapp\.com/.test(a.href))return;
  const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;
  if(u.pathname==='/about'||u.pathname==='/'||u.pathname==='/index.html'){e.preventDefault();if(u.hash==='#pricing')pages.openPlans();else navigate('home');return;}
  if(/^\/(updates|privacy|terms|refund|redeem|reviews|gift)(\.html)?$/.test(u.pathname)){e.preventDefault();openPage(u.pathname+u.search+u.hash);}
 },true);
}
function surface(target){document.body.classList.toggle('knox-mobile-home',target==='home');document.body.classList.toggle('knox-mobile-account',target==='account');pages.show(target);}
const entryTarget=new URLSearchParams(location.search).get('open');
const initialSurface=entryTarget==='account'?'account':'home';
const deepStudy=['learn','calculator','flashcards'].includes(entryTarget);
window.knoxMobileReveal=()=>{if(document.body.classList.contains('app-auth-pending')&&!deepStudy)return;surface(null);};
const nav=document.createElement('nav');nav.className='knox-app-tabs';nav.setAttribute('aria-label','Main navigation');
for(const [target,label] of [['home','Home'],['chat','Ask'],['learn','Learn'],['flashcards','Cards'],['account','You']]){
 const b=button(nav,label,()=>navigate(target));b.dataset.tab=target;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=icons[target];const tile=document.createElement('span');tile.className='km-tab-tile';tile.append(svg);b.prepend(tile);
}
document.body.append(nav);surface(deepStudy?null:initialSurface);
async function navigate(target){
 if(busy)return false;
 if(target===current){
  // Tapping the tab you're on: jump to the latest message, or if you're there, start fresh.
  if(['chat','learn'].includes(target)){const t=$('chatThread');if(t&&!t.classList.contains('hidden')&&t.scrollHeight-t.scrollTop-t.clientHeight>40)t.scrollTo({top:t.scrollHeight,behavior:'smooth'});else if(window._currentConversationId||(t&&!t.classList.contains('hidden')))newStudy();}
  return true;
 }
 if(cameraBusy || (!['home','account'].includes(target) && ((window._appAskBusy && target!==mode()) || $('appImagePill')?.classList.contains('is-reading')))){note('Let Knox finish this step before switching tabs.');return;}
 busy=true;
 try{
  saveDraft();
  document.activeElement?.blur();window.closeMobileHistory?.();window.closeUserDropdown?.();
  if(target==='home'||target==='account'){window.knoxFlashcardsMobile?.hide();surface(target);sync();quiet(p.haptics.selectionChanged());return true;}
  if(target==='flashcards'){
   if(!window.knoxFlashcardsMobile){note('Flashcards is still opening. Try again in a moment.');return;}
   window.closeCalc?.();if(!(await window.knoxFlashcardsMobile.show()))return;
  }else{
   window.knoxFlashcardsMobile?.hide();
   if(target==='calculator')window.openCalc?.();
   else{
    window.closeCalc?.();
    if(mode()!==target){remember();if(target==='learn')window.openLearnMode?.();else window.appStartNewChat?.();restore(target);}
   }
  }
  surface(null);current=target;sync();quiet(p.haptics.selectionChanged());return true;
 }finally{busy=false;}
}
async function newStudy(){
 if(window._appAskBusy||cameraBusy){note('Let Knox finish this step first.');return;}
 const target=mode(),input=$('appChatInput');
 const start=()=>{drafts.remove(owner,target);slots.delete(target);input.value='';input.style.height='';if(target==='learn')window.openLearnMode?.();else window.appStartNewChat?.();sync();};
 if(input.value.trim()||window._appImage||window._appDoc){const d=dialog('Start a new '+(target==='learn'?'lesson?':'chat?'),'Your saved conversation stays in history. Starting fresh discards the current unsent text and attachment.');button(d,'Keep working',()=>d.close());button(d,'Start fresh',()=>{d.close();start();},'primary');d.showModal();}else start();
}
async function openSaved(id){
 if(busy||window._appAskBusy||cameraBusy){note('Let Knox finish this step first.');return false;}
 const uid=window.currentUser?.uid;if(!uid){window.openAuthModal?.();return false;}
 busy=true;const previous=current,priorMode=mode(),same=id===window._currentConversationId;
 remember();
 try{
  window.knoxFlashcardsMobile?.hide();
  const ok=await window.openConversation(id);
  if(uid!==window.currentUser?.uid)return false;
  if(!ok){restore(priorMode);if(previous==='flashcards')await window.knoxFlashcardsMobile?.show();surface(['home','account'].includes(previous)?previous:null);note('That conversation could not be opened. Your draft is still saved.');return false;}
  const slot=slots.get(priorMode),input=$('appChatInput');input.value=same?slot?.draft||'':'';input.style.height='';draftEdited=false;
  window.closeMobileHistory?.();surface(null);sync();return true;
 }finally{busy=false;}
}
async function resumeDraft(target){
 const uid=window.currentUser?.uid,row=drafts.read(uid,target);if(!row)return;
 if(!(await navigate(target)))return;
 if(uid!==window.currentUser?.uid)return;
 if(row.conversationId&&window._currentConversationId!==row.conversationId){
  if(!(await openSaved(row.conversationId))){note('The saved conversation could not be opened. Your draft is still saved.');return;}
 }else if(!row.conversationId&&window._currentConversationId){if(target==='learn')window.openLearnMode?.();else window.appStartNewChat?.();}
 if(uid!==window.currentUser?.uid)return;
 $('appChatInput').value=row.text;$('appChatInput').dispatchEvent(new Event('input',{bubbles:true}));
 surface(null);sync();
}
function sync(){
 const before=current;
 current=document.body.classList.contains('knox-mobile-home')?'home':document.body.classList.contains('knox-mobile-account')?'account':document.body.classList.contains('knox-flashcards')?'flashcards':$('calcModal')?.classList.contains('open')?'calculator':mode();
 if(current==='calculator'&&before!=='calculator')calculatorReturn=before;
 const back=document.querySelector('#calcModal [data-k="back"]');if(back)back.textContent='← Back to '+({home:'Home',account:'You',chat:'Ask',learn:'Learn',flashcards:'Cards'}[calculatorReturn]||'Home');
 const active=current==='calculator'?'home':current;
 nav.querySelectorAll('button').forEach(b=>{if(b.dataset.tab===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const locked=document.querySelector('.fc-nav.fc-locked');nav.querySelector('[data-tab="flashcards"]').hidden=!!locked;
 if(typeof paint==='function')setTimeout(paint,0);
}
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});sync();
window.addEventListener('knox-auth-changed',()=>{const next=window.currentUser?.uid||'';if(next!==owner){const hadOwner=!!owner;clearTimeout(draftTimer);draftEdited=false;drafts.clear(owner);slots.clear();owner=next;document.querySelectorAll('.knox-native-dialog').forEach(d=>d.close());if(hadOwner||!deepStudy)surface(hadOwner?'home':initialSurface);}sync();});

// "Jump to latest" when you've scrolled up in a chat.
const latest=document.createElement('button');latest.type='button';latest.className='km-latest km-press';latest.hidden=true;latest.setAttribute('aria-label','Jump to the latest message');
latest.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
latest.onclick=()=>{const t=$('chatThread');t?.scrollTo({top:t.scrollHeight,behavior:'smooth'});};document.body.append(latest);
const thread=$('chatThread');
const checkLatest=()=>{latest.hidden=!thread||thread.classList.contains('hidden')||!['chat','learn'].includes(current)||thread.scrollHeight-thread.scrollTop-thread.clientHeight<160;};
thread?.addEventListener('scroll',checkLatest,{passive:true});new MutationObserver(checkLatest).observe(document.body,{attributes:true,attributeFilter:['class']});
const offline=document.createElement('div');offline.className='knox-offline';offline.setAttribute('role','status');offline.hidden=true;offline.textContent='You’re offline. Saved flashcards and the calculator are available. AI needs a connection.';document.body.append(offline);
new ResizeObserver(()=>{const height=offline.getBoundingClientRect().height;if(height)document.documentElement.style.setProperty('--offline-height',height+'px');}).observe(offline);
let wasConnected=navigator.onLine;
const connection=({connected})=>{offline.hidden=!!connected;document.documentElement.classList.toggle('native-offline',!connected);if(connected!==wasConnected){wasConnected=connected;window.dispatchEvent(new Event(connected?'online':'offline'));}};
quiet(p.network.getStatus().then(connection));quiet(p.network.addListener('networkStatusChange',connection));
window.addEventListener('offline',()=>{offline.hidden=false;document.documentElement.classList.add('native-offline');});window.addEventListener('online',()=>{offline.hidden=true;document.documentElement.classList.remove('native-offline');window.knoxRefreshPlan?.();});
if(!native){
 const typing=e=>e.target.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]),textarea,[contenteditable="true"]');
 document.addEventListener('focusin',e=>{if(typing(e))document.documentElement.classList.add('native-keyboard');});
 document.addEventListener('focusout',e=>{if(typing(e))setTimeout(()=>{if(!typing({target:document.activeElement}))document.documentElement.classList.remove('native-keyboard');},60);});
}
for(const event of ['keyboardWillShow','keyboardDidShow'])quiet(p.keyboard.addListener(event,()=>document.documentElement.classList.add('native-keyboard')));
quiet(p.keyboard.addListener('keyboardWillHide',()=>document.documentElement.classList.remove('native-keyboard')));
// The status bar sits over the app header (same color), with light text in Dark mode.
quiet(plugin('StatusBar').setOverlaysWebView?.({overlay:true}));
function chrome(){const dark=document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('knox-seasonal');quiet(p.keyboard.setStyle({style:dark?'DARK':'LIGHT'}));quiet(plugin('StatusBar').setStyle({style:dark?'DARK':'LIGHT'}));setTimeout(paint,0);}
new MutationObserver(chrome).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});chrome();
let resumedAt=0;
quiet(p.app.addListener('appStateChange',({isActive})=>{if(isActive){quiet(p.network.getStatus().then(status=>{connection(status);if(status.connected&&Date.now()-resumedAt>30000){resumedAt=Date.now();quiet(window.knoxRefreshPlan?.());quiet(pages.refreshDecks());}}));window.updateUsageIndicator?.();}else saveDraft();}));
// Keep external web pages outside the trusted local app webview.
if(native)document.addEventListener('click',e=>{
 const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href,location.href),local=new URL(location.href),isLocal=u.protocol===local.protocol&&u.host===local.host;
 if(isLocal && ['/app','/app.html','/index.html','/'].includes(u.pathname)){e.preventDefault();return;}
 if(u.protocol==='https:' || (isLocal && /\/(privacy|terms|refund|reviews|updates)(\.html)?$/.test(u.pathname))){
  e.preventDefault();e.stopImmediatePropagation();const url=isLocal?window.knoxMobileConfig.apiOrigin+u.pathname+u.search+u.hash:u.href;quiet(p.browser.open({url}));
 }
},true);
// The account stays active until the team processes the authenticated request.
// Do not label a queued request as a completed deletion.
if(native)window.knoxRequestAccountDeletion=function(){
 const user=window.currentUser;if(!user)return;
 const d=dialog('Delete your account','This requests deletion of your Knox account and associated personal data. The Knox team processes it manually; it is not instant. Required payment records may be retained. A subscription must also be cancelled to stop future charges. Type DELETE to confirm.');
 const label=document.createElement('label');label.textContent='Confirmation';label.htmlFor='knoxDeleteConfirm';const input=document.createElement('input');input.id='knoxDeleteConfirm';input.autocomplete='off';input.spellcheck=false;label.append(input);d.append(label);
 const status=document.createElement('p');status.setAttribute('role','status');d.append(status);
 const submit=button(d,'Request account deletion',async()=>{
  if(window.currentUser?.uid!==user.uid){d.close();return;}
  submit.disabled=true;
  try{
   const token=await user.getIdToken();
   if(window.currentUser?.uid!==user.uid){d.close();return;}
   const r=await fetch('/api/me?route=support',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'request-account-deletion',confirmation:'DELETE'})});
   const result=await r.json().catch(()=>({}));if(!r.ok || result.status!=='requested' || typeof result.requestId!=='string')throw Error(result.error||'Could not submit your request. Please try again.');
   if(window.currentUser?.uid!==user.uid){d.close();return;}
   status.textContent='Your deletion request is saved. Your account is still active while it is pending. Follow progress in Knox Support → Messages.';input.disabled=true;submit.hidden=true;cancel.textContent='Done';
  }catch(err){status.textContent=err.message||'Could not submit your request. Please try again.';submit.disabled=false;}
 },'danger');submit.disabled=true;input.oninput=()=>{submit.disabled=input.value.trim()!=='DELETE';};const cancel=button(d,'Cancel',()=>d.close());d.showModal();
};
// Splash is also bounded natively; this merely ends it promptly once UI exists.
quiet(p.splash.hide());
document.addEventListener('click',e=>{
 const fresh=e.target.closest('#mobileHistoryDrawer .sidebar-new-btn');if(fresh){e.preventDefault();e.stopImmediatePropagation();window.closeMobileHistory?.();newStudy();return;}
 const row=e.target.closest('#mobileHistoryList .sidebar-history-item[data-conversation-id]');
 if(!row||e.target.closest('button,.shi-menu,[role="menuitem"],input'))return;
 e.preventDefault();e.stopImmediatePropagation();openSaved(row.dataset.conversationId);
},true);
const historyPanel=document.querySelector('#mobileHistoryDrawer .drawer-panel');
if(historyPanel){
 const search=document.createElement('input');search.type='search';search.className='km-history-search';search.placeholder='Find a chat or lesson';search.setAttribute('aria-label','Search study history');
 const body=historyPanel.querySelector('.drawer-body');body?.before(search);
 const filter=()=>{const term=search.value.trim().toLocaleLowerCase();let matches=0;historyPanel.querySelectorAll('.sidebar-history-item').forEach(row=>{const show=!term||row.textContent.toLocaleLowerCase().includes(term);row.hidden=!show;if(show)matches++;});empty.hidden=!term||matches>0;};
 const empty=document.createElement('p');empty.className='km-history-empty';empty.textContent='No matches in loaded history. Try another word or load more.';empty.hidden=true;body?.before(empty);
 search.addEventListener('input',filter);if(body)new MutationObserver(filter).observe(body,{childList:true,subtree:true,characterData:true});
}
window.knoxMobile={navigate,note,saveDraft,openConversation:openSaved,showHome(){surface('home');sync();},
 calculatorBack(){window.closeCalc?.();if(['home','account'].includes(calculatorReturn))surface(calculatorReturn);sync();},
 async calculatorDraft(target,text){if(!(await navigate(target)))return;const input=$('appChatInput');input.value=input.value?input.value+'\n'+text:text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();},refreshHome:pages.render,drafts:()=>drafts.list(owner),resumeDraft,clearDrafts(){drafts.clear(owner);note('Unsent text drafts cleared. Saved chats and decks are unchanged.');pages.render();}};
})();
