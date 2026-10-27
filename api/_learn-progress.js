// A question count requested by the student is an honest denominator. A model's
// guessed number of conceptual teaching parts is not a completion percentage.
export function requestedPracticeCount(history = [], question = '') {
  const names = ['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  const number = '(\\d{1,2}|' + names.join('|') + ')';
  const count = new RegExp('\\b' + number + '\\s+(?:more\\s+)?(?:practice\\s+)?(?:questions?|problems?|exercises?)\\b', 'i');
  const messages = [...history.filter(m => m?.role === 'user').map(m => m.content), question];
  for (const value of messages.reverse()) {
    if (typeof value !== 'string' || !/\b(give|ask|practice|quiz|solve|want|need|review|test|try|do|work)\b/i.test(value)) continue;
    const match = count.exec(value);
    if (match) { const n = Number(match[1]) || names.indexOf(match[1].toLowerCase()) + 1; return n >= 2 && n <= 12 ? n : 0; }
  }
  return 0;
}

export function honestLearnProgress(answer, total) {
  return String(answer).replace(/^\s*(?:[-*•]\s+)?(?:\*\*)?progress\s*:(?:\*\*)?\s*(\d{1,2})\s*\/\s*\d{1,2}[^\n]*$/gmi,
    (_, n) => total ? `Progress: ${Math.max(1, Math.min(Number(n), total))}/${total}` : '').replace(/\n{3,}/g, '\n\n').trim();
}

// Lesson parts are named learning goals, independent of reply/question counts.
// Canonical metadata travels with each answer, so saved/long lessons keep their
// plan without a new database, a browser-only counter or another model call.
const LINE = /^\s*(?:[-*•]\s+)?(?:\*\*)?(lesson plan|progress|practice)\s*:(?:\*\*)?\s*(.*)$/gmi;
const needsSupport = question => /\b(?:hint|stuck|don[’']?t know|do not know|not sure|idk|confused|help me understand)\b|^(?:can you |could you |please )?(?:show|give) (?:me )?(?:an?|another|a similar) example|^(?:can you |could you |please )?explain\b|\b(?:make|switch|change|use|give|show)\b.{0,24}\b(?:multiple.choice|choices|options)\b/i.test(String(question || '').trim());
const countPair = s => { const m = /^(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(s || ''); return m && +m[1] > 0 && +m[2] > 0 && +m[2] <= 12 && +m[1] <= +m[2] ? {n:+m[1], total:+m[2]} : null; };
function readLesson(text = '') {
  const out = { plan: [], part: 1, practice: null, complete: false };
  let progress = null;
  for (const m of String(text).matchAll(LINE)) {
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'lesson plan') {
      const titles = value.split('|').map(s => s.replace(/\*\*|`/g, '').trim());
      if (titles.length >= 1 && titles.length <= 6 && titles.every(s => s.length >= 3 && s.length <= 64) && new Set(titles.map(s=>s.toLowerCase())).size === titles.length) out.plan = titles;
    } else if (key === 'progress') progress = countPair(value);
    else out.practice = countPair(value);
  }
  if (out.plan.length && progress) out.part = Math.min(progress.n, out.plan.length);
  // A final question is still work to do, not a completed lesson.
  const prose = String(text).replace(LINE, '');
  out.complete = /^\s*(?:[-*•]\s+)?(?:\*\*)?recap\s*:/im.test(prose) && !/\?|^\s*(?:[-*•]\s+)?(?:\*\*)?(?:your turn|choices)\s*:/im.test(prose);
  return out;
}
export function learnLessonContext(history = [], question = '') {
  const last = [...history].reverse().find(m => m?.role === 'assistant' && typeof m.content === 'string' && (readLesson(m.content).plan.length || readLesson(m.content).complete));
  const prior = readLesson(last?.content);
  const requested = requestedPracticeCount([], question);
  const newTopic = /\b(?:new topic|change (?:the )?topic|switch (?:to|topics)|instead.{0,20}(?:teach|learn|study)|now (?:teach|help) me (?:about|with))\b/i.test(question);
  const fresh = prior.complete || newTopic || !!requested;
  // The newest canonical reply is sufficient even after the opening scrolls
  // out of the model's context. Do not resurrect an old practice count.
  const practiceTotal = requested || (!fresh ? prior.practice?.total || 0 : 0);
  return { plan: fresh ? [] : prior.plan, part: fresh ? 1 : prior.part, practiceTotal,
    practiceN: fresh ? 1 : prior.practice?.n || 1, question };
}
export function learnLessonReminder(state) {
  const format = 'End each substantive reply with Lesson plan: short goal | next goal (1–6 distinct titles, at most 64 characters each) and Progress: current/total. Repeat the same exact plan on later replies; it is hidden metadata displayed as a lesson map. A short task can have one part, a broader task can have two, four, five or six; never default to three. Parts are learning goals, not messages, individual operations or questions. Several guiding questions, attempts and examples may belong to ONE part. Move forward only when the student has demonstrated that goal. Hints, wrong/incomplete answers and help requests stay in the same part. Do not add parts or surprise compulsory checks. If the student already demonstrates the remaining goals, accept that and finish without redundant testing. On completing the last goal, confirm and Recap with no new question.';
  const current = state.plan.length
    ? `Keep this lesson map fixed: ${state.plan.join(' | ')}. Current part ${state.part}/${state.plan.length}: ${state.plan[state.part - 1]}. Stay here while developing this goal; do not advance simply because one answer was correct.`
    : 'Choose the smallest useful finite lesson map for THIS request now. Use concrete student-facing goal titles, not generic Introduction/Practice/Conclusion. If continuing an older lesson without a map, plan only its remaining goals; do not restart work already mastered. Do not spend a turn asking the student to choose a plan. Start teaching immediately and keep the plan in metadata, not a repeated numbered outline in the explanation.';
  const practice = state.practiceTotal
    ? `This is an explicitly requested set of ${state.practiceTotal} questions. Add Practice: ${state.practiceN}/${state.practiceTotal} for the current question. This is a QUESTION counter separate from the lesson parts. Keep the current question through its steps/hints/retries, advance it only after the whole question is answered, and ask exactly that many questions. Worked examples are not counted. A focused practice set usually needs one goal/part, not one part per question. After the final answer recap without another question. Never supply the next question's answer.`
    : 'Do not emit Practice: or invent a fixed question count. Ask only the questions needed to demonstrate each learning goal. Keep the lesson concise and finite.';
  return `${format}\n${current}\n${practice}`;
}
export function learnLessonIssue(answer, state) {
  if (readLesson(answer).complete && needsSupport(state.question)) return 'The student asked for support, not completion. Help with the CURRENT question/goal using a smaller hint or parallel example and ONE approachable question. Do not recap, advance the part, or advance the practice question.';
  if (readLesson(answer).complete && state.practiceTotal && state.practiceN < state.practiceTotal) {
    return `The requested practice set is not finished: the student has just answered question ${state.practiceN} of ${state.practiceTotal}. Do not recap or claim completion. Give only the next unanswered practice question, with Practice: ${state.practiceN + 1}/${state.practiceTotal}, without its answer. Keep the lesson map unchanged.`;
  }
  return '';
}
export function normalizeLearnLesson(answer, state) {
  const proposed = readLesson(answer);
  const plan = state.plan.length ? state.plan : proposed.plan;
  let body = String(answer).replace(LINE, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!plan.length) return body; // Missing/malformed model metadata: no invented map.
  const help = needsSupport(state.question);
  const retry = /^(?:not quite|almost|close\b|not yet|that's not|that isn't|that is not|careful|oops)/i.test(body);
  const hold = help || retry;
  const part = !state.plan.length ? 1 : hold ? state.part : Math.max(state.part, Math.min(proposed.part, state.part + 1, plan.length));
  const practiceN = state.practiceTotal ? hold ? state.practiceN : Math.max(state.practiceN, Math.min(proposed.practice?.n || state.practiceN, state.practiceN + 1, state.practiceTotal)) : 0;
  // A hint/retry cannot complete the lesson. An explicitly requested practice
  // set cannot end while questions remain. Keep the body/question intact.
  const canComplete = proposed.complete && !hold && (!state.practiceTotal || state.practiceN >= state.practiceTotal);
  if (!canComplete) body = body.replace(/^\s*(?:[-*•]\s+)?(?:\*\*)?(?:recap|watch out|topic)\s*:[^\n]*$/gmi, '').trim();
  return [body, `Lesson plan: ${plan.join(' | ')}`, `Progress: ${canComplete ? plan.length : part}/${plan.length}`,
    practiceN ? `Practice: ${practiceN}/${state.practiceTotal}` : ''].filter(Boolean).join('\n');
}
