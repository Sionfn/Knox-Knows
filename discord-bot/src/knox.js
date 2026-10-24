// Sends a question to the Knox Knows API (the same one the website uses):
// Learn mode (/learn) guides the student; Ask Knox (/ask, learnMode: false)
// gives the full step-by-step answer, like the website's two modes.

const TIMEOUT_MS = 60_000;

export class KnoxError extends Error {}

export async function askKnox({ apiUrl, botKey, question, history = [], image, imageType, discordUserId, learnMode = true }) {
  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Knox-Bot-Key': botKey },
      body: JSON.stringify({ question, learnMode, history, ...(image ? { image, imageType } : {}), discordUserId }),
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

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MAX_PHOTO_BYTES = 3_000_000; // the website's limit

// Downloads a Discord attachment. Returns the raw bytes, or throws KnoxError.
export async function downloadPhoto(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_PHOTO_BYTES) throw new Error('too big');
    return bytes;
  } catch {
    throw new KnoxError("I couldn't open your photo. Please try attaching it again.");
  }
}
