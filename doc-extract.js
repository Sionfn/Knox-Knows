// doc-extract.js — read PDF, Word (.docx), PowerPoint (.pptx) and text files in the browser,
// plus Excel (.xlsx) rows and photos for Flashcards.
//
// Used by Ask Knox, Learn and Flashcards. Only the extracted text is sent to
// Knox (not the file), so uploads stay small and fast. The readers load from
// cdnjs the first time someone attaches a document — no cost otherwise.
//
//   window.knoxReadDocument(file) →
//     { kind: 'text',  name, text, truncated, pages }   text documents
//     { kind: 'image', name, file }                      scanned PDF: page 1 as a JPEG
//   Throws an Error with a student-friendly message when the file can't be used.
(function () {
  const PDFJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
  const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js';
  const JSZIP_URL   = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
  const MAX_PAGES      = 60;               // PDF pages read
  const TEXT_LIMIT     = 30000;            // characters sent to Knox (matches the server)
  const SCANNED_BELOW  = 15;               // fewer real characters than this = a scanned PDF (no text layer)

  const PDF_TYPES  = ['application/pdf'];
  const DOCX_TYPES = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const PPTX_TYPES = ['application/vnd.openxmlformats-officedocument.presentationml.presentation'];

  const kindOf = file => {
    const name = (file?.name || '').toLowerCase();
    if (PDF_TYPES.includes(file?.type) || name.endsWith('.pdf')) return 'pdf';
    if (DOCX_TYPES.includes(file?.type) || name.endsWith('.docx')) return 'docx';
    if (PPTX_TYPES.includes(file?.type) || name.endsWith('.pptx')) return 'pptx';
    if (/\.(txt|md|markdown)$/.test(name) || file?.type === 'text/plain' || file?.type === 'text/markdown') return 'txt';
    if (name.endsWith('.doc')) return 'doc';
    if (name.endsWith('.ppt')) return 'ppt';
    return null;
  };
  window.knoxIsDocument = file => !!kindOf(file);

  let pdfjsPromise = null;
  function loadPdfJs() {
    pdfjsPromise ||= import(PDFJS_URL).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = WORKER_URL;
      return lib;
    }).catch(err => { pdfjsPromise = null; throw err; });
    return pdfjsPromise;
  }
  const scripts = {};
  function loadScript(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    scripts[url] ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error('reader unavailable'));
      s.onerror = () => { delete scripts[url]; reject(new Error('reader unavailable')); };
      document.head.appendChild(s);
    });
    return scripts[url];
  }
  let mammothPromise = null;
  function loadMammoth() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    mammothPromise ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = MAMMOTH_URL;
      s.onload = () => window.mammoth ? resolve(window.mammoth) : reject(new Error('Word reader unavailable'));
      s.onerror = () => { mammothPromise = null; reject(new Error('Word reader unavailable')); };
      document.head.appendChild(s);
    });
    return mammothPromise;
  }

  // Some sites save downloads with web-encoded names ("Unit 7 %E2%80%93 Bones.pdf");
  // show them as normal text ("Unit 7 – Bones.pdf").
  const niceName = name => {
    const raw = String(name || 'Document');
    if (!/%[0-9A-Fa-f]{2}/.test(raw)) return raw;
    try { return decodeURIComponent(raw); } catch { return raw; }
  };

  const tidy = text => String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  function finish(name, text, pages, morePages) {
    const clean = tidy(text);
    const truncated = morePages || clean.length > TEXT_LIMIT;
    return { kind: 'text', name, text: clean.slice(0, TEXT_LIMIT), truncated, pages };
  }

  async function readPdf(file) {
    const pdfjs = await loadPdfJs();
    let doc;
    try { doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise; }
    catch (err) {
      if (err?.name === 'PasswordException') throw new Error('That PDF is password-protected. Remove the password and try again.');
      throw new Error("Knox couldn't open that PDF. Try saving it again or uploading a photo instead.");
    }
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const parts = [];
    let length = 0;
    for (let i = 1; i <= pages && length < TEXT_LIMIT; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '', lastY = null;
      const lines = [];
      for (const item of content.items) {
        const y = item.transform?.[5];
        if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
        line += item.str + (item.hasEOL ? '\n' : '');
        lastY = y;
      }
      lines.push(line);
      const text = lines.join('\n');
      parts.push(`— Page ${i} —\n${text}`);
      length += text.length;
    }
    const realChars = parts.join('').replace(/— Page \d+ —|\s/g, '').length;
    if (realChars < SCANNED_BELOW) {
      // A scanned PDF is just pictures of pages: send page 1 as a photo.
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, 2200 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
      if (!blob) throw new Error("Knox couldn't read that PDF. Try uploading a photo of the page instead.");
      const name = file.name.replace(/\.pdf$/i, '') + ' (page 1).jpg';
      return { kind: 'image', name: file.name, file: new File([blob], name, { type: 'image/jpeg' }) };
    }
    return finish(file.name, parts.join('\n\n'), pages, doc.numPages > MAX_PAGES);
  }

  async function readDocx(file) {
    const mammoth = await loadMammoth();
    let result;
    try { result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); }
    catch { throw new Error("Knox couldn't open that Word file. Try saving it again as .docx or PDF."); }
    if (!tidy(result.value)) throw new Error('That Word file looks empty.');
    return finish(file.name, result.value, null, false);
  }

  // A .pptx is a zip of slide XML files: read each slide's text (and its
  // speaker notes) in slide order.
  async function readPptx(file) {
    const JSZip = await loadScript(JSZIP_URL, 'JSZip');
    let zip;
    try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
    catch { throw new Error("Knox couldn't open that PowerPoint. Try saving it again as .pptx or PDF."); }
    const num = path => Number(path.match(/(\d+)\.xml$/)?.[1] || 0);
    const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
    if (!slides.length) throw new Error('That PowerPoint has no slides Knox can read.');
    const textOf = xml => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      return [...doc.getElementsByTagName('a:p')]
        .map(p => [...p.getElementsByTagName('a:t')].map(t => t.textContent).join(''))
        .filter(line => line.trim()).join('\n');
    };
    const parts = [];
    let length = 0;
    for (const path of slides.slice(0, MAX_PAGES)) {
      if (length >= TEXT_LIMIT) break;
      const text = textOf(await zip.file(path).async('string'));
      const notesPath = `ppt/notesSlides/notesSlide${num(path)}.xml`;
      const notes = zip.file(notesPath) ? textOf(await zip.file(notesPath).async('string')).replace(/^\d+$/m, '').trim() : '';
      const block = `— Slide ${num(path)} —\n${text}${notes ? '\nNotes: ' + notes : ''}`;
      parts.push(block);
      length += block.length;
    }
    if (!parts.join('').replace(/— Slide \d+ —|\s/g, '')) throw new Error("That PowerPoint's slides are only pictures. Try exporting it as a PDF, or upload a photo of a slide.");
    return finish(file.name, parts.join('\n\n'), Math.min(slides.length, MAX_PAGES), slides.length > MAX_PAGES);
  }

  // Excel (.xlsx): the first sheet's rows as arrays of cell text.
  window.knoxReadSpreadsheet = async function (file) {
    if (file.size > MAX_FILE_BYTES) throw new Error('That file is over 20 MB. Try a smaller file.');
    let JSZip;
    try { JSZip = await loadScript(JSZIP_URL, 'JSZip'); }
    catch { throw new Error("Knox couldn't load its file reader. Check your connection and try again."); }
    let zip;
    try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
    catch { throw new Error("Knox couldn't open that Excel file. Try saving it again as .xlsx or .csv."); }
    const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');
    const shared = zip.file('xl/sharedStrings.xml')
      ? [...parse(await zip.file('xl/sharedStrings.xml').async('string')).getElementsByTagName('si')]
          .map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''))
      : [];
    const sheetPath = Object.keys(zip.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
      .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]))[0];
    if (!sheetPath) throw new Error('That Excel file has no sheets Knox can read.');
    const col = ref => [...String(ref || '').replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const rows = [];
    for (const row of parse(await zip.file(sheetPath).async('string')).getElementsByTagName('row')) {
      const cells = [];
      for (const c of row.getElementsByTagName('c')) {
        const type = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        const text = type === 's' ? shared[Number(v)] ?? ''
          : type === 'inlineStr' ? [...c.getElementsByTagName('t')].map(t => t.textContent).join('')
          : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
        const i = col(c.getAttribute('r'));
        cells[i >= 0 ? i : cells.length] = text;
      }
      rows.push(Array.from(cells, c => c ?? ''));
    }
    return rows;
  };

  // Photos (notes, textbook pages, slides): shrink to a JPEG small enough to
  // send. iPhone HEIC photos work where the browser can open them (Safari).
  const PHOTO_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i;
  window.knoxIsPhoto = file => /^image\//.test(file?.type || '') || PHOTO_EXT.test(file?.name || '');
  window.knoxShrinkPhoto = async function (file, maxEdge = 1600, maxChars = 1_400_000) {
    if (file.size > MAX_FILE_BYTES) throw new Error('That photo is over 20 MB. Try a smaller one.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      try { await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; }); }
      catch {
        throw new Error(/\.hei[cf]$/i.test(file.name)
          ? "This browser can't open iPhone HEIC photos. Take a screenshot of it, or set your camera to “Most Compatible”."
          : "Knox couldn't open that picture. Try a JPEG or PNG.");
      }
      for (const edge of [maxEdge, 1200, 900]) {
        const k = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs → white, not black
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const q of [0.85, 0.72]) {
          const data = canvas.toDataURL('image/jpeg', q).split(',')[1];
          if (data.length <= maxChars) return { name: niceName(file.name), type: 'image/jpeg', data };
        }
      }
      throw new Error('That photo is too large. Try cropping it.');
    } finally { URL.revokeObjectURL(url); }
  };

  async function readTxt(file) {
    const text = await file.text();
    if (!tidy(text)) throw new Error('That file looks empty.');
    return finish(file.name, text, null, false);
  }

  window.knoxReadDocument = async function (file) {
    const kind = kindOf(file);
    if (kind === 'doc') throw new Error('Old .doc files aren’t supported — save it as .docx or PDF and try again.');
    if (kind === 'ppt') throw new Error('Old .ppt files aren’t supported — save it as .pptx or PDF and try again.');
    if (!kind) throw new Error('Knox can read photos, PDFs, Word (.docx) and PowerPoint (.pptx) files.');
    if (file.size > MAX_FILE_BYTES) throw new Error('That file is over 20 MB. Try a smaller file or just the pages you need.');
    try {
      const doc = kind === 'pdf' ? await readPdf(file) : kind === 'pptx' ? await readPptx(file) : kind === 'txt' ? await readTxt(file) : await readDocx(file);
      doc.name = niceName(doc.name);
      return doc;
    } catch (err) {
      if (err?.message && !/unavailable|Failed to fetch|import/i.test(err.message)) throw err;
      throw new Error("Knox couldn't load its file reader. Check your connection and try again.");
    }
  };
  window.KNOX_DOC_TEXT_LIMIT = TEXT_LIMIT;
})();
