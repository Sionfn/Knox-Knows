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
