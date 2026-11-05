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

// ── Auto-pick: find the question in a photo (like Quizard). It looks for the
// block of writing nearest the middle (or inside the camera frame the student
// aimed with), so the crop box starts around it for library photos. The student can
// drag it or tap Whole photo. A camera frame the student aimed is kept as is.
function detectQuestion(img,frame){
 try{
  const scale=Math.min(1,360/Math.max(img.naturalWidth,img.naturalHeight));
  const W=Math.max(1,Math.round(img.naturalWidth*scale)),H=Math.max(1,Math.round(img.naturalHeight*scale));
  const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,W,H);
  const d=g.getImageData(0,0,W,H).data,L=new Float32Array(W*H);
  for(let i=0;i<W*H;i++)L[i]=d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11;
  const C=6,cw=Math.ceil(W/C),ch=Math.ceil(H/C),cell=new Uint16Array(cw*ch);
  const fx0=frame?Math.max(1,Math.floor(frame.x*W)):1,fy0=frame?Math.max(1,Math.floor(frame.y*H)):1,fx1=frame?Math.min(W-1,Math.ceil((frame.x+frame.w)*W)):W-1,fy1=frame?Math.min(H-1,Math.ceil((frame.y+frame.h)*H)):H-1;
  for(let y=fy0;y<fy1;y++)for(let x=fx0;x<fx1;x++){const i=y*W+x;if(Math.abs(L[i+1]-L[i-1])+Math.abs(L[i+W]-L[i-W])>48)cell[(y/C|0)*cw+(x/C|0)]++;}
  const on=new Uint8Array(cw*ch);for(let i=0;i<on.length;i++)on[i]=cell[i]>=3?1:0;
  // Group writing that sits close together (same line, or the next line).
  const comp=new Int32Array(cw*ch).fill(-1),boxes=[];
  for(let i=0;i<on.length;i++){if(!on[i]||comp[i]>=0)continue;const id=boxes.length,b={x0:1e9,y0:1e9,x1:-1,y1:-1,n:0};boxes.push(b);const q=[i];comp[i]=id;
   while(q.length){const k=q.pop(),kx=k%cw,ky=k/cw|0;b.n++;b.x0=Math.min(b.x0,kx);b.x1=Math.max(b.x1,kx);b.y0=Math.min(b.y0,ky);b.y1=Math.max(b.y1,ky);
    for(let dy=-2;dy<=2;dy++)for(let dx=-4;dx<=4;dx++){const nx=kx+dx,ny=ky+dy;if(nx<0||ny<0||nx>=cw||ny>=ch)continue;const j=ny*cw+nx;if(on[j]&&comp[j]<0){comp[j]=id;q.push(j);}}}}
  const cx=frame?(frame.x+frame.w/2)*cw:cw/2,cy=frame?(frame.y+frame.h/2)*ch:ch/2;
  let best=null,score=-1;
  for(const b of boxes){if(b.n<6)continue;const dx=Math.max(b.x0-cx,0,cx-b.x1)/cw,dy=Math.max(b.y0-cy,0,cy-b.y1)/ch,s=Math.sqrt(b.n)/(1+8*(dx+dy));if(s>score){score=s;best=b;}}
  if(!best)return frame||null;
  const pad=1.5,box={x:Math.max(0,(best.x0-pad)/cw),y:Math.max(0,(best.y0-pad)/ch)};box.w=Math.min(1-box.x,(best.x1+1+pad)/cw-box.x);box.h=Math.min(1-box.y,(best.y1+1+pad)/ch-box.y);
  if(box.w*box.h<.02||box.w*box.h>.97)return frame||null;
  return box;
 }catch{return frame||null;}
}
w.knoxDetectQuestion=detectQuestion;

