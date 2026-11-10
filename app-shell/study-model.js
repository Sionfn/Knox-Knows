/* Pure app helpers: local activity evidence, crop bounds and grounded follow-ups. */
(function(w){
 const uidOK=uid=>typeof uid==='string'&&uid.length>0&&uid.length<=128&&uid!=='guest';
 const text=(s,n)=>typeof s==='string'?s.trim().slice(0,n):'';
 const number=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9?n:0;
 const day=now=>{const d=new Date(now);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 w.knoxStudyModel={
  cropBounds(r={},minimum=.12){const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a)),min=clamp(minimum,.001,.5);const x=clamp(r.x,0,1-min),y=clamp(r.y,0,1-min);return{x,y,w:clamp(r.w,min,1-x),h:clamp(r.h,min,1-y)};},
  photoFit(width,height,areaWidth,areaHeight,rotation=0){
   const valid=n=>Number.isFinite(n)&&n>0; if(![width,height,areaWidth,areaHeight].every(valid))return{x:0,y:0,w:0,h:0,scale:0};
   const W=rotation%180?height:width,H=rotation%180?width:height,scale=Math.min(areaWidth/W,areaHeight/H);
   return{x:(areaWidth-W*scale)/2,y:(areaHeight-H*scale)/2,w:W*scale,h:H*scale,scale};
  },
  cameraFrame(width,height,view,frame){
   if(![width,height,view.width,view.height,frame.width,frame.height].every(n=>Number.isFinite(n)&&n>0))return null;const scale=Math.max(view.width/width,view.height/height),ox=(width*scale-view.width)/2,oy=(height*scale-view.height)/2;
   return this.cropBounds({x:(frame.left-view.left+ox)/(width*scale),y:(frame.top-view.top+oy)/(height*scale),w:frame.width/(width*scale),h:frame.height/(height*scale)},.001);
  },
  followup(payload,kind){
   const question=text(payload?.question,3000),answer=text(payload?.answer,7000);if(!answer||!['simpler','similar','cards'].includes(kind))return '';
   const task=kind==='simpler'?'Explain this answer more simply. Define unfamiliar terms and show one short example.':kind==='similar'?'Give me one similar practice problem that tests the same skill, using different details. Let me try before revealing the answer.':'Make focused flashcards from this question and explanation. Keep them specific to what was taught.';
   return task+'\n\nOriginal question:\n'+question+'\n\nExplanation to use:\n'+answer;
  },
  createProgress(storage,now=Date.now){
   const key=uid=>'knox.mobile.progress.v2.'+encodeURIComponent(uid);
   const empty=()=>({questions:0,cards:0,lessons:0,goalDays:0,bestStreak:0,days:{},events:[],completed:[]});
   function read(uid){if(!uidOK(uid))return empty();try{const raw=JSON.parse(storage.getItem(key(uid))||'null');if(!raw||raw.uid!==uid)return empty();const s=empty();for(const k of ['questions','cards','lessons','goalDays','bestStreak'])s[k]=number(raw[k]);
    s.events=Array.isArray(raw.events)?raw.events.filter(x=>typeof x==='string'&&x.length<=200).slice(-500):[];
    s.completed=Array.isArray(raw.completed)?raw.completed.filter(x=>typeof x==='string'&&x.length<=200).slice(-2000):[];
    for(const [d,n] of Object.entries(raw.days||{}).slice(-32))if(/^\d{4}-\d{2}-\d{2}$/.test(d))s.days[d]=Math.min(10000,number(n));return s;
   }catch{return empty();}}
   return {read,today:uid=>read(uid).days[day(now())]||0,
    record(detail,currentUid){
     const uid=detail?.uid,id=text(detail?.id,201);if(!uidOK(uid)||uid!==currentUid||!id||id.length>200||!['answer','review'].includes(detail.kind))return{recorded:false};
     const s=read(uid);if(s.events.includes(id))return{recorded:false};const today=day(now()),before=s.days[today]||0;
     s.events=[...s.events,id].slice(-500);s[detail.kind==='answer'?'questions':'cards']++;
     let lesson=false;const sid=text(detail.lessonId,201);if(detail.kind==='answer'&&detail.completed===true&&sid&&sid.length<=200&&!s.completed.includes(sid)){s.completed=[...s.completed,sid].slice(-2000);s.lessons++;lesson=true;}
     s.days[today]=Math.min(10000,before+1);s.days=Object.fromEntries(Object.entries(s.days).sort(([a],[b])=>a.localeCompare(b)).slice(-32));
     const goal=before<3&&s.days[today]>=3;if(goal)s.goalDays++;s.bestStreak=Math.max(s.bestStreak,number(detail.streak));
     try{storage.setItem(key(uid),JSON.stringify({...s,uid}));return{recorded:true,goal,lesson};}catch{return{recorded:false};}
    }
   };
  }
 };
})(window);
