// doc-extract.js — read PDF and Word (.docx) files in the browser.
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

  const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
  const MAX_PAGES      = 60;               // PDF pages read
  const TEXT_LIMIT     = 30000;            // characters sent to Knox (matches the server)
  const SCANNED_BELOW  = 15;               // fewer real characters than this = a scanned PDF (no text layer)

  const PDF_TYPES  = ['application/pdf'];
  const DOCX_TYPES = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

  const kindOf = file => {
    const name = (file?.name || '').toLowerCase();
    if (PDF_TYPES.includes(file?.type) || name.endsWith('.pdf')) return 'pdf';
    if (DOCX_TYPES.includes(file?.type) || name.endsWith('.docx')) return 'docx';
    if (name.endsWith('.doc')) return 'doc';
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
    try { doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; }
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

  window.knoxReadDocument = async function (file) {
    const kind = kindOf(file);
    if (kind === 'doc') throw new Error('Old .doc files aren’t supported — save it as .docx or PDF and try again.');
    if (!kind) throw new Error('Knox can read photos, PDFs, and Word (.docx) files.');
    if (file.size > MAX_FILE_BYTES) throw new Error('That file is over 20 MB. Try a smaller file or just the pages you need.');
    try {
      return kind === 'pdf' ? await readPdf(file) : await readDocx(file);
    } catch (err) {
      if (err?.message && !/unavailable|Failed to fetch|import/i.test(err.message)) throw err;
      throw new Error("Knox couldn't load its file reader. Check your connection and try again.");
    }
  };
  window.KNOX_DOC_TEXT_LIMIT = TEXT_LIMIT;
})();