// Photo review starts with the whole image. Cropping is an explicit choice;
// an aimed camera frame is preserved exactly rather than guessed a second time.
let cancelCrop=null;
// The main button sends the photo to Knox right away (Solve it / Teach me);
// "Add a note first" attaches it so the student can type with it. If a photo or
// file is already attached, the new one is attached without sending.
w.knoxCropPhoto=(file,options={})=>new Promise(resolve=>{
 // Camera with Crop off: straight to Knox, unless something is already typed or
 // attached (then the review screen shows so nothing is replaced or sent by surprise).
 if(options.skip&&!($('appChatInput')?.value.trim()||w._appImage||w._appDoc)){file.knoxSend=true;return resolve(file);}
 cancelCrop?.();const owner=uid(),viewVersion=w._appViewVersion,previous=document.activeElement;
 let settled=false,sheet=null,resize=null,drag=null,rotation=0,exporting=false,fit=null,drawFrame=0,found=false,send=true;const learn=!!w._learnModeActive;
 // Something already typed or attached: the photo joins it instead of sending.
 const hasDraft=!!($('appChatInput')?.value.trim()||w._appImage||w._appDoc);
 // One attachment at a time: say so when this photo would replace a file or photo.
 const replacing=w._appDoc?.name||w._appImage?.name||(w._appDoc||w._appImage?'your attachment':'');
 const cropBounds=rect=>model.cropBounds(rect,.02);
 let cropped=!!options.frame,r=cropBounds(options.frame||{x:0,y:0,w:1,h:1});
 const url=URL.createObjectURL(file),img=new Image();
 const alive=()=>!settled&&uid()===owner&&w._appViewVersion===viewVersion;
 const cancel=()=>done(null);
 function done(value){if(settled)return;settled=true;if(drawFrame)cancelAnimationFrame(drawFrame);resize?.disconnect();sheet?.close();sheet?.remove();URL.revokeObjectURL(url);if(cancelCrop===cancel)cancelCrop=null;removeEventListener('knox-auth-changed',cancel);removeEventListener('popstate',cancel);removeEventListener('keydown',key,true);if(previous?.isConnected&&uid()===owner&&w._appViewVersion===viewVersion&&!previous.matches('input,textarea'))previous.focus?.({preventScroll:true});resolve(value);}
 function key(e){if(!sheet)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();}else if(e.key==='Tab'){const all=[...sheet.querySelectorAll('button,input,summary')].filter(el=>!el.disabled&&el.getClientRects().length);if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0]?.focus();}}}
 cancelCrop=cancel;addEventListener('knox-auth-changed',cancel);addEventListener('popstate',cancel);addEventListener('keydown',key,true);
 img.onerror=()=>{if(alive())note('This photo could not be opened. Choose another picture.');cancel();};
 img.onload=()=>{
  if(!alive())return cancel();
  // Crop off (options.skip) means the whole photo, so no automatic crop then.
  if(!options.frame&&!options.skip){const auto=detectQuestion(img,null);if(auto){r=cropBounds(auto);cropped=found=true;}}
  document.activeElement?.blur();
  sheet=document.createElement('dialog');sheet.className='km-photo-review';sheet.setAttribute('aria-labelledby','kmPhotoTitle');
  sheet.innerHTML='<header class="km-photo-header"><button type="button" data-photo="cancel" aria-label="Cancel photo">Cancel</button><h2 id="kmPhotoTitle">Review photo</h2><span aria-hidden="true"></span></header><p class="km-photo-tip" id="kmPhotoTip">Check that your question is clear. Crop only if you need to.</p><div class="km-photo-stage"><img alt="Photo you selected"><div class="km-photo-box" aria-hidden="true"><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div></div><div class="km-photo-tools"><button type="button" data-photo="crop" aria-pressed="false">Crop</button><button type="button" data-photo="rotate">Rotate</button><button type="button" data-photo="reset">Whole photo</button></div><details class="km-photo-adjust" hidden><summary>Adjust selection</summary><div class="km-photo-ranges">'+[['x','Left'],['y','Top'],['w','Width'],['h','Height']].map(([id,name])=>'<label>'+name+'<input type="range" min="0" max="100" step="1" data-range="'+id+'" aria-label="Selection '+name.toLowerCase()+'"></label>').join('')+'</div></details><footer class="km-photo-footer"><p role="status"></p><button type="button" class="go" data-photo="use">Solve it</button><button type="button" class="km-photo-later" data-photo="later">Add a note first</button></footer>';
  const stage=sheet.querySelector('.km-photo-stage'),view=stage.querySelector('img'),box=stage.querySelector('.km-photo-box'),adjust=sheet.querySelector('details'),use=sheet.querySelector('[data-photo="use"]');
  view.src=url;document.body.append(sheet);sheet.addEventListener('cancel',e=>{e.preventDefault();cancel();});sheet.showModal();
  function draw(){
   if(!alive())return cancel();
   fit=model.photoFit(img.naturalWidth,img.naturalHeight,stage.clientWidth,stage.clientHeight,rotation);
   Object.assign(view.style,{width:img.naturalWidth*fit.scale+'px',height:img.naturalHeight*fit.scale+'px',left:(stage.clientWidth-img.naturalWidth*fit.scale)/2+'px',top:(stage.clientHeight-img.naturalHeight*fit.scale)/2+'px',transform:'rotate('+rotation+'deg)'});
   Object.assign(box.style,{left:fit.x+r.x*fit.w+'px',top:fit.y+r.y*fit.h+'px',width:r.w*fit.w+'px',height:r.h*fit.h+'px'});
   stage.classList.toggle('cropping',cropped);adjust.hidden=!cropped;sheet.querySelector('[data-photo="crop"]').setAttribute('aria-pressed',String(cropped));use.textContent=exporting?(hasDraft?'Attaching…':'Sending to Knox…'):replacing?'Replace attachment':hasDraft?'Attach photo':learn?'Teach me →':'Solve it →';sheet.querySelector('[data-photo="later"]').hidden=hasDraft;if(replacing&&!exporting&&!sheet.querySelector('.km-photo-footer p').textContent)sheet.querySelector('.km-photo-footer p').textContent='This photo will replace “'+replacing+'”. Tap Cancel to keep it.';
   sheet.querySelector('#kmPhotoTip').textContent=found&&cropped?'✨ Knox found your question. Drag to change it, or tap Whole photo.':cropped?'Drag the selection or its corners. Keep the full question inside.':'Check that your question is clear. Crop only if you need to.';
   for(const input of sheet.querySelectorAll('[data-range]')){const k=input.dataset.range;input.min=k==='w'||k==='h'?'2':'0';input.max=String(Math.round(100*(k==='x'?1-r.w:k==='y'?1-r.h:k==='w'?1-r.x:1-r.y)));input.value=String(Math.round(r[k]*100));input.setAttribute('aria-valuetext',input.value+' percent');}
  }
  const scheduleDraw=()=>{if(!drawFrame)drawFrame=requestAnimationFrame(()=>{drawFrame=0;draw();});};
  resize=new ResizeObserver(draw);resize.observe(stage);requestAnimationFrame(draw);
  sheet.addEventListener('input',e=>{const k=e.target.dataset.range;if(!k||exporting)return;r=cropBounds({...r,[k]:Number(e.target.value)/100});draw();});
  box.addEventListener('pointerdown',e=>{if(exporting||e.isPrimary===false)return;e.preventDefault();try{box.setPointerCapture(e.pointerId);}catch{}drag={h:e.target.dataset.h||'move',x:e.clientX,y:e.clientY,r:{...r}};});
  box.addEventListener('pointermove',e=>{if(!drag||!fit?.w||!fit?.h)return;found=false;const dx=(e.clientX-drag.x)/fit.w,dy=(e.clientY-drag.y)/fit.h,o=drag.r;let n={...o};
   if(drag.h==='move'){n.x=Math.min(1-o.w,Math.max(0,o.x+dx));n.y=Math.min(1-o.h,Math.max(0,o.y+dy));}
   else{if(drag.h.includes('w')){n.x=Math.min(o.x+o.w-.02,Math.max(0,o.x+dx));n.w=o.w+o.x-n.x;}if(drag.h.includes('e'))n.w=Math.min(1-o.x,Math.max(.02,o.w+dx));if(drag.h.includes('n')){n.y=Math.min(o.y+o.h-.02,Math.max(0,o.y+dy));n.h=o.h+o.y-n.y;}if(drag.h.includes('s'))n.h=Math.min(1-o.y,Math.max(.02,o.h+dy));}r=cropBounds(n);scheduleDraw();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])box.addEventListener(event,()=>{drag=null;});
  sheet.addEventListener('click',e=>{
   const a=e.target.closest('[data-photo]')?.dataset.photo;if(!a)return;if(!alive())return cancel();if(a==='cancel')return cancel();if(exporting)return;
   if(a==='crop'){cropped=!cropped;found=false;if(cropped&&r.w===1&&r.h===1)r=cropBounds({x:.04,y:.04,w:.92,h:.92});draw();return;}
   if(a==='rotate'){found=false;rotation=(rotation+90)%360;r={x:0,y:0,w:1,h:1};cropped=false;draw();return;}
   if(a==='reset'){found=false;rotation=0;r={x:0,y:0,w:1,h:1};cropped=false;draw();return;}
   if(a!=='use'&&a!=='later')return;send=a==='use'&&!hasDraft;const finish=f=>{if(f)f.knoxSend=send;done(f);};if(!cropped&&rotation===0)return finish(file);
   exporting=true;sheet.querySelectorAll('button,input').forEach(b=>{if(b.dataset.photo!=='cancel')b.disabled=true;});draw();
   try{
    const sw=img.naturalWidth,sh=img.naturalHeight,W=rotation%180?sh:sw,H=rotation%180?sw:sh,sel=cropped?r:{x:0,y:0,w:1,h:1},scale=Math.min(1,2200/Math.max(sel.w*W,sel.h*H));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(sel.w*W*scale));c.height=Math.max(1,Math.round(sel.h*H*scale));const ctx=c.getContext('2d');if(!ctx)throw Error();ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.scale(scale,scale);ctx.translate(-sel.x*W,-sel.y*H);
    if(rotation===90){ctx.translate(W,0);ctx.rotate(Math.PI/2);}else if(rotation===180){ctx.translate(W,H);ctx.rotate(Math.PI);}else if(rotation===270){ctx.translate(0,H);ctx.rotate(-Math.PI/2);}ctx.drawImage(img,0,0,sw,sh);
    c.toBlob(blob=>{if(!alive())return cancel();if(!blob)return failed();finish(new File([blob],file.name.replace(/\.\w+$/,'')+(cropped?'-crop':'-rotated')+'.jpg',{type:'image/jpeg'}));},'image/jpeg',.92);
   }catch{failed();}
  });
  function failed(){if(!alive())return cancel();exporting=false;sheet.querySelectorAll('button,input').forEach(b=>b.disabled=false);sheet.querySelector('.km-photo-footer p').textContent='Could not prepare that edit. Try again, or choose Whole photo.';draw();}
  sheet.querySelector('[data-photo="cancel"]').focus({preventScroll:true});
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
   for(const [label,append] of [['Keep draft',false],['Add follow-up',true]]){const button=document.createElement('button');button.type='button';button.textContent=label;if(append)button.className='primary';button.onclick=()=>{if(append&&uid()===owner){input.value=input.value+'\n\n'+prompt;input.dispatchEvent(new Event('input',{bubbles:true}));}d.close();};d.append(button);}
   d.addEventListener('close',()=>d.remove(),{once:true});document.body.append(d);d.showModal();
  }else{input.value=prompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();note('Follow-up ready. Review it, then tap Send.');}
 }finally{actionBusy=false;}
};

