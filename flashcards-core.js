export const DAY = 86400000;
export function validateDeck(value) {
  if (!value || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100) throw Error('Use a deck title of 1–100 characters.');
  if (!Array.isArray(value.cards) || !value.cards.length || value.cards.length > 300) throw Error('A deck needs 1–300 cards.');
  return { title:value.title.trim(), cards:value.cards.map(c => {
    if (!c || typeof c.front !== 'string' || typeof c.back !== 'string' || !c.front.trim() || !c.back.trim() || c.front.length > 2000 || c.back.length > 4000) throw Error('Each card needs a question (up to 2,000 characters) and answer (up to 4,000).');
    return {front:c.front.trim(),back:c.back.trim(),due:0,interval:0,reviews:0};
  }) };
}
export function parseLines(text) {
  return text.split(/\r?\n/).filter(l=>l.trim()).map((line,i)=>{
    const split=line.indexOf('\t');
    if(split<1) throw Error(`Line ${i+1}: separate the question and answer with a Tab.`);
    return {front:line.slice(0,split),back:line.slice(split+1)};
  });
}
export function schedule(card, grade, now=Date.now()) {
  if(!['again','good','easy'].includes(grade)) throw Error('Invalid review grade');
  const prior=Math.max(0,Number(card.interval)||0);
  const interval=grade==='again'?0:grade==='easy'?Math.max(3,Math.round(prior*2.5)):Math.max(1,Math.round(prior*2));
  return {...card,interval,due:now+(interval?interval*DAY:60000),reviews:(Number(card.reviews)||0)+1};
}
export function studyQueue(cards, dueOnly=true, now=Date.now(), random=Math.random) {
  const q=cards.map((_,i)=>i).filter(i=>!dueOnly || !cards[i].due || cards[i].due<=now);
  for(let i=q.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[q[i],q[j]]=[q[j],q[i]];}
  return q;
}
