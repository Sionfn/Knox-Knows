/* Account-scoped, bounded text-only recovery. No photos, tokens or sent replies. */
(function(root){
 const MODES=['chat','learn'],TTL=7*86400000,MAX=16000;
 const validUid=uid=>typeof uid==='string'&&uid.length>0&&uid.length<=128&&uid!=='guest';
 root.createKnoxDraftStore=function(storage,now=Date.now){
  const key=(uid,mode)=>'knox.mobile.draft.v1.'+encodeURIComponent(uid)+'.'+mode;
  function read(uid,mode){
   if(!validUid(uid)||!MODES.includes(mode))return null;
   try{const row=JSON.parse(storage.getItem(key(uid,mode))||'null');if(!row)return null;
    if(row.uid!==uid||row.mode!==mode||typeof row.text!=='string'||!row.text.trim()||row.text.length>MAX||!Number.isFinite(row.updatedAt)||row.updatedAt>now()+60000||now()-row.updatedAt>TTL||!(row.conversationId===null||typeof row.conversationId==='string'&&row.conversationId.length<=200)){
     storage.removeItem(key(uid,mode));return null;
    }return row;
   }catch{try{storage.removeItem(key(uid,mode));}catch{}return null;}
  }
  function remove(uid,mode){if(validUid(uid)&&MODES.includes(mode))try{storage.removeItem(key(uid,mode));}catch{}}
  return {read,remove,
   list:uid=>MODES.map(mode=>read(uid,mode)).filter(Boolean).sort((a,b)=>b.updatedAt-a.updatedAt),
   clear:uid=>MODES.forEach(mode=>remove(uid,mode)),
   save(uid,mode,text,conversationId=null){
    if(!validUid(uid)||!MODES.includes(mode)||typeof text!=='string'||text.length>MAX)return false;
    if(!text.trim()){remove(uid,mode);return true;}
    if(conversationId!==null&&(typeof conversationId!=='string'||conversationId.length>200))return false;
    try{storage.setItem(key(uid,mode),JSON.stringify({uid,mode,text,conversationId,updatedAt:now()}));return true;}catch{return false;}
   }
  };
 };
})(window);
