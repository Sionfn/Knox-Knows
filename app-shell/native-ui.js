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
function dialog(title,text){const el=document.createElement('dialog');el.className='knox-native-dialog';const h=document.createElement('h2');h.textContent=title;const body=document.createElement('p');body.textContent=text;el.append(h,body);document.body.append(el);el.addEventListener('close',()=>el.remove(),{once:true});return el;}
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
// On the website, iPhone's own file menu already offers Take Photo / Photo Library.
if(native)document.addEventListener('click',e=>{
 const target=e.target.closest('button[onclick*="appFileInput"],button[data-action="doc-pick"]');
 if(target){e.preventDefault();e.stopImmediatePropagation();attachments(target.dataset.action==='doc-pick');}
},true);

// Ask and Learn share a renderer. Retain the actual message nodes (and their
// listeners), draft, attachment and lesson state when switching between them.
const slots=new Map();let owner=window.currentUser?.uid||'', busy=false, current='home';
const stateFields=['_conversation','_currentConversationId','_learnSessionId','_learnSource','_learnStyle','_appImage','_appDoc','_fbPayloads','_appRenewLearn'];
function mode(){return window._learnModeActive?'learn':'chat';}
function remember(){
 const t=$('chatThread'), input=$('appChatInput');if(!t)return;
 slots.set(mode(),{state:Object.fromEntries(stateFields.map(k=>[k,window[k]])),nodes:[...t.childNodes],
  hidden:t.classList.contains('hidden'),welcome:$('welcomeScreen')?.style.display,scroll:t.scrollTop,
  draft:input?.value||'',height:input?.style.height||'',pill:$('appImagePill')?.getAttribute('class')||'',
  pillDisplay:$('appImagePill')?.style.display,pillName:$('appImagePillName')?.textContent,pillThumb:$('appImagePillThumb')?.src});
}
function restore(target){
 const slot=slots.get(target);if(!slot)return;
 for(const k of stateFields)window[k]=slot.state[k];
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
 if(busy || target===current)return;
 if(!['home','account'].includes(target) && ((window._appAskBusy && target!==mode()) || cameraBusy || $('appImagePill')?.classList.contains('is-reading'))){note('Let Knox finish this step before switching tabs.');return;}
 busy=true;
 try{
  document.activeElement?.blur();window.closeMobileHistory?.();window.closeUserDropdown?.();
  if(target==='home'||target==='account'){window.knoxFlashcardsMobile?.hide();surface(target);sync();quiet(p.haptics.selectionChanged());return;}
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
  surface(null);current=target;sync();quiet(p.haptics.selectionChanged());
 }finally{busy=false;}
}
function sync(){
 current=document.body.classList.contains('knox-mobile-home')?'home':document.body.classList.contains('knox-mobile-account')?'account':document.body.classList.contains('knox-flashcards')?'flashcards':$('calcModal')?.classList.contains('open')?'calculator':mode();
 const active=current==='calculator'?'home':current;
 nav.querySelectorAll('button').forEach(b=>{if(b.dataset.tab===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const locked=document.querySelector('.fc-nav.fc-locked');nav.querySelector('[data-tab="flashcards"]').hidden=!!locked;
}
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});sync();
window.addEventListener('knox-auth-changed',()=>{const next=window.currentUser?.uid||'';if(next!==owner){const hadOwner=!!owner;slots.clear();owner=next;document.querySelectorAll('.knox-native-dialog').forEach(d=>d.close());if(hadOwner||!deepStudy)surface(hadOwner?'home':initialSurface);}sync();});

const offline=document.createElement('div');offline.className='knox-offline';offline.setAttribute('role','status');offline.hidden=true;offline.textContent='You’re offline. Saved flashcards and the calculator are available. AI needs a connection.';$('appHeader')?.after(offline);
const connection=({connected})=>{offline.hidden=!!connected;if(connected)window.dispatchEvent(new Event('online'));};
quiet(p.network.getStatus().then(connection));quiet(p.network.addListener('networkStatusChange',connection));
window.addEventListener('offline',()=>{offline.hidden=false;});window.addEventListener('online',()=>{offline.hidden=true;window.knoxRefreshPlan?.();});
if(!native){
 const typing=e=>e.target.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]),textarea,[contenteditable="true"]');
 document.addEventListener('focusin',e=>{if(typing(e))document.documentElement.classList.add('native-keyboard');});
 document.addEventListener('focusout',e=>{if(typing(e))setTimeout(()=>{if(!typing({target:document.activeElement}))document.documentElement.classList.remove('native-keyboard');},60);});
}
for(const event of ['keyboardWillShow','keyboardDidShow'])quiet(p.keyboard.addListener(event,()=>document.documentElement.classList.add('native-keyboard')));
quiet(p.keyboard.addListener('keyboardWillHide',()=>document.documentElement.classList.remove('native-keyboard')));
function chrome(){const dark=document.documentElement.dataset.theme==='dark'&&!document.documentElement.classList.contains('knox-seasonal');quiet(p.keyboard.setStyle({style:dark?'DARK':'LIGHT'}));quiet(plugin('StatusBar').setStyle({style:'DARK'}));}
new MutationObserver(chrome).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});chrome();
quiet(p.app.addListener('appStateChange',({isActive})=>{if(isActive){quiet(p.network.getStatus().then(connection));window.updateUsageIndicator?.();}else $('appChatInput')?.dispatchEvent(new Event('change'));}));
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
window.knoxMobile={navigate,note,refreshHome:pages.render};
})();
