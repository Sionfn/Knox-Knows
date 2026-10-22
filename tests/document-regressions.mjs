import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync('doc-extract.js', 'utf8');
// Minimal XML fixture parser. Production uses the browser's native DOMParser.
class FixtureParser {
  parseFromString(xml) {
    const root = { children: [], getElementsByTagName(name) { return walk(this).filter(n => name === '*' || n.tag === name); } };
    const stack = [root];
    for (const token of xml.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('<?')) continue;
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = token.match(/^<([^\s/>]+)/)[1], attrs = Object.fromEntries([...token.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
        const node = { tag, localName: tag.split(':').at(-1), children: [], value: '', getAttribute: n => attrs[n] || null, getAttributeNS: (_, n) => attrs['r:' + n] || null, getElementsByTagName: root.getElementsByTagName };
        Object.defineProperty(node, 'textContent', { get() { return this.value + this.children.map(c => c.textContent).join(''); } });
        stack.at(-1).children.push(node);
        if (!token.endsWith('/>')) stack.push(node);
      } else stack.at(-1).value += token;
    }
    return root;
  }
}
function walk(node) { return node.children.flatMap(n => [n, ...walk(n)]); }
function reader({ texts = [], files = {} } = {}) {
  const pdf = { numPages: texts.length, getPage: async i => ({
    getTextContent: async () => ({ items: [{ str: texts[i - 1] }] }),
    getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve() })
  }) };
  const window = { userTier: 'mega', JSZip: { loadAsync: async () => ({ file: p => files[p] ? { async: async () => files[p] } : null }) } };
  const code = source.replace('pdfjsPromise ||= import(PDFJS_URL)', 'pdfjsPromise ||= Promise.resolve(fakePdfJs)');
  runInNewContext(code, { window, fakePdfJs: { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve(pdf) }) }, URL, DOMParser: FixtureParser, File: class { constructor(_, name) { this.name = name; } },
    document: { createElement: () => ({ getContext: () => ({}), toBlob: callback => callback({}) }) } });
  return name => window.knoxReadDocument({ name, size: 100, arrayBuffer: async () => new ArrayBuffer(0) });
}
test('PDF rejects unreadable mixed pages and multi-page scans, rather than silently omitting them', async () => {
  await assert.rejects(reader({ texts: ['Detailed searchable notes about human anatomy.', ''] })('notes.pdf'), /page 2/);
  await assert.rejects(reader({ texts: ['', ''] })('scan.pdf'), /2 pages/);
  const image = await reader({ texts: [''] })('one.pdf');
  assert.equal(image.kind, 'image');
  const text = await reader({ texts: ['Detailed searchable notes about human anatomy.'] })('text.pdf');
  assert.equal(text.kind, 'text');
  assert.match(text.text, /human anatomy/);
});
test('PowerPoint uses visible slide order and each slide’s actual notes relationship', async () => {
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://example/${type}" Target="${target}"/>`;
  const slide = text => `<a:p><a:t>${text}</a:t></a:p>`;
  const files = {
    'ppt/presentation.xml': '<p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst>',
    'ppt/_rels/presentation.xml.rels': '<Relationships>' + rel('first', 'slide', 'slides/slide1.xml') + rel('second', 'slide', 'slides/slide9.xml') + '</Relationships>',
    'ppt/slides/slide1.xml': slide('Second visible slide'),
    'ppt/slides/slide9.xml': slide('First visible slide'),
    'ppt/slides/_rels/slide9.xml.rels': '<Relationships>' + rel('notes', 'notesSlide', '../notesSlides/notesSlide3.xml') + '</Relationships>',
    'ppt/notesSlides/notesSlide3.xml': slide('Correct speaker notes'),
    'ppt/notesSlides/notesSlide9.xml': slide('WRONG filename-matched notes')
  };
  const result = await reader({ files })('slides.pptx');
  assert.match(result.text, /Slide 1 —\nFirst visible slide\nNotes: Correct speaker notes/);
  assert.match(result.text, /Slide 2 —\nSecond visible slide/);
  assert.doesNotMatch(result.text, /WRONG/);
});