// ── Permission before AI (Apple 5.1.2(i)): the first time something would be
// sent to Knox's AI, the student is told it goes to OpenAI and says OK. Saved
// on this device; until then nothing is sent (the typed text stays put).
const AI_OK='knoxAiOk';
const aiAllowed=()=>{try{return localStorage.getItem(AI_OK)==='1';}catch{return false;}};
let aiAsk=null;
function askAiPermission(){
 if(aiAllowed())return Promise.resolve(true);
 if(aiAsk)return aiAsk;
 aiAsk=new Promise(resolve=>{
  const d=document.createElement('dialog');d.className='knox-native-dialog km-ai-ok';d.setAttribute('aria-labelledby','kmAiOkTitle');
  d.innerHTML='<img class="km-ai-ok-fox" src="/knox-logo-square.jpg" alt=""><h2 id="kmAiOkTitle">Before Knox answers</h2><p>Knox uses AI from <b>OpenAI</b> to answer questions, teach lessons and make flashcards. When you send something, what you type and any photos or files you add go to OpenAI to make Knox’s reply.</p><p class="km-ai-ok-tip">Leave out private info like your full name, address or passwords.</p><a href="https://www.knoxknowsapp.com/privacy" target="_blank" rel="noopener">Read the Privacy Policy</a><div class="km-ai-ok-actions"><button type="button" data-ai="no">Not now</button><button type="button" class="primary" data-ai="yes">OK, continue</button></div>';
  let answer=false;
  d.addEventListener('click',e=>{const a=e.target.closest('[data-ai]')?.dataset.ai;if(!a)return;answer=a==='yes';if(answer){try{localStorage.setItem(AI_OK,'1');}catch{}}d.close();});
  d.addEventListener('close',()=>{d.remove();aiAsk=null;if(!answer)note('Nothing was sent. Knox needs your OK before it can answer.');resolve(answer);},{once:true});
  document.body.append(d);d.showModal();
 });
 return aiAsk;
}
w.knoxAskAiPermission=askAiPermission;
// Sending a question or lesson reply (typed, snapped or a follow-up).
{const send=w.appHandleAsk;if(typeof send==='function')w.appHandleAsk=async function(){if(!(await askAiPermission()))return;return send.apply(this,arguments);};}
// Everything else that reaches the AI (making flashcards, a message to Knox
// Support) waits for the same OK; saying no sends nothing.
{const AI_PATHS=/\/api\/(ask|generate-flashcards)\b/,SUPPORT=/\/api\/me\?route=support\b/;const real=w.fetch.bind(w);
 // Only real sends to the AI ask: loading lists (Learn review, support inbox) never does.
 const toAi=(url,init)=>{if(AI_PATHS.test(url))return true;if(!SUPPORT.test(url))return false;try{return JSON.parse(init?.body||'{}').action==='say';}catch{return false;}};
 w.fetch=async function(input,init){
  const url=typeof input==='string'?input:input?.url||'';
  if(toAi(url,init)&&!aiAllowed()&&!(await askAiPermission()))return new Response(JSON.stringify({error:'Knox needs your OK before it can use AI. Nothing was sent.'}),{status:403,headers:{'Content-Type':'application/json'}});
  return real(input,init);
 };}

