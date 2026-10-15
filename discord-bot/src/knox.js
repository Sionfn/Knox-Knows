// Sends a question to the Knox Knows API (the same one the website uses),
// in Learn mode so Knox guides the student instead of handing over answers.

const TIMEOUT_MS = 60_000;

export class KnoxError extends Error {}

export async function askKnox({ apiUrl, botKey, question, discordUserId }) {
  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Knox-Bot-Key': botKey },
      body: JSON.stringify({ question, learnMode: true, history: [], discordUserId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new KnoxError(err.name === 'TimeoutError'
      ? 'Knox took too long to answer. Please try again in a minute.'
      : "Knox couldn't be reached right now. Please try again in a minute.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.answer !== 'string' || !data.answer.trim()) {
    console.error(`Knox API error ${res.status}:`, data.error || '(no message)');
    throw new KnoxError(res.status === 429
      ? 'Knox is very busy right now. Please try again in a few minutes.'
      : 'Knox had trouble answering that one. Please try again.');
  }
  return data.answer.trim();
}
