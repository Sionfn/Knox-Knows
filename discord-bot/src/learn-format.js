// Learn replies end with marker lines that the website turns into buttons and
// cards (see renderAnswerHtml in app.html). Discord can't show those, so this
// turns them into Discord formatting instead of leaving them as raw text:
//   Choices: a | b | c   → tap-to-answer buttons (returned as `choices`)
//   Progress: 2/4        → "Part 2 of 4 ●●○○" (lesson parts, like the website; hidden once it's finished)
//   Key idea: …          → a 🧠 quote block
//   Recap / Watch out / Topic → a 🎉 "What you learned" section
//   Video: …             → a YouTube search link
//   Graph: …             → the equation to graph (Discord can't draw it)

// Same marker rule as the website: a line may be bolded or a bullet ("- **Choices:** …").
const MARKER = /^\s*(?:[-*•]\s+)?(choices|progress|practice|lesson plan|recap|watch out|topic|key idea|graph|video|visual|your turn|assessment|review focus)\s*:\s*(.*)$/i;

// The question sentence a reply ends with ("…both sides. What do you get?" →
// "What do you get?"), and the text before it. Never taken from a list step.
function trailingQuestion(body) {
  const text = String(body || '').trimEnd();
  if (!/\?(\*\*)?\s*$/.test(text)) return null;
  const nl = text.lastIndexOf('\n'), lastLine = text.slice(nl + 1);
  if (/^\s*(?:\d{1,2}[.)]|[-*•])\s/.test(lastLine)) return null;
  const starts = [...lastLine.matchAll(/[.!:]\s+(?=\**[A-Z“"(¿¡0-9])/g)].map(m => m.index + m[0].length);
  const cut = starts.length ? starts[starts.length - 1] : 0;
  const question = lastLine.slice(cut).trim();
  if (question.length < 4) return null;
  return { question, body: (text.slice(0, nl + 1) + lastLine.slice(0, cut)).trim() };
}
export function parseLearn(text) {
  const out = { body: '', choices: [], progress: null, practice: null, lessonPlan: [], recap: '', watch: '', topic: '', keyIdea: '', graph: '', video: '', question: '' };
  const keep = [];
  for (const line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = MARKER.exec(line.replace(/\*\*/g, ''));
    if (!m) { keep.push(line); continue; }
    const key = m[1].toLowerCase(), label = line.slice(0, line.indexOf(':'));
    const labelClosesAfterColon = /^\s*(?:[-*•]\s+)?\*\*/.test(label) && !label.trim().endsWith('**');
    const value = line.slice(line.indexOf(':') + 1).replace(labelClosesAfterColon ? /^\s*\*\*/ : /^\s*/, '').trim();
    if (key === 'choices') out.choices = value.split('|').map(c => c.trim()).filter(Boolean).slice(0, 4);
    else if (key === 'progress' || key === 'practice') { const p = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(value); if (p && +p[2] >= 1 && +p[2] <= 12 && +p[1] >= 1 && +p[1] <= +p[2]) out[key] = { n: +p[1], total: +p[2] }; }
    else if (key === 'lesson plan') { const titles = value.split('|').map(s=>s.trim()); if (titles.length <= 6 && titles.every(s=>s.length >= 3 && s.length <= 64)) out.lessonPlan = titles; }
    else if (key === 'recap') out.recap = value;
    else if (key === 'watch out') out.watch = value;
    else if (key === 'topic') out.topic = value.slice(0, 80);
    else if (key === 'key idea') out.keyIdea = value.slice(0, 400);
    else if (key === 'your turn') out.question = value.slice(0, 1000);
    else if (key === 'graph') out.graph = value.slice(0, 200);
    else if (key === 'video') out.video = value.replace(/^["“]|["”]$/g, '').slice(0, 80);
  }
  if (out.choices.length < 2) out.choices = [];
  out.body = keep.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // A check-for-understanding question is still a lesson step, not the end (website rule).
  if (out.recap && (/\?/.test(out.body) || out.question || out.choices.length)) { out.recap = ''; out.watch = ''; }
  // The same question already ends the message: don't repeat it (website rule).
  const normalized = s => s.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim();
  if (out.question.length > 3 && normalized(out.body).endsWith(normalized(out.question))) out.question = '';
  // The question being asked gets its own bold Your turn line, so it's easy to spot (website rule).
  if (!out.question) { const q = trailingQuestion(out.body); if (q) { out.question = q.question; out.body = q.body; } }
  return out;
}

const blockquote = s => '> ' + s.replace(/\n/g, '\n> ');

// → { text, choices }: the message for Discord, and the tap-to-answer options.
export function formatLearn(raw) {
  const x = parseLearn(raw);
  const parts = [];
  // One counter, like the website: practice questions while practising, otherwise
  // the lesson's goals (only when there are 2+), with the current goal's name.
  const dots = c => '●'.repeat(c.n) + '○'.repeat(c.total - c.n);
  const goal = x.lessonPlan.length >= 2 && x.lessonPlan.length === x.progress?.total ? x.lessonPlan[x.progress.n - 1] : '';
  if (!x.recap && x.practice) parts.push(`-# Practice ${x.practice.n} of ${x.practice.total}  ${dots(x.practice)}${goal ? ` · ${goal}` : ''}`);
  else if (!x.recap && x.progress && x.progress.total >= 2) parts.push(`-# Part ${x.progress.n} of ${x.progress.total}  ${dots(x.progress)}${goal ? ` · ${goal}` : ''}`);
  if (x.body) parts.push(x.body);
  if (x.keyIdea) parts.push(blockquote(`🧠 **Key idea:** ${x.keyIdea}`));
  if (x.question) parts.push(`**Your turn:** ${x.question}`);
  if (x.graph) parts.push(`📈 **Try graphing:** \`${x.graph.replace(/`/g, '')}\``);
  if (x.video) parts.push(`🎥 **Watch a short lesson:** <https://www.youtube.com/results?search_query=${encodeURIComponent(x.video)}>`);
  if (x.recap) parts.push(`🎉 **What you learned${x.topic ? ' · ' + x.topic : ''}**\n${blockquote(x.recap)}` + (x.watch ? `\n⚠️ **Watch out:** ${x.watch}` : ''));
  return { text: parts.join('\n\n'), choices: x.choices };
}
