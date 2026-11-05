import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../app.html', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('async function handleImageFile('), source.indexOf('// ── PDF / Word attachments'));

async function pickPhoto({ draft = '', photoAction = true } = {}) {
  const input = { value: draft };
  let reader;
  const submissions = [];
  const window = {
    currentUser: { uid: 'student' },
    _appViewVersion: 1,
    appHandleAsk() {
      submissions.push({ draft: input.value, photo: window._appImage?.name });
    },
  };
  const sandbox = {
    window,
    imageSelectionVersion: 0,
    $: id => id === 'appChatInput' ? input : null,
    fitImageForUpload: async file => file,
    setTimeout: fn => fn(),
    FileReader: class {
      readAsDataURL() { reader = this; }
    },
  };
  vm.runInNewContext(handler, sandbox);
  await window.handleImageFile({ type: 'image/jpeg', name: 'worksheet.jpg', knoxSend: photoAction });
  return {
    input, window, submissions,
    finish() { reader.onload({ target: { result: 'data:image/jpeg;base64,cGhvdG8=' } }); },
  };
}

test('explicit photo send submits once when the composer is empty', async () => {
  const app = await pickPhoto();
  app.finish();
  assert.deepEqual(app.submissions, [{ draft: '', photo: 'worksheet.jpg' }]);
});

test('a previously typed draft is preserved without submitting', async () => {
  const app = await pickPhoto({ draft: 'Keep my earlier question' });
  app.finish();
  assert.equal(app.input.value, 'Keep my earlier question');
  assert.equal(app.window._appImage.name, 'worksheet.jpg');
  assert.deepEqual(app.submissions, []);
});

test('text typed during photo preparation also prevents submission', async () => {
  const app = await pickPhoto();
  app.input.value = 'New unsent text';
  app.finish();
  assert.equal(app.window._appImage.name, 'worksheet.jpg');
  assert.deepEqual(app.submissions, []);
});

test('an attachment-only action never submits', async () => {
  const app = await pickPhoto({ photoAction: false });
  app.finish();
  assert.equal(app.window._appImage.name, 'worksheet.jpg');
  assert.deepEqual(app.submissions, []);
});
