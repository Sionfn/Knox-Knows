// Structured provider output, translated into the existing saved-lesson format.
// The renderer/history/bot keep one canonical representation.
const properties = {
  goals:{type:'array',items:{type:'string',pattern:'^[^|\\r\\n]{3,64}$'},minItems:1,maxItems:6},
  part:{type:'integer',minimum:1,maximum:6}, practiceIndex:{type:'integer',minimum:0,maximum:12},
  assessment:{type:'string',enum:['new','correct','partial','retry','help'],description:'Classify the current student attempt before writing feedback. Correct choice/value with false reasoning MUST be partial, not retry. Wrong choice with a useful correct step is also partial. Help requests without an attempt are help. New tasks without an attempt are new.'},
  reviewFocus:{type:'string'},
  body:{type:'string',description:'Brief teaching/feedback. For partial, first identify the correct part, then the precise gap. Do not call the whole response wrong when its conclusion was right.'},
  keyIdea:{type:'string'}, graph:{type:'string'}, visual:{type:'string'},
  question:{type:'string'}, choices:{type:'array',items:{type:'string'},maxItems:4}, video:{type:'string'},
  recap:{type:'string'}, watchOut:{type:'string'}, topic:{type:'string'},
};
export const LEARN_RESPONSE_FORMAT={type:'json_schema',json_schema:{name:'knox_learn_reply',strict:true,
  schema:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}};
export const LEARN_OUTPUT_INSTRUCTION='Return JSON matching the knox_learn_reply schema. These JSON fields replace the old text marker lines; do not put metadata labels in body. body is the brief teaching/feedback only, question is the ONE student task (empty only on completion), goals is the fixed 1–6 exact goal titles, part is current goal, practiceIndex is 0 unless a counted practice set, and assessment grades the actual current student attempt. keyIdea/graph/visual/video/recap/watchOut/topic/reviewFocus are empty strings when unused. Do not draw ASCII art or fenced text diagrams: use visual="fraction | 2/3" for a proper fraction model with denominator up to 12, or visual="process | first stage | next stage | final stage" for a genuine linear sequence. Use a relevant native diagram when a student requests it, without giving away their unearned calculation. Never put the same question in body and question. A completed recap has no question or choices. Write general skill labels/notes, never personal details or worksheet quotes.';
const MARKER=/^\s*(?:[-*•]\s+)?\**(?:choices|progress|practice|lesson plan|recap|watch out|topic|key idea|graph|video|visual|your turn|assessment|review focus)\**\s*:.*$/gmi;
const line=(text,max)=>text.replace(/[\r\n]+/g,' ').trim().slice(0,max);
export function decodeLearnOutput(text,state={}) {
  // Compatible with old provider adapters and old plain-text test fixtures.
  // Official Structured Outputs requests return the JSON branch below.
  if(typeof text!=='string'||!text.trim().startsWith('{'))return text;
  const value=JSON.parse(text);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(properties,k))||
    Object.entries(properties).some(([key,spec])=>spec.type==='string'?typeof value[key]!=='string':
      spec.type==='integer'?!Number.isInteger(value[key]):!Array.isArray(value[key]))||
    !properties.assessment.enum.includes(value.assessment)||value.goals.length<1||value.goals.length>6||
    value.goals.some(s=>typeof s!=='string'||s.trim().length<3||s.length>64||/[|\r\n]/.test(s))||
    new Set(value.goals.map(s=>s.trim().toLowerCase())).size!==value.goals.length||
    value.part<1||value.part>value.goals.length||value.practiceIndex<0||value.practiceIndex>12||
    value.choices.length>4||value.choices.some(s=>typeof s!=='string')||value.body.length>90000)throw new Error('Invalid Learn reply structure');
  const body=value.body.replace(MARKER,'').trim();
  const question=line(value.question,1000),recap=line(value.recap,1000);
  const choices=value.choices.map(s=>line(s,240).replace(/\|/g,'∣')).filter(Boolean);
  if(!question&&!recap&&choices.length<2)throw new Error('Learn reply has no next action');
  const visual=line(value.visual,360),graph=visual?'':line(value.graph,200);
  return [body,value.keyIdea?'Key idea: '+line(value.keyIdea,400):'',graph?'Graph: '+graph:'',visual?'Visual: '+visual:'',
    value.video?'Video: '+line(value.video,80):'',question?'Your turn: '+question:'',choices.length>=2?'Choices: '+choices.join(' | '):'',
    recap?'Recap: '+recap:'',value.watchOut?'Watch out: '+line(value.watchOut,400):'',value.topic?'Topic: '+line(value.topic,80):'',
    'Lesson plan: '+value.goals.map(s=>s.trim()).join(' | '),'Progress: '+value.part+'/'+value.goals.length,
    state.practiceTotal?'Practice: '+Math.max(1,value.practiceIndex||state.practiceN||1)+'/'+state.practiceTotal:'',
    'Assessment: '+value.assessment,['partial','retry'].includes(value.assessment)&&value.reviewFocus?'Review focus: '+line(value.reviewFocus,160):''].filter(Boolean).join('\n');
}
