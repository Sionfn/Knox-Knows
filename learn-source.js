// One current worksheet per Learn conversation. Keep full-resolution input;
// split it below Firestore's document limit instead of truncating a photo.
export const SOURCE_CHUNKS = 6;
const CHUNK_SIZE = 700000;
const MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function validSource(value) {
  if (!value || typeof value !== 'object') throw new Error('Lesson source is missing.');
  if (value.kind === 'document' && typeof value.name === 'string' && value.name.length <= 200 &&
      typeof value.text === 'string' && value.text.length > 0 && value.text.length <= 60000) {
    return { kind: 'document', name: value.name, text: value.text };
  }
  if (value.kind === 'image' && MIME.has(value.type) && typeof value.data === 'string' &&
      value.data.length > 0 && value.data.length <= 4000000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value.data)) {
    return { kind: 'image', type: value.type, data: value.data };
  }
  throw new Error('This lesson source cannot be saved. Reattach the original file.');
}

export function encodeLearnSource(value, materialId) {
  const source = validSource(value);
  if (typeof materialId !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(materialId)) throw new Error('Invalid lesson source ID.');
  const json = JSON.stringify(source), total = Math.ceil(json.length / CHUNK_SIZE);
  if (total > SOURCE_CHUNKS) throw new Error('Lesson source is too large.');
  return Array.from({ length: total }, (_, index) => ({
    materialId, index, total, data: json.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
  }));
}

export function decodeLearnSource(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const first = rows[0];
  if (!first || !Number.isInteger(first.total) || first.total < 1 || first.total > SOURCE_CHUNKS ||
      rows.length !== first.total || typeof first.materialId !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(first.materialId)) {
    throw new Error('Saved lesson source is incomplete.');
  }
  const sorted = [...rows].sort((a, b) => a.index - b.index);
  if (!sorted.every((row, index) => row.index === index && row.total === first.total &&
      row.materialId === first.materialId && typeof row.data === 'string' && row.data.length > 0 && row.data.length <= CHUNK_SIZE)) {
    throw new Error('Saved lesson source is incomplete.');
  }
  return validSource(JSON.parse(sorted.map(row => row.data).join('')));
}

// Explicit uploads replace the old source; never send a document and image
// together, or reuse material from another account or lesson session.
export function selectLearnSource({ image, document, cached, uid, sessionId, learn }) {
  if (image) return { kind: 'image', data: image.data, type: image.type };
  if (document) return { kind: 'document', name: document.name, text: document.text };
  return learn && uid && cached?.uid === uid && cached.sessionId === sessionId ? cached.source : null;
}
