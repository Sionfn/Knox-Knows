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
const MARKER = /^\s*(?:[-*•]\s+)?(choices|progress|recap|watch out|topic|key idea|graph|video|your turn)\s*:\s*(.*)$/i;

export function parseLearn(text) {
  const out = { body: '', choices: [], progress: null, recap: '', watch: '', topic: '', keyIdea: '', graph: '', video: '', question: '' };
  const keep = [];
  for (const line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = MARKER.exec(line.replace(/\*\*/g, ''));
    if (!m) { keep.push(line); continue; }
    const key = m[1].toLowerCase(), value = line.slice(line.indexOf(':') + 1).replace(/^\s*\*\*/, '').trim();
    if (key === 'choices') out.choices = value.split('|').map(c => c.trim()).filter(Boolean).slice(0, 4);
    else if (key === 'progress') { const p = /^(\d{1,2})\s*\/\s*(\d{1,2})/.exec(value); if (p && +p[2] >= 2 && +p[2] <= 12 && +p[1] >= 1) out.progress = { n: Math.min(+p[1], +p[2]), total: +p[2] }; }
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
  if (out.recap && (/\?/.test(out.body) || out.question)) { out.recap = ''; out.watch = ''; }
  return out;
}

const blockquote = s => '> ' + s.replace(/\n/g, '\n> ');

// → { text, choices }: the message for Discord, and the tap-to-answer options.
export function formatLearn(raw) {
  const x = parseLearn(raw);
  const parts = [];
  if (x.progress && !x.recap) parts.push(`-# Part ${x.progress.n} of ${x.progress.total}  ${'●'.repeat(x.progress.n)}${'○'.repeat(x.progress.total - x.progress.n)}`);
  if (x.body) parts.push(x.body);
  if (x.keyIdea) parts.push(blockquote(`🧠 **Key idea:** ${x.keyIdea}`));
  if (x.question) parts.push(`**Your turn:** ${x.question}`);
  if (x.graph) parts.push(`📈 **Try graphing:** \`${x.graph.replace(/`/g, '')}\``);
  if (x.video) parts.push(`🎥 **Watch a short lesson:** <https://www.youtube.com/results?search_query=${encodeURIComponent(x.video)}>`);
  if (x.recap) parts.push(`🎉 **What you learned${x.topic ? ' · ' + x.topic : ''}**\n${blockquote(x.recap)}` + (x.watch ? `\n⚠️ **Watch out:** ${x.watch}` : ''));
  return { text: parts.join('\n\n'), choices: x.choices };
}