// ── Voice: no custom mic. The iPhone keyboard's own 🎤 dictation works in
// every text box; a browser speech button didn't work in home-screen apps.

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
  const open=(typing()||root.classList.contains('km-kb'))&&Math.abs((vv.scale||1)-1)<.05&&base-vv.height>120;
  root.style.setProperty('--vvh',vv.height+'px');root.style.setProperty('--vvt',vv.offsetTop+'px');
  if(open){
   if(!root.classList.contains('km-kb')){root.classList.add('native-keyboard','km-kb');const t=$('chatThread');if(t&&t._kmStick)requestAnimationFrame(()=>{t.scrollTop=t.scrollHeight;});}
  }else{root.classList.remove('km-kb','native-keyboard');root.style.setProperty('--vvt','0px');unshift();}
 };
 // iPhone slides the whole page up to show a text box above the keyboard and
 // leaves it there after the keyboard closes, hiding the top of every screen.
 // Put it back once the keyboard is gone (again after iOS's own settle).
 const shifted=()=>(w.scrollY||document.documentElement?.scrollTop||0)>0;
 function unshift(){if(typing()||typeof w.scrollTo!=='function')return;if(shifted())w.scrollTo(0,0);setTimeout(()=>{if(!typing()&&shifted())w.scrollTo(0,0);},320);}
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(apply);};
 vv.addEventListener('resize',schedule);vv.addEventListener('scroll',schedule);
 addEventListener('orientationchange',()=>setTimeout(()=>{base=innerHeight;schedule();},400));
 // If you were reading the latest message, keep it in view while the keyboard opens.
 $('appChatInput')?.addEventListener('focus',()=>{const t=$('chatThread');if(t)t._kmStick=t.scrollHeight-t.scrollTop-t.clientHeight<80;schedule();});
 // Done (✓) on the keyboard: bring the dock and topics back right away instead of
 // waiting for iPhone to finish sliding the keyboard down.
 document.addEventListener('focusout',e=>{if(!e.target.matches?.('#appChatInput'))return setTimeout(()=>{schedule();unshift();},60);setTimeout(()=>{if(typing())return;root.classList.remove('km-kb','native-keyboard');root.style.setProperty('--vvt','0px');unshift();},0);});
}

