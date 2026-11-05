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
function dismissKeyboard(){document.activeElement?.blur();quiet(p.keyboard.hide?.());}
const mediaViewport=()=>{const v=window.visualViewport;document.documentElement.style.setProperty('--km-media-height',(v?.height||innerHeight)+'px');document.documentElement.style.setProperty('--km-media-top',(v?.offsetTop||0)+'px');};
window.visualViewport?.addEventListener('resize',mediaViewport);window.visualViewport?.addEventListener('scroll',mediaViewport);addEventListener('resize',mediaViewport);mediaViewport();
async function takePhoto(source,intoCards=false){
 if(cameraBusy||window._appAskBusy){note('Let Knox finish this step before adding a photo.');return;}cameraBusy=true;dismissKeyboard();
 const uid=window.currentUser?.uid, version=window._appViewVersion;
 try{
  const photo=await p.camera.getPhoto({source,resultType:'uri',quality:85,width:2200,height:2200,correctOrientation:true});
  if(uid!==window.currentUser?.uid || version!==window._appViewVersion)return;
  const blob=await (await fetch(photo.webPath)).blob();
  if(uid!==window.currentUser?.uid || version!==window._appViewVersion)return;
  const type=blob.type||'image/jpeg',ext=type==='image/png'?'png':type==='image/webp'?'webp':'jpg';
  const file=new File([blob],'Knox photo.'+ext,{type});
  if(intoCards)await window.knoxFlashcardsMobile?.addFiles([file]);else await window.handleImageFile?.(file);
 }catch(err){if(!/cancel|dismiss/i.test(err?.message||''))note('Could not open photos. Check Knox’s camera/photo access in iPhone Settings.');}
 finally{cameraBusy=false;}
}
function attachments(intoCards=false){
 const d=dialog('Add your notes','Take a photo, choose a picture, or open a document from Files.');
 button(d,'Take photo',()=>{d.close();takePhoto('CAMERA',intoCards);});
 button(d,'Photo library',()=>{d.close();takePhoto('PHOTOS',intoCards);});
 button(d,'Choose file',()=>{d.close();if(intoCards)$('fcDocInput')?.click();else pick($('appFileInput'));});
 button(d,'Cancel',()=>d.close());d.showModal();
}
// The camera button opens the camera right away (like other apps); the paperclip
// next to it is for the photo library and files.
const webCamera=document.createElement('input');webCamera.type='file';webCamera.accept='image/*';webCamera.setAttribute('capture','environment');webCamera.hidden=true;
const pickerTickets=new WeakMap();
function pick(input){dismissKeyboard();if(!input)return;pickerTickets.set(input,{uid:window.currentUser?.uid||'',view:window._appViewVersion});input.click();}
function selected(input){const f=input.files?.[0],ticket=pickerTickets.get(input);input.value='';pickerTickets.delete(input);if(f&&ticket&&ticket.uid===(window.currentUser?.uid||'')&&ticket.view===window._appViewVersion)window.handleImageFile?.(f);}
webCamera.onchange=()=>selected(webCamera);document.body.append(webCamera);
// Photo library (no camera) for the home-screen version.
const webPhotos=document.createElement('input');webPhotos.type='file';webPhotos.accept='image/*';webPhotos.hidden=true;
webPhotos.onchange=()=>selected(webPhotos);document.body.append(webPhotos);
$('appFileInput')?.addEventListener('change',e=>{const input=e.currentTarget,ticket=pickerTickets.get(input);pickerTickets.delete(input);if(ticket&&(ticket.uid!==(window.currentUser?.uid||'')||ticket.view!==window._appViewVersion)){input.value='';e.stopImmediatePropagation();}},true);
const SVG=d=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const PIC={x:'<path d="M18 6 6 18M6 6l12 12"/>',photos:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>',file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>',crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2"/>',calc:'<rect x="5" y="2" width="14" height="20" rx="4"/><path d="M9 7h6M9 12h.01M15 12h.01M9 17h.01M15 17h.01"/>',plus:'<path d="M12 5v14M5 12h14"/>'};
// Camera (home-screen version): a full-screen viewfinder like other study apps.
// Aim the frame at one question and snap; Knox then pre-selects it for the crop
// step (extras.js). Without a live camera, the phone's own camera picker opens.
let cam=null;
async function viewfinder(){
 if(cam||cameraBusy)return;if(window._appAskBusy){note('Let Knox finish this step before opening the camera.');return;}dismissKeyboard();
 const owner=window.currentUser?.uid||'',version=window._appViewVersion,previous=document.activeElement;let closed=false,capturing=false;const active=()=>!closed&&owner===(window.currentUser?.uid||'')&&version===window._appViewVersion;
let target=current==='learn'?'learn':'chat',stream=null;
 const el=document.createElement('dialog');el.className='km-cam';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Snap a question');
 el.innerHTML='<video playsinline muted autoplay></video><div class="km-cam-shade" aria-hidden="true"></div><div class="km-cam-frame" aria-hidden="true"><i data-c="nw"></i><i data-c="ne"></i><i data-c="sw"></i><i data-c="se"></i><span class="km-cam-scan"></span></div><span class="km-cam-focus" aria-hidden="true"></span>'+
  '<div class="km-cam-top"><div class="km-cam-topbar"><button type="button" class="km-cam-x" data-cam="close" aria-label="Close camera">'+SVG(PIC.x)+'</button><button type="button" class="km-cam-crop" data-cam="crop" aria-pressed="true">'+SVG(PIC.crop)+'<span>Crop on</span></button><button type="button" class="km-cam-sys" data-cam="system">'+SVG(PIC.camera)+'Device camera</button></div><span class="km-cam-hint">Opening camera…</span></div>'+
  '<div class="km-cam-off" hidden><b>Camera isn’t available</b><span>Allow camera access for this site in Settings, or use your phone’s camera instead.</span><button type="button" data-cam="system">Open camera</button></div>'+
  '<div class="km-cam-bottom"><div class="km-cam-modes" role="group" aria-label="How Knox helps">'+[['chat','Ask Knox'],['learn','Learn']].map(([id,l])=>'<button type="button" data-cam-mode="'+id+'" aria-pressed="'+(id===target)+'">'+l+'</button>').join('')+'</div>'+
  '<div class="km-cam-row"><button type="button" class="km-cam-side" data-cam="photos" aria-label="Choose from Photos">'+SVG(PIC.photos)+'<small>Photos</small></button><button type="button" class="km-cam-shutter" data-cam="snap" aria-label="Take the photo" disabled><span></span></button><button type="button" class="km-cam-side" data-cam="file" aria-label="Upload a file">'+SVG(PIC.file)+'<small>File</small></button></div></div>';
 document.body.append(el);
 const video=el.querySelector('video'),stop=()=>{if(closed)return;closed=true;stream?.getTracks().forEach(t=>t.stop());stream=null;el.close();el.remove();if(cam?.el===el)cam=null;document.removeEventListener('visibilitychange',vis);removeEventListener('knox-auth-changed',stop);removeEventListener('popstate',stop);removeEventListener('resize',place);frameResize.disconnect();el.removeEventListener('keydown',cameraKey);if(previous?.isConnected&&owner===(window.currentUser?.uid||'')&&!previous.matches('input,textarea'))previous.focus?.({preventScroll:true});};
 el.addEventListener('cancel',e=>{e.preventDefault();stop();});el.showModal();
 // The frame: drag it to move it, drag a corner to resize it.
 const fr=el.querySelector('.km-cam-frame');let box=null,drag=null,adjusted=false;
 // Crop on: aim the box at one question. Crop off: Knox gets the whole picture.
 let cropOn=true;try{cropOn=localStorage.getItem('knoxCamCrop')!=='off';}catch{}
 const hintText=()=>cropOn?'Fit one question in the box · drag corners to resize':'Crop is off · Knox reads the whole picture';
 const showCrop=()=>{el.classList.toggle('no-crop',!cropOn);const t=el.querySelector('[data-cam="crop"]');t.setAttribute('aria-pressed',String(cropOn));t.querySelector('span').textContent=cropOn?'Crop on':'Crop off';if(!el.querySelector('[data-cam="snap"]').disabled)el.querySelector('.km-cam-hint').textContent=hintText();};
 const bounds=()=>({l:10,r:el.clientWidth-10,t:el.querySelector('.km-cam-top').getBoundingClientRect().bottom+10,b:el.querySelector('.km-cam-bottom').getBoundingClientRect().top-12});
 function place(){
  const B=bounds();if(B.r<=B.l||B.b<=B.t){fr.hidden=true;return;}fr.hidden=false;if(!box||!adjusted){const w=Math.min(el.clientWidth*.86,520),h=Math.min((B.b-B.t)*.62,w*.72);box={x:(el.clientWidth-w)/2,y:B.t+(B.b-B.t-h)/2,w,h};}
  box.w=Math.min(Math.max(box.w,90),B.r-B.l);box.h=Math.min(Math.max(box.h,70),B.b-B.t);
  box.x=Math.min(Math.max(box.x,B.l),B.r-box.w);box.y=Math.min(Math.max(box.y,B.t),B.b-box.h);
  Object.assign(fr.style,{left:box.x+'px',top:box.y+'px',width:box.w+'px',height:box.h+'px'});
 }
 const frameResize=new ResizeObserver(place);frameResize.observe(el);place();showCrop();addEventListener('resize',place);
 fr.addEventListener('pointerdown',e=>{e.preventDefault();if(!box)place();try{fr.setPointerCapture(e.pointerId);}catch{}drag={c:e.target.closest('i')?.dataset.c||'move',x:e.clientX,y:e.clientY,b:{...box},moved:false};el.classList.add('adjusting');});
 fr.addEventListener('pointermove',e=>{
  if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y,o=drag.b,c=drag.c;if(Math.abs(dx)+Math.abs(dy)>6){drag.moved=true;adjusted=true;}box={...o};
  if(c==='move'){box.x=o.x+dx;box.y=o.y+dy;}
  else{
   if(c.includes('w')){box.w=Math.max(90,o.w-dx);box.x=o.x+o.w-box.w;}if(c.includes('e'))box.w=o.w+dx;
   if(c.includes('n')){box.h=Math.max(70,o.h-dy);box.y=o.y+o.h-box.h;}if(c.includes('s'))box.h=o.h+dy;
  }
  place();
 });
 const endDrag=e=>{if(drag&&!drag.moved&&e.type==='pointerup')focusAt(e.clientX,e.clientY);drag=null;el.classList.remove('adjusting');};
 fr.addEventListener('pointerup',endDrag);fr.addEventListener('pointercancel',endDrag);
 // Tap to focus, where the phone's browser allows it.
 let caps={};
 function focusAt(x,y){
  const track=stream?.getVideoTracks()[0];if(!track||!(caps.focusMode?.includes('single-shot')||caps.pointsOfInterest))return;
  const r=video.getBoundingClientRect();
  track.applyConstraints({advanced:[{pointsOfInterest:[{x:(x-r.left)/r.width,y:(y-r.top)/r.height}],focusMode:'single-shot'}]}).catch(()=>{});
  setTimeout(()=>{if(active()&&caps.focusMode?.includes('continuous'))track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});},1500);
  const ring=el.querySelector('.km-cam-focus');ring.style.left=x+'px';ring.style.top=y+'px';ring.classList.remove('on');void ring.offsetWidth;ring.classList.add('on');
 }
 video.addEventListener('click',e=>focusAt(e.clientX,e.clientY));
 const vis=()=>{if(document.visibilityState==='hidden')stop();};
 cam={el,stop};document.addEventListener('visibilitychange',vis);addEventListener('knox-auth-changed',stop);addEventListener('popstate',stop);
 const cameraKey=e=>{if(e.key==='Escape'){e.preventDefault();stop();}else if(e.key==='Tab'){const buttons=[...el.querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length);if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0]?.focus();}}};
 el.addEventListener('keydown',cameraKey);el.querySelector('[data-cam="close"]').focus({preventScroll:true});el.dataset.mode=target;
 const go=async()=>{if(owner!==(window.currentUser?.uid||'')||version!==window._appViewVersion)return false;if(target!==current&&!(await navigate(target)))return false;return owner===(window.currentUser?.uid||'');};
 el.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.camMode){target=b.dataset.camMode;el.querySelectorAll('[data-cam-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));el.dataset.mode=target;return;}
  const a=b.dataset.cam;
  if(a==='close'){stop();return;}
  if(a==='crop'){cropOn=!cropOn;try{localStorage.setItem('knoxCamCrop',cropOn?'on':'off');}catch{}showCrop();return;}
  if(a==='photos'){stop();if(await go())pick(webPhotos);return;}
  if(a==='file'){stop();if(await go())pick($('appFileInput'));return;}
  if(a==='system'){stop();if(await go())pick(webCamera);return;}
  if(a!=='snap'||!video.videoWidth||capturing||!active())return;capturing=true;b.disabled=true;
  // Where the frame sits on the (cover-fitted) video, in the photo's own coordinates.
  const vw=video.videoWidth,vh=video.videoHeight,r=video.getBoundingClientRect(),f=el.querySelector('.km-cam-frame').getBoundingClientRect();
  const frame=window.knoxStudyModel.cameraFrame(vw,vh,r,f);
  let blob;
  try{
   const c=document.createElement('canvas'),scale=Math.min(1,2200/Math.max(vw,vh));
   c.width=Math.max(1,Math.round(vw*scale));c.height=Math.max(1,Math.round(vh*scale));
   c.getContext('2d').drawImage(video,0,0,c.width,c.height);
   el.classList.add('flash');quiet(p.haptics.selectionChanged());
   blob=await new Promise(res=>c.toBlob(res,'image/jpeg',.9));
  }catch{}
  if(!active())return;if(!blob){el.classList.remove('flash');capturing=false;b.disabled=false;note('Could not take that photo. Try again or choose Photos.');return;}stop();
  if(!(await go()))return;
  await window.handleImageFile?.(new File([blob],'Knox photo.jpg',{type:'image/jpeg'}),undefined,undefined,cropOn&&frame?{frame}:{skip:true});
 });
 // iPhones with 2 or 3 back cameras give websites the main lens, which can't
 // focus up close on paper. Their combined "Dual Wide"/"Triple" camera swaps
 // lenses for close-ups like the Camera app does, so use it when there is one.
 const size={width:{ideal:2560},height:{ideal:1920}},PREF='knoxCamDevice';
 const open=async id=>{if(!active())throw Error('Camera closed');const next=await navigator.mediaDevices.getUserMedia({audio:false,video:id?{deviceId:{exact:id},...size}:{facingMode:{ideal:'environment'},...size}});if(!active()){next.getTracks().forEach(t=>t.stop());throw Error('Camera closed');}return next;};
 const rank=label=>/triple/i.test(label)?3:/dual wide/i.test(label)?2:/dual/i.test(label)?1:0;
 try{
  let saved=null;try{saved=localStorage.getItem(PREF);}catch{}
  if(saved){try{stream=await open(saved);}catch{saved=null;try{localStorage.removeItem(PREF);}catch{}}}
  if(!stream)stream=await open(null);
  if(!saved&&cam?.el===el){
   const best=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'&&rank(d.label)).sort((a,b)=>rank(b.label)-rank(a.label))[0];
   if(!active()){stream?.getTracks().forEach(t=>t.stop());return;}
   if(best&&best.deviceId!==stream.getVideoTracks()[0]?.getSettings?.().deviceId){
    stream.getTracks().forEach(t=>t.stop());stream=null;
    try{stream=await open(best.deviceId);try{localStorage.setItem(PREF,best.deviceId);}catch{}}catch{stream=await open(null);}
   }
  }
 }catch{stream?.getTracks().forEach(t=>t.stop());stream=null;if(cam?.el===el){el.querySelector('.km-cam-off').hidden=false;el.classList.add('off');}return;}
 if(cam?.el!==el){stream.getTracks().forEach(t=>t.stop());return;}
 const ready=()=>{if(active()){el.querySelector('[data-cam="snap"]').disabled=false;el.querySelector('.km-cam-hint').textContent=hintText();}};video.addEventListener('loadeddata',ready,{once:true});
 const track=stream.getVideoTracks()[0];caps=track?.getCapabilities?.()||{};
 if(caps.focusMode?.includes('continuous'))track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
 video.srcObject=stream;video.play().then(ready).catch(()=>{if(active()){el.querySelector('.km-cam-off').hidden=false;el.classList.add('off');}});
}
const liveCamera=()=>!native&&!!navigator.mediaDevices?.getUserMedia;
function openCamera(){if(native)takePhoto('CAMERA');else if(liveCamera())viewfinder();else pick(webCamera);}
window.knoxOpenCamera=openCamera;
document.addEventListener('click',e=>{
 const target=e.target.closest('button[onclick*="appFileInput"],button[data-action="doc-pick"]');
 if(!target)return;
 if(target.dataset.action==='doc-pick'){if(native){e.preventDefault();e.stopImmediatePropagation();attachments(true);}return;}
 e.preventDefault();e.stopImmediatePropagation();openCamera();
},true);
// Typing bar: one "+" opens camera, photos, files and the calculator, so the
// box has room to type (the big orange Snap button is always one tap away too).
function addMenu(){
 document.querySelector('.km-add')?.close();dismissKeyboard();
 const ticket={uid:window.currentUser?.uid||'',view:window._appViewVersion},previous=document.activeElement;
 const sheet=document.createElement('dialog');sheet.className='km-add';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','Add to your question');
 const rows=[['camera','orange','Take a photo','Snap one question'],['photos','green','Photo library','Pick a picture you already took'],['file','blue','Upload a file','PDF, Word or PowerPoint'],['calc','purple','Calculator','Work out the numbers']];
 sheet.innerHTML='<div class="km-add-panel"><span class="km-add-grab" aria-hidden="true"></span><h2>Add to your question</h2>'+rows.map(([id,c,t,d])=>'<button type="button" class="km-press" data-add="'+id+'" data-color="'+c+'"><span class="km-add-icon">'+SVG(PIC[id])+'</span><span><b>'+t+'</b><small>'+d+'</small></span></button>').join('')+'<button type="button" class="km-add-cancel" data-add="close">Cancel</button></div>';
 const close=()=>{sheet.close();};
 sheet.addEventListener('close',()=>{removeEventListener('knox-auth-changed',close);sheet.remove();if(!document.querySelector('dialog[open]')&&previous?.isConnected&&ticket.uid===(window.currentUser?.uid||'')&&ticket.view===window._appViewVersion)previous.focus?.({preventScroll:true});},{once:true});addEventListener('knox-auth-changed',close);
 sheet.addEventListener('cancel',e=>{e.preventDefault();close();});
 sheet.addEventListener('click',e=>{
  if(e.target===sheet){close();return;}
  const a=e.target.closest('[data-add]')?.dataset.add;if(!a)return;const valid=ticket.uid===(window.currentUser?.uid||'')&&ticket.view===window._appViewVersion;close();if(!valid)return;
  if(a==='camera')openCamera();
  else if(a==='photos'){if(native)takePhoto('PHOTOS');else pick(webPhotos);}
  else if(a==='file')pick($('appFileInput'));
  else if(a==='calc')navigate('calculator');
 });
 sheet.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 document.body.append(sheet);sheet.showModal();sheet.querySelector('[data-add="camera"]').focus({preventScroll:true});
}
// Sign-in (app only): Google, Apple and Microsoft at the top of one screen that
// both signs in and creates accounts, then email underneath. The website keeps
// its own layout until the December update.
{const body=document.querySelector('#authModal .auth-body'),social=$('authSocialButtons'),divider=$('authSocialDivider'),tabs=$('authTabs');
 if(body&&social&&divider&&tabs){
  for(const id of ['authError','authSuccess']){const el=$(id);if(el)body.prepend(el);}
  tabs.before(social);tabs.before(divider);divider.textContent='or use your email';
  const google=social.querySelector('[onclick*="Google"]'),apple=$('authAppleBtn'),ms=$('authMicrosoftBtn');[google,apple,ms].forEach(b=>b&&social.append(b));
  const up=$('authSignupTab');if(up)up.textContent='Create account';
 }}
