// LOCAL QA ONLY: fake native plugins, no production requests.
(()=>{
  const original=fetch.bind(window);window.qaCalls=[];window.qaListeners={};
  const qaPlan=new URLSearchParams(location.search).get('qa-plan')||'plus';
  const now=Date.now(),today=new Date(now-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const data=JSON.parse(localStorage.getItem('qa.firestore')||'{}');
  data['users/qa-alice']={plan:qaPlan==='mega'?'max':qaPlan==='free'?'free':'super',streakCount:3,streakLastDay:today};
  if(!Object.keys(data).some(k=>k.includes('/conversations/'))){
   data['users/qa-alice/conversations/qa-lesson']={title:'Comparing fractions',type:'learn',updatedAt:now,learnSessionId:'qa-lesson-session'};
   data['users/qa-alice/conversations/qa-lesson/messages/turn-1']={question:'Teach me fractions',answer:'Compare equal parts of one whole.\nYour turn: Which is larger, 3/4 or 3/7?\nLesson plan: Compare fractions\nProgress: 1/1\nAssessment: new',model:'qa-fixture',learnSessionId:'qa-lesson-session',createdAt:now};
   data['users/qa-alice/conversations/qa-question']={title:'How do plants make food?',type:'chat',updatedAt:now-1000};
   data['users/qa-alice/conversations/qa-question/messages/turn-1']={question:'How do plants make food?',answer:'Plants use sunlight to make sugars through photosynthesis.',createdAt:now-1000};
  }
  localStorage.setItem('qa.firestore',JSON.stringify(data));
  if(!localStorage.getItem('knox.flashcards.v1.qa-alice'))localStorage.setItem('knox.flashcards.v1.qa-alice',JSON.stringify([
   {id:'qa-biology',title:'Biology basics',cards:[{front:'What does the heart do?',back:'Pumps blood.',due:0},{front:'What do lungs do?',back:'Exchange oxygen and carbon dioxide.',due:now+86400000}]},
   {id:'qa-fractions',title:'Fraction practice',cards:[{front:'What does the denominator describe?',back:'How many equal parts make one whole.',due:0},{front:'Is 3/4 larger than 3/7?',back:'Yes, when the wholes are the same size.',due:0}]}]));
  if(!localStorage.getItem('knoxTheme'))localStorage.setItem('knoxTheme','seasonal');
  window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',Plugins:{},registerPlugin(name){
   if(this.Plugins[name])return this.Plugins[name];
   const methods={
    request:async o=>{window.qaCalls.push({plugin:name,...o});const r=await original(new URL(o.url).pathname+new URL(o.url).search,{method:o.method,headers:{...o.headers,'X-QA-Plan':qaPlan},body:['GET','HEAD'].includes(o.method)?undefined:o.data});return{status:r.status,headers:Object.fromEntries(r.headers),data:await r.text()};},
    addListener:async(event,fn)=>{window.qaListeners[name+':'+event]=fn;return{remove(){}};},
    getStatus:async()=>({connected:navigator.onLine}),getPhoto:async()=>{throw Error('User cancelled');},
    writeFile:async o=>{window.qaCalls.push({plugin:name,...o});return{uri:'file:///tmp/qa-export.json'};},
    share:async o=>{window.qaCalls.push({plugin:name,...o});return{};},deleteFile:async()=>{},
    open:async o=>{window.qaCalls.push({plugin:name,...o});},setStyle:async()=>{},hide:async()=>{},selectionChanged:async()=>{}
   };this.Plugins[name]=methods;return methods;
  }};
 })();