// Welcome stays vertically scrollable at every text/keyboard size. Centering
// and chip-row swaps made partially visible controls look like missing cards.
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
 const html=`<span class="km-goal-ring${n>=GOAL?' done':''}"><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" class="t"/><circle cx="26" cy="26" r="22" class="f" style="stroke-dasharray:${C};stroke-dashoffset:${C*(1-pct)}"/></svg><span class="km-goal-mid">${svgIcon('target')}</span></span><span><b>${n>=GOAL?'Daily goal done! 🎯':'Today’s goal: '+n+' of '+GOAL}</b><small>${n>=GOAL?'Nice work. Come back tomorrow to keep it going.':'Ask a question, finish a lesson step or review a card.'}</small></span>`;
 if(el.innerHTML!==html)el.innerHTML=html;
}

// ── You: progress and badges ──
// One drawn icon set (like the website's tiles) instead of mixed emoji.
const ICON={flame:'<path d="M12 22c4 0 7-2.8 7-6.8 0-3.5-2.3-5.6-3.6-7.6-.6 1.8-1.6 2.9-2.7 3.4.3-3.4-1.2-6.2-3.7-8 .2 3.3-1.4 5.4-2.9 7.2C4.9 11.7 5 13.3 5 15.2 5 19.2 8 22 12 22Z"/>',
 chat:'<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.5 8.5 0 1 1 21 11.5Z"/>',
 cap:'<path d="M22 9 12 4 2 9l10 5 10-5Z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
 cards:'<rect x="6" y="6" width="15" height="15" rx="3"/><path d="M17 3H6a3 3 0 0 0-3 3v11"/>',
 brain:'<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1Zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
 trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'};
const svgIcon=n=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const iconTile=(n,color)=>`<span class="km-tile sm" data-color="${color}">${svgIcon(n)}</span>`;
function progress(){
 const acct=$('knoxMobileAccount')?.querySelector('.km-page-wrap');if(!acct)return;
 let el=$('kmProgress');if(!el){el=document.createElement('section');el.id='kmProgress';el.className='km-account-section';const ref=acct.querySelector('.km-account-section:nth-of-type(2)');if(ref)ref.after(el);else acct.append(el);}
 if(!uid()){el.hidden=true;return;}el.hidden=false;
 const s=stats(),streak=Number($('streakCount')?.textContent)||0;s.bestStreak=Math.max(streak,s.bestStreak);
 const deck=w.knoxFlashcardsMobile?.summary?.()||{decks:[]},decks=deck.decks?.length||0;
 const tiles=[['flame','chat',streak,'day streak'],['chat','chat',s.questions||0,'questions answered'],['cap','learn',s.lessons||0,'lessons done'],['cards','flashcards',s.cards||0,'cards reviewed']];
 const badges=[['cap','First lesson',s.lessons>=1],['flame','3-day streak',s.bestStreak>=3],['flame','7-day streak',s.bestStreak>=7],['chat','10 questions',s.questions>=10],['cards','First deck',decks>=1],['brain','50 cards',s.cards>=50],['target','Daily goal',s.goalDays>=1],['trophy','5 lessons',s.lessons>=5]];
 const html=`<div class="km-section-heading"><h2>Your progress</h2></div><div class="km-stats">${tiles.map(([i,c,n,l])=>`<div class="km-stat">${iconTile(i,c)}<b>${n}</b><small>${l}</small></div>`).join('')}</div>
  <div class="km-section-heading"><h2>Badges</h2><small class="km-badge-count">${badges.filter(b=>b[2]).length} of ${badges.length}</small></div>
  <div class="km-badges">${badges.map(([i,l,on])=>`<div class="km-badge${on?' on':''}" aria-label="${esc(l)}: ${on?'unlocked':'not yet unlocked'}" title="${esc(l)}"><span class="km-badge-icon">${svgIcon(i)}</span><small>${esc(l)}</small></div>`).join('')}</div>
  <p class="km-footer-note" style="margin-top:10px">Counted on this device as you study.</p>`;
 if(el.innerHTML!==html)el.innerHTML=html;
 w.knoxCheckBadges?.(badges);
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

// ── Big moments: a Knox celebration card with confetti ──
// Streak milestones, a finished lesson, a finished card review, a new badge and
// upgrading. Each moment is celebrated once, when it actually happens (never for
// old history), and remembered per account on this device.
// Knox's own drawn icons (knox-icons.js) for each moment.
const kIcon=(n,alt)=>w.KI?.(n,{tint:false})||alt;
const CEL={orange:['#FF8A2B','#B84300','#FFE08A'],purple:['#A66BFF','#4E1FA8','#F3DDFF'],green:['#62CC1C','#1F6A00','#D7FFB8'],gold:['#6B4B00','#2A1C00','#FFD84D'],blue:['#36B8F7','#0B579A','#CFF1FF']};
let celebrating=null;const celebQueue=[];
function bigMoment(m){
 if(celebrating){celebQueue.push(m);return;}
 const d=document.createElement('dialog');
 d.className='km-celebrate';d.dataset.tone=CEL[m.color]?m.color:'orange';d.setAttribute('aria-labelledby','kmCelTitle');
 d.innerHTML='<div class="km-cel-burst" aria-hidden="true">'+'<i></i>'.repeat(16)+'</div><div class="km-cel-body"><div class="km-cel-icon">'+(m.icon||'<img src="/knox-logo-square.jpg" alt="">')+'</div><h2 id="kmCelTitle">'+esc(m.title)+(m.accent?' <span>'+esc(m.accent)+'</span>':'')+'</h2>'+(m.text?'<p>'+esc(m.text)+'</p>':'')+(m.stats?.length?'<div class="km-cel-stats">'+m.stats.map(([n,l])=>'<div><b>'+esc(n)+'</b><small>'+esc(l)+'</small></div>').join('')+'</div>':'')+'<button type="button" class="km-cel-go">'+esc(m.action||'Keep going')+'</button></div>';
 let done=false;
 const finish=()=>{if(done)return;done=true;if(d.open)d.close();d.remove();celebrating=null;const next=celebQueue.shift();if(next)setTimeout(()=>bigMoment(next),350);};
 const close=finish;d.addEventListener('close',finish);
 d.addEventListener('click',e=>{if(e.target===d||e.target.closest('.km-cel-go'))close();});
 document.body.append(d);d.showModal();celebrating=d;confetti();try{navigator.vibrate?.(30);}catch{}
}
w.knoxBigMoment=bigMoment;
// Preview links only (never knoxknowsapp.com): a row on You that plays every big moment.
const SAMPLES=[{color:'orange',icon:'<span class="knox-flame">🔥</span>',title:'7-day',accent:'streak!',text:'You studied 7 days in a row. Keep the flame going!',action:'Keep it going'},{color:'purple',icon:kIcon('cap','🎓'),title:'Lesson',accent:'complete!',text:'You worked through Comparing fractions. Your recap is ready below.',action:'See my recap'},{color:'green',icon:kIcon('cards','🃏'),title:'Review',accent:'complete!',text:'Your schedule is saved. Knox will bring cards back when they’re due.',stats:[['12','Reviews'],['10','Got it'],['2','Again']],action:'Done'},{color:'gold',icon:svgIcon('trophy'),title:'Badge',accent:'unlocked!',text:'10 questions',action:'Nice!'},{color:'gold',icon:kIcon('gem','💎'),title:'Welcome to',accent:'Mega Knox!',text:'40-card decks, the highest limits and early access to new features are all yours.',action:'Let’s go'}];
// The iPhone app runs from localhost, so it's excluded by name.
addEventListener('knox-auth-changed',()=>{celebQueue.length=0;celebrating?.close();});
if(!w.knoxNativeApp&&!/(^|\.)knoxknowsapp\.com$/.test(location.hostname)){
 const addRow=()=>{const list=document.querySelector('#knoxMobileAccount .km-menu-list');if(!list||list.querySelector('[data-cel-preview]'))return;const b=document.createElement('button');b.type='button';b.className='km-press';b.dataset.celPreview='';b.innerHTML='<span class="km-tile sm" data-color="gold" aria-hidden="true">'+svgIcon('trophy')+'</span><span>Preview celebrations<small>Preview link only: see every big moment</small></span><span aria-hidden="true">›</span>';b.onclick=()=>SAMPLES.forEach(m=>bigMoment(m));list.append(b);};
 addRow();setTimeout(addRow,1500);addEventListener('knox-auth-changed',()=>setTimeout(addRow,500));
}
const celKey=()=>'knoxCelebrated.'+uid();
const celRead=()=>{try{return JSON.parse(localStorage.getItem(celKey())||'null');}catch{return null;}};
const celSave=v=>{try{localStorage.setItem(celKey(),JSON.stringify(v));}catch{}};
// Right after the app opens or someone signs in, the streak, plan and badges are
// still loading, so for a few seconds changes are only recorded, never celebrated.
let settleUntil=Date.now()+8000;addEventListener('knox-auth-changed',()=>{settleUntil=Date.now()+8000;});
const settling=()=>Date.now()<settleUntil;
function celState(){if(!uid())return null;let v=celRead();if(!v){v={streak:0,badges:null,tier:w.userTier||'free'};celSave(v);}return v;}
const MILESTONES=[3,7,14,30,50,100,200,365];
function checkStreak(){
 const v=celState(),n=Number($('streakCount')?.textContent)||0;if(!v||!n)return;
 const hit=settling()?0:MILESTONES.filter(m=>m<=n&&m>(v.streak||0)).pop();
 if(n>(v.streak||0)){v.streak=n;celSave(v);}
 if(hit)bigMoment({color:'orange',icon:'<span class="knox-flame">🔥</span>',title:hit+'-day',accent:'streak!',text:hit>=30?'That’s serious dedication. Knox is proud of you.':'You studied '+hit+' days in a row. Keep the flame going!',action:'Keep it going'});
}
const sc=$('streakCount');if(sc)new MutationObserver(()=>setTimeout(checkStreak,50)).observe(sc,{childList:true,characterData:true,subtree:true});
addEventListener('knox-auth-changed',()=>setTimeout(checkStreak,400));
// Badges (streak badges are covered by the streak celebration above).
w.knoxCheckBadges=list=>{
 const v=celState();if(!v)return;const on=list.filter(([,l,ok])=>ok&&!/streak/i.test(l)).map(([,l])=>l);
 if(!v.badges||settling()){v.badges=[...new Set([...(v.badges||[]),...on])];celSave(v);return;}
 const fresh=on.filter(l=>!v.badges.includes(l));if(!fresh.length)return;v.badges=[...v.badges,...fresh];celSave(v);
 for(const l of fresh)bigMoment({color:'gold',icon:svgIcon(list.find(b=>b[1]===l)[0]),title:'Badge',accent:'unlocked!',text:l,action:'Nice!'});
};
// Upgrading to Knox Plus or Mega Knox.
const RANK={free:0,plus:1,mega:2};
addEventListener('knox-plan-changed',()=>{
 const v=celState(),t=w.userTier||'free';if(!v)return;
 if(!settling()&&(RANK[t]??0)>(RANK[v.tier]??0))bigMoment(t==='mega'?{color:'gold',icon:kIcon('gem','💎'),title:'Welcome to',accent:'Mega Knox!',text:'40-card decks, the highest limits and early access to new features are all yours.',action:'Let’s go'}:{color:'green',icon:kIcon('bolt','⚡'),title:'Welcome to',accent:'Knox Plus!',text:'Unlimited questions and full Learn lessons are unlocked.',action:'Let’s go'});
 if(v.tier!==t){v.tier=t;celSave(v);}
});
// A finished Learn lesson (its recap appears right after a reply you just asked for).
let askedAt=0;const ask=w.appHandleAsk;if(typeof ask==='function')w.appHandleAsk=function(){askedAt=Date.now();return ask.apply(this,arguments);};
const lessonThread=$('chatThread');
if(lessonThread)new MutationObserver(list=>{
 if(Date.now()-askedAt>120000)return;
 for(const m of list)for(const n of m.addedNodes){const recap=n.nodeType===1&&(n.matches?.('.learn-recap')?n:n.querySelector?.('.learn-recap'));if(!recap)continue;
  askedAt=0;const topic=(recap.querySelector('.learn-recap-title')?.textContent||'').split('·')[1]?.trim();
  setTimeout(()=>bigMoment({color:'purple',icon:kIcon('cap','🎓'),title:'Lesson',accent:'complete!',text:topic?'You worked through '+topic+'. Your recap is ready below.':'Nice work. Your recap is ready below.',action:'See my recap'}),500);return;}
}).observe(lessonThread,{childList:true,subtree:true});
// A finished flashcard review.
(function hookCards(){const cardsPanel=$('flashcardsPanel');if(!cardsPanel){setTimeout(hookCards,800);return;}
new MutationObserver(list=>{
 for(const m of list)for(const n of m.addedNodes){const done=n.nodeType===1&&(n.matches?.('.fc-done')?n:n.querySelector?.('.fc-done'));if(!done)continue;
  const st=[...done.querySelectorAll('.fc-stat')].map(x=>[x.querySelector('b')?.textContent||'0',x.querySelector('span')?.textContent||'']);
  bigMoment({color:'green',icon:kIcon('cards','🃏'),title:'Review',accent:'complete!',text:'Your schedule is saved. Knox will bring cards back when they’re due.',stats:st,action:'Done'});return;}
}).observe(cardsPanel,{childList:true,subtree:true});})();
})();