// Sign-in sheet: a close button, and keyboard focus stays inside it while open
// (Escape already closes it), then goes back to where it was.
{const modal=$('authModal'),header=modal?.querySelector('.auth-header');
 if(modal&&header&&!modal.querySelector('.km-auth-close')){
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','authHeaderTitle');
  const x=document.createElement('button');x.type='button';x.className='km-auth-close';x.setAttribute('aria-label','Close sign-in');x.textContent='×';x.onclick=()=>window.closeAuthModal?.();header.append(x);
  const controls=()=>[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')].filter(el=>el.getClientRects().length);
  modal.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const all=controls(),first=all[0],last=all.at(-1);if(!first)return;
   if(!modal.contains(document.activeElement)){e.preventDefault();first.focus();}
   else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
  let back=null;const open=window.openAuthModal,close=window.closeAuthModal;
  if(typeof open==='function')window.openAuthModal=function(){back=document.activeElement;const r=open.apply(this,arguments);requestAnimationFrame(()=>{if(!modal.contains(document.activeElement))x.focus({preventScroll:true});});return r;};
  if(typeof close==='function')window.closeAuthModal=function(){const was=modal.style.display!=='none';const r=close.apply(this,arguments);if(was&&back?.isConnected&&!back.matches('input,textarea'))back.focus?.({preventScroll:true});back=null;return r;};
 }}
// Ask and Learn start screens: Knox floats above the heading.
{const badge=$('welcomeScreen')?.querySelector(':scope > .welcome-badge');if(badge&&!$('welcomeScreen').querySelector('.km-welcome-fox')){const fox=document.createElement('img');fox.className='km-welcome-fox';fox.src='/knox-logo-square.jpg';fox.alt='';badge.before(fox);}}
// Ask and Learn start screens fit without a little scroll: measure the real
// space (the notch and home bar take some) and tighten the gaps only if needed.
{const ws=$('welcomeScreen'),R=document.documentElement;let soon=0;
 const fit=()=>{if(!ws||!ws.offsetParent||R.classList.contains('km-typing')||R.classList.contains('native-keyboard'))return;
  R.classList.remove('km-fit1','km-fit2');const over=()=>ws.scrollHeight>ws.clientHeight+1;
  if(over()){R.classList.add('km-fit1');if(over())R.classList.add('km-fit2');}
  if(!over())ws.scrollTop=0;};
 const later=()=>{clearTimeout(soon);soon=setTimeout(fit,50);};
 window.knoxFitWelcome=fit;addEventListener('resize',later);
 if(ws)new MutationObserver(later).observe(ws,{childList:true,subtree:true,characterData:true});
 new MutationObserver(later).observe(document.body,{attributes:true,attributeFilter:['class']});
 later();}
$('appChatInput')?.setAttribute('enterkeyhint','enter');
// Tapping into the box on an empty Ask/Learn tucks the topic buttons away (native.css).
{const box=$('appChatInput'),R=document.documentElement;let off=0;
 // Tapping in folds the topic buttons away in one smooth motion (native.css); Done unfolds them.
 // While folded away the topic buttons can't be reached with the keyboard either.
 const grid=()=>$('welcomeScreen')?.querySelector('.suggestion-grid');
 box?.addEventListener('focus',()=>{clearTimeout(off);R.classList.add('km-typing');const g=grid();if(g)g.inert=true;});
 box?.addEventListener('blur',()=>{off=setTimeout(()=>{R.classList.remove('km-typing');const g=grid();if(g)g.inert=false;},0);});}
const inputBox=$('inputBox');
if(inputBox&&!inputBox.querySelector('.km-plus')){
 const plus=document.createElement('button');plus.type='button';plus.className='km-plus km-press';plus.setAttribute('aria-label','Add a photo, file or calculator');plus.innerHTML=SVG(PIC.plus);
 plus.onclick=addMenu;inputBox.prepend(plus);
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
const pages=window.createKnoxMobilePages({navigate,note,dialog,button,icon:icons,pickStudyFile:()=>pick($('appFileInput'))});

// App header on every tab: logo, the tab's name, streak flame and profile. It
// takes each screen's own background, so the top (and the status bar) blends in.
const bar=document.createElement('header');bar.className='km-appbar';
bar.innerHTML='<span class="km-brand"><img class="km-logo" src="/knox-logo-square.jpg" alt=""><b data-appbar-title>Knox Knows</b></span><span class="km-top-right"><button type="button" class="km-flame-pill km-press" data-action="streak" aria-label="Your streak"><span class="knox-flame" aria-hidden="true">🔥</span><b data-streak-count>0</b></button><button type="button" class="km-top-avatar km-press" data-go="account" aria-label="You" data-avatar>K</button><button type="button" class="km-bar-action" data-study-action="history" aria-label="Open study history" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></svg></button><button type="button" class="km-bar-action" data-study-action="new" aria-label="New chat" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></span>';
document.body.prepend(bar);
// Full screen: the header is gone. Ask/Learn keep History and New as two small
// floating buttons; Home shows the logo, flame and profile in the page itself.
const float=document.createElement('div');float.className='km-float';float.append(...bar.querySelectorAll('[data-study-action]'));document.body.append(float);
// Top left in Ask / Learn: which mode you're in; tap to go Home.
const topFade=document.createElement('div');topFade.className='km-top-fade';topFade.setAttribute('aria-hidden','true');topFade.hidden=true;document.body.append(topFade);
const modeChip=document.createElement('button');modeChip.type='button';modeChip.className='km-mode-chip km-press';modeChip.hidden=true;
modeChip.innerHTML='<img src="/knox-logo-square.jpg" alt=""><b data-mode-label>Ask Knox</b>';modeChip.setAttribute('aria-label','Back to Home');
modeChip.onclick=()=>navigate('home');document.body.append(modeChip);
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
 document.documentElement.style.setProperty('--km-page',bg); // the page itself, for the island's backing

 bar.style.background=bg;if(themeMeta)themeMeta.content=bg;document.documentElement.style.setProperty('--km-top',bg);
 bar.querySelector('[data-appbar-title]').textContent=TITLES[current]||'Knox Knows';
 bar.dataset.tab=current;
 const study=['chat','learn'].includes(current);
 float.hidden=!study;float.querySelectorAll('button').forEach(b=>{b.hidden=false;});
 modeChip.hidden=!study;topFade.hidden=!study;modeChip.dataset.mode=current;modeChip.querySelector('[data-mode-label]').textContent=current==='learn'?'Learn':'Ask Knox';
 float.querySelector('[data-study-action="new"]').setAttribute('aria-label',current==='learn'?'New lesson':'New chat');
 const drawerNew=document.querySelector('#mobileHistoryDrawer .sidebar-new-btn');if(drawerNew){drawerNew.textContent=current==='learn'?'+ New lesson':'+ New chat';drawerNew.setAttribute('aria-label',current==='learn'?'New lesson':'New chat');}
 document.documentElement.classList.toggle('km-hist-learn',current==='learn');
 bar.querySelector('[data-go="account"]').hidden=study;
 bar.querySelector('[data-action="streak"]').hidden=study||!window.currentUser;
}
window.knoxPaintAppBar=paint;
{let soon=0;const again=()=>{clearTimeout(soon);soon=setTimeout(paint,40);};for(const id of ['flashcardsPanel','welcomeScreen','calcModal'])if($(id))new MutationObserver(again).observe($(id),{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden']});}

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
// Home · Ask · 📷 Snap (raised, like other study apps) · Learn · Cards. You is the
// profile picture on Home.
icons.camera='<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3.5"/>';
// The live viewfinder lets you pick Ask or Learn after snapping; other cameras open from Ask.
async function snap(){if(liveCamera()){viewfinder();return;}if(await navigate(current==='learn'?'learn':'chat'))openCamera();}
window.knoxSnap=snap;
for(const [target,label] of [['home','Home'],['chat','Ask'],['camera','Snap'],['learn','Learn'],['flashcards','Cards']]){
 const b=button(nav,label,async()=>{if(target==='camera')return snap();if(target!==current&&!busy){showTab(target);await nextFrame();}const ok=await navigate(target);if(!ok)sync();});b.dataset.tab=target;if(target==='camera'){b.className='km-tab-snap';b.setAttribute('aria-label','Snap a question with the camera');}
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','2');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.innerHTML=icons[target];const tile=document.createElement('span');tile.className='km-tab-tile';tile.append(svg);b.prepend(tile);
}
document.body.append(nav);surface(deepStudy?null:initialSurface);
// One colored highlight glides to the tab you're on; the tapped icon gives a small pop.
const fade=document.createElement('div');fade.className='km-dock-fade';fade.setAttribute('aria-hidden','true');nav.before(fade);
const glider=document.createElement('span');glider.className='km-tab-glider';glider.setAttribute('aria-hidden','true');nav.prepend(glider);
let gliderTarget=null,targetTimer=0;
function moveGlider(){const now=nav.querySelector('button[aria-current="page"]:not(.km-tab-snap)');if(gliderTarget&&now?.dataset.tab===gliderTarget)gliderTarget=null;const a=gliderTarget?nav.querySelector('button[data-tab="'+gliderTarget+'"]'):now,t=a?.querySelector('.km-tab-tile');if(!t||!nav.offsetWidth){glider.style.opacity='0';return;}const n=nav.getBoundingClientRect(),r=t.getBoundingClientRect();glider.style.width=r.width+'px';glider.style.height=r.height+'px';glider.style.transform='translate('+(r.left-n.left-nav.clientLeft)+'px,'+(r.top-n.top-nav.clientTop)+'px)';glider.dataset.at=a.dataset.tab;glider.style.opacity='1';}
new ResizeObserver(moveGlider).observe(nav);
// Tapping a tab: the highlight moves to it at once, and the page switches on the
// next frame, so the tap always feels instant even while the page is built.
function showTab(target){const b=nav.querySelector('button[data-tab="'+target+'"]');if(!b||b.classList.contains('km-tab-snap'))return;nav.querySelectorAll('button[aria-current]').forEach(x=>x.removeAttribute('aria-current'));b.setAttribute('aria-current','page');moveGlider();}
// After the next paint (or 60ms at most, in case frames are paused).
const afterPaint=fn=>{let done=false;const go=()=>{if(!done){done=true;setTimeout(fn,0);}};requestAnimationFrame(go);setTimeout(go,60);};
const nextFrame=()=>new Promise(afterPaint);
// Hold the island and slide: a clear glass highlight follows your finger
// smoothly between the tabs; lifting it flows onto the tab under it and takes
// that tab's color.
{
 const tabs=()=>[...nav.querySelectorAll('button[data-tab]:not(.km-tab-snap):not([hidden])')];
 const center=b=>{const r=b.querySelector('.km-tab-tile').getBoundingClientRect();return r.left+r.width/2;};
 const under=x=>{let best=null,d=1e9;for(const b of tabs()){const c=center(b);if(Math.abs(x-c)<d){d=Math.abs(x-c);best=b;}}return best;};
 let press=null,hold=0,suppress=false,frame=0,cx=0,tx=0,over=null;
 const place=()=>{const list=tabs();if(!list.length)return;const n=nav.getBoundingClientRect(),t=list[0].querySelector('.km-tab-tile').getBoundingClientRect(),lo=center(list[0]),hi=center(list.at(-1));tx=Math.min(Math.max(tx,lo),hi);cx+=(tx-cx)*.32;const v=tx-cx;glider.style.transform='translate('+(cx-t.width/2-n.left-nav.clientLeft)+'px,'+(t.top-n.top-nav.clientTop)+'px)';const b=under(cx);if(b&&b!==over){over=b;quiet(p.haptics.selectionChanged());}if(press?.drag||Math.abs(v)>.4)frame=requestAnimationFrame(place);else frame=0;};
 const start=()=>{if(!press||press.drag)return;press.drag=true;try{nav.setPointerCapture(press.id);}catch{}const cur=nav.querySelector('button[aria-current="page"]:not(.km-tab-snap)');cx=cur?center(cur):press.x;tx=press.x;over=under(cx);nav.classList.add('km-lensing');glider.style.opacity='1';if(!frame)frame=requestAnimationFrame(place);quiet(p.haptics.selectionChanged());};
 nav.addEventListener('pointerdown',e=>{const b=e.target.closest('button[data-tab]');if(!b||b.classList.contains('km-tab-snap')||e.button>0)return;press={x:e.clientX,x0:e.clientX,id:e.pointerId,drag:false};clearTimeout(hold);hold=setTimeout(start,220);});
 nav.addEventListener('pointermove',e=>{if(!press||e.pointerId!==press.id)return;press.x=e.clientX;if(!press.drag&&Math.abs(e.clientX-press.x0)>10)start();if(press.drag){e.preventDefault();tx=e.clientX;if(!frame)frame=requestAnimationFrame(place);}});
 const end=e=>{clearTimeout(hold);if(!press)return;const was=press;press=null;if(!was.drag)return;if(e.type==='pointerup'&&Number.isFinite(e.clientX))tx=e.clientX;cancelAnimationFrame(frame);frame=0;suppress=true;setTimeout(()=>{suppress=false;},400);nav.classList.remove('km-lensing');
  const b=e.type==='pointercancel'?null:under(Math.min(Math.max(tx,center(tabs()[0])),center(tabs().at(-1))));
  if(b&&b.getAttribute('aria-current')!=='page'){gliderTarget=b.dataset.tab;clearTimeout(targetTimer);targetTimer=setTimeout(()=>{gliderTarget=null;moveGlider();},1500);moveGlider();b.onclick?.();}else moveGlider();};
 nav.addEventListener('pointerup',end);nav.addEventListener('pointercancel',end);
 nav.addEventListener('click',e=>{if(suppress){e.stopImmediatePropagation();e.preventDefault();suppress=false;}},true);
}
// Switching tabs slides the new page in from the side of the tab you tapped.
const TAB_ORDER={home:0,account:0,chat:1,learn:2,calculator:2,flashcards:3};
function slideIn(from,to){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||from===to)return;
 const el=to==='home'?$('knoxMobileHome'):to==='account'?$('knoxMobileAccount'):to==='flashcards'?$('flashcardsPanel'):['chat','learn'].includes(to)?$('chatAndInput'):null;if(!el)return;
 const dir=(TAB_ORDER[to]??0)>=(TAB_ORDER[from]??0)?'right':'left';
 el.classList.remove('km-in-right','km-in-left');void el.offsetWidth;el.classList.add('km-in-'+dir);
 el.addEventListener('animationend',()=>el.classList.remove('km-in-right','km-in-left'),{once:true});
}
async function navigate(target){
 if(busy)return false;
 if(target===current){
  // Reselecting a tab scrolls; New is always a separate, deliberate action.
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(['chat','learn'].includes(target)){const t=$('chatThread');if(t&&!t.classList.contains('hidden'))t.scrollTo({top:t.scrollHeight,behavior:reduced?'auto':'smooth'});}
  else if(target==='home'||target==='account')$(target==='home'?'knoxMobileHome':'knoxMobileAccount')?.scrollTo({top:0,behavior:reduced?'auto':'smooth'});
  return true;
 }
 if(cameraBusy || (!['home','account'].includes(target) && ((window._appAskBusy && target!==mode()) || $('appImagePill')?.classList.contains('is-reading')))){note('Let Knox finish this step before switching tabs.');return;}
 busy=true;
 try{
  saveDraft();
  document.activeElement?.blur();window.closeMobileHistory?.();window.closeUserDropdown?.();
  const from=current;
  if(target==='home'||target==='account'){window.knoxFlashcardsMobile?.hide();surface(target);sync();if(typeof slideIn==='function')slideIn(from,target);quiet(p.haptics.selectionChanged());return true;}
  if(target==='flashcards'){
   if(!window.knoxFlashcardsMobile){note('Flashcards is still opening. Try again in a moment.');return;}
   window.closeCalc?.();if(!(await window.knoxFlashcardsMobile.show()))return;
  }else{
   window.knoxFlashcardsMobile?.hide();
   if(target==='calculator'){calculatorReturn=current;window.openCalc?.();}
   else{
    window.closeCalc?.();
    if(mode()!==target){remember();if(target==='learn')window.openLearnMode?.();else window.appStartNewChat?.();restore(target);}
   }
  }
  surface(null);current=target;sync();if(typeof slideIn==='function')slideIn(from,target);quiet(p.haptics.selectionChanged());return true;
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
let paintedFor=null;
function sync(){
 const before=current;
 current=document.body.classList.contains('knox-mobile-home')?'home':document.body.classList.contains('knox-mobile-account')?'account':document.body.classList.contains('knox-flashcards')?'flashcards':$('calcModal')?.classList.contains('open')?'calculator':mode();
 if(current==='calculator'&&before!=='calculator')calculatorReturn=before;
 const back=document.querySelector('#calcModal [data-k="back"]');if(back)back.textContent='← Back to '+({home:'Home',account:'You',chat:'Ask',learn:'Learn',flashcards:'Cards'}[calculatorReturn]||'Home');
 const active=current==='calculator'?calculatorReturn:current;
 nav.querySelectorAll('button').forEach(b=>{if(b.dataset.tab===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 moveGlider();
 const locked=document.querySelector('.fc-nav.fc-locked');nav.querySelector('[data-tab="flashcards"]').hidden=!!locked;
 // A new screen: the header, status bar color and island backing change in the
 // same frame as the page (painting them later made every tab switch blink).
 if(typeof paint==='function'){if(current!==paintedFor){paintedFor=current;paint();}else setTimeout(paint,0);}
}
// Class changes anywhere can mean a new screen; check once per frame, not once
// per change (a tab switch makes dozens).
let syncQueued=false;new MutationObserver(()=>{if(syncQueued)return;syncQueued=true;queueMicrotask(()=>{syncQueued=false;sync();});}).observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});sync();
window.addEventListener('knox-auth-changed',()=>{const next=window.currentUser?.uid||'';if(next!==owner){const hadOwner=!!owner;clearTimeout(draftTimer);draftEdited=false;drafts.clear(owner);slots.clear();owner=next;document.querySelectorAll('.knox-native-dialog').forEach(d=>d.close());if(hadOwner||!deepStudy)surface(hadOwner?'home':initialSurface);}sync();});

// "Jump to latest" when you've scrolled up in a chat.
const latest=document.createElement('button');latest.type='button';latest.className='km-latest km-press';latest.hidden=true;latest.setAttribute('aria-label','Jump to the latest message');
latest.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>';
latest.onclick=()=>{const t=$('chatThread');t?.scrollTo({top:t.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};document.body.append(latest);
const thread=$('chatThread');
const checkLatest=()=>{latest.hidden=!thread||thread.classList.contains('hidden')||!['chat','learn'].includes(current)||thread.scrollHeight-thread.scrollTop-thread.clientHeight<160;};
thread?.addEventListener('scroll',checkLatest,{passive:true});new MutationObserver(checkLatest).observe(document.body,{attributes:true,attributeFilter:['class']});
if(thread){new MutationObserver(checkLatest).observe(thread,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});new ResizeObserver(checkLatest).observe(thread);}
const offline=document.createElement('div');offline.className='knox-offline';offline.setAttribute('role','status');offline.hidden=true;offline.textContent='You’re offline. Saved flashcards and the calculator are available. AI needs a connection.';document.body.append(offline);
new ResizeObserver(()=>{const height=offline.getBoundingClientRect().height;if(height)document.documentElement.style.setProperty('--offline-height',height+'px');}).observe(offline);
let wasConnected=navigator.onLine;
const connection=({connected})=>{offline.hidden=!!connected;document.documentElement.classList.toggle('native-offline',!connected);if(connected!==wasConnected){wasConnected=connected;window.dispatchEvent(new Event(connected?'online':'offline'));}};
quiet(p.network.getStatus().then(connection));quiet(p.network.addListener('networkStatusChange',connection));
window.addEventListener('offline',()=>{offline.hidden=false;document.documentElement.classList.add('native-offline');});window.addEventListener('online',()=>{offline.hidden=true;document.documentElement.classList.remove('native-offline');window.knoxRefreshPlan?.();});
// The web shell uses actual visualViewport changes in extras.js; focusing a
// field with a hardware keyboard must not collapse the whole study screen.
for(const event of ['keyboardWillShow','keyboardDidShow'])quiet(p.keyboard.addListener(event,()=>document.documentElement.classList.add('native-keyboard')));
quiet(p.keyboard.addListener('keyboardWillHide',()=>{document.documentElement.classList.remove('native-keyboard');setTimeout(()=>{if(scrollY)scrollTo(0,0);},300);}));
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
 const top=historyPanel.querySelector('.sidebar-top'),fresh=historyPanel.querySelector('.sidebar-new-btn');if(top&&fresh)top.querySelector('.drawer-close')?.before(fresh);
 // All · Ask · Learn, so a long history is easy to sort through.
 const tabs=document.createElement('div');tabs.className='km-hist-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Show');
 tabs.innerHTML=[['all','All'],['chat','Ask'],['learn','Learn']].map(([k,l])=>'<button type="button" data-kind="'+k+'" aria-pressed="'+(k==='all')+'">'+l+'</button>').join('');search.after(tabs);let kind='all';
 tabs.addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(!b)return;kind=b.dataset.kind;tabs.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));filter();});
 // Learn's "Review from your lessons" sits here instead of under the lesson topics.
 const review=$('learnReviewPanel');if(review){tabs.after(review);review.addEventListener('click',e=>{if(e.target.closest('.lr-start'))window.closeMobileHistory?.();});}
 const filter=()=>{const term=search.value.trim().toLocaleLowerCase();let matches=0;historyPanel.querySelectorAll('.sidebar-history-item').forEach(row=>{const learn=row.classList.contains('shi-learn'),show=(!term||row.textContent.toLocaleLowerCase().includes(term))&&(kind==='all'||(kind==='learn')===learn);row.hidden=!show;if(show)matches++;});empty.hidden=matches>0||!(term||kind!=='all');empty.textContent=term?'No matches in loaded history. Try another word or load more.':kind==='learn'?'No lessons yet. Start one in Learn.':'No Ask Knox chats yet.';};
 const empty=document.createElement('p');empty.className='km-history-empty';empty.textContent='No matches in loaded history. Try another word or load more.';empty.hidden=true;body?.before(empty);
 search.addEventListener('input',filter);if(body)new MutationObserver(filter).observe(body,{childList:true,subtree:true,characterData:true});
}
window.knoxMobile={navigate,note,saveDraft,openConversation:openSaved,showHome(){surface('home');sync();},
 async calculatorBack(){window.closeCalc?.();if(['home','account'].includes(calculatorReturn))surface(calculatorReturn);else if(calculatorReturn==='flashcards')await window.knoxFlashcardsMobile?.show();sync();},
 async calculatorDraft(target,text){if(!(await navigate(target)))return;const input=$('appChatInput');input.value=input.value?input.value+'\n'+text:text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();},refreshHome:pages.render,drafts:()=>drafts.list(owner),resumeDraft,clearDrafts(){drafts.clear(owner);note('Unsent text drafts cleared. Saved chats and decks are unchanged.');pages.render();}};
})();
