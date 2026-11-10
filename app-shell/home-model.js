// Display-only model: no network, storage writes, plan changes or purchases.
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const title=value=>typeof value==='string'?value.trim().slice(0,200):'';
export function homeSummary({uid='guest',sourceUid='guest',decks=[],history=[]}={}){
  if(uid!==sourceUid)return {decks:[],history:[],due:0,totalCards:0,recentLesson:null};
  const seen=new Set(),recent=[];
  for(const row of Array.isArray(history)?history:[]){
    if(!row || typeof row.id!=='string' || !row.id || seen.has(row.id) || !title(row.title))continue;
    seen.add(row.id);recent.push({id:row.id,title:title(row.title),kind:row.kind==='learn'?'learn':'chat'});
    if(recent.length===6)break;
  }
  const deckRows=[],ids=new Set();
  for(const row of Array.isArray(decks)?decks:[]){
    if(!row || typeof row.id!=='string' || !row.id || ids.has(row.id) || !title(row.title) || !Number.isSafeInteger(row.count) || row.count<1 || row.count>300)continue;
    ids.add(row.id);deckRows.push({id:row.id,title:title(row.title),count:row.count,due:Math.max(0,Math.min(row.count,Number.isSafeInteger(row.due)?row.due:0))});
  }
  deckRows.sort((a,b)=>b.due-a.due);
  return {decks:deckRows,history:recent,due:deckRows.reduce((sum,d)=>sum+d.due,0),totalCards:deckRows.reduce((sum,d)=>sum+d.count,0),recentLesson:recent.find(r=>r.kind==='learn')||null};
}
export function planDetails(tier){
  const id=['plus','mega'].includes(tier)?tier:'free';
  const all={
    free:{id:'free',name:'Free',label:'Your starting point',features:['5 credits return daily · save up to 20','AI flashcard decks up to 10 cards','Starting a Learn lesson costs 1 credit']},
    plus:{id:'plus',name:'Knox Plus',label:'More room to learn',features:['Unlimited questions, with fair-use protection','Up to 40 AI decks per day · 15 cards each','Up to 5 photos per deck']},
    mega:{id:'mega',name:'Mega Knox',label:'For your biggest study days',features:['Everything in Knox Plus','Up to 100 AI decks per day · 40 cards each','Up to 10 photos per deck','Choose difficulty and more card styles']}
  };
  return {current:all[id],plans:Object.values(all),suggested:id==='free'?all.plus:id==='plus'?all.mega:null};
}
