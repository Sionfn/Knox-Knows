import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function escHtml('), source.indexOf('function showChatThread('));
const renderer = source.slice(source.indexOf('function renderAnswerHtml('), source.indexOf('// ── Render a video suggestion card'));
const context = {};
runInNewContext(`${helpers}\n${renderer}`, context);

test('Worksheet answers, headings, decimals and inline code stay distinct', () => {
  const html = context.renderAnswerHtml('### Problem 32\n1. **Compute:**\n0.55 × 80 = 44\nAnswer: **44**\n### Problem 33\n1. Next\nAnswer: **7**');
  assert.equal((html.match(/knox-final-answer-label/g) || []).length, 2);
  assert.match(html, /<h3>Problem 32<\/h3>/);
  assert.match(html, /0.55 × 80 = 44/);
  assert.match(context.formatInline('Use `my_value` and **bold**.'), /<code>my_value<\/code>/);
  const code = context.renderAnswerHtml('```text\nAnswer: do not extract\n```');
  assert.doesNotMatch(code, /knox-final-answer/);
  assert.match(code, /Answer: do not extract/);
});

test('Knox answer and Learn hint use a stable, escaped response box', () => {
  const answer = context.renderAnswerHtml('The answer is **4**. <img src=x onerror=alert(1)>');
  assert.match(answer, /knox-response-body/);
  assert.doesNotMatch(answer, /Knox’s answer/);
  assert.match(answer, /<strong>4<\/strong>/);
  assert.doesNotMatch(answer, /<img/);
  const hint = context.renderAnswerHtml('Try dividing both sides by 2.', 'learn');
  assert.match(hint, /knox-response-heading learn/);
  assert.match(hint, /Study hint/);
});

test('Knox keeps code indentation and work-check labels inside the response box', () => {
  const code = context.renderAnswerHtml('Try this:\n```python\nif True:\n    print("hi")\n```');
  assert.match(code, /<pre><code>if True:\n    print\(&quot;hi&quot;\)<\/code><\/pre>|<pre><code>if True:\n    print\("hi"\)<\/code><\/pre>/);
  const check = context.renderAnswerHtml('Verdict: Not quite.\nThe fix: Divide by 2.');
  assert.match(check, /knox-section-card/);
  assert.match(check, /knox-response-body/);
});

test('a solved result follows the steps, including for previously saved replies', () => {
  const rendered = context.renderAnswerHtml('Answer: **x = 7** <script>alert(1)</script>\n\n1. Divide by 3.\n2. Add 5.');
  assert.match(rendered, /knox-final-answer/);
  assert.match(rendered, /<strong>x = 7<\/strong>/);
  assert.doesNotMatch(rendered, /<script>/);
  assert.ok(rendered.indexOf('knox-final-answer') > rendered.indexOf('Divide by 3'));
  assert.equal((rendered.match(/Answer<\/span>/g) || []).length, 1);

  const newReply = context.renderAnswerHtml('1. Divide by 3.\n2. Add 5.\n\nAnswer: **x = 7**');
  assert.ok(newReply.indexOf('knox-final-answer') > newReply.indexOf('Divide by 3'));
  assert.equal((newReply.match(/x = 7/g) || []).length, 1);

  const hint = context.renderAnswerHtml('Answer: x = 7\nTry dividing by 3.', 'learn');
  assert.doesNotMatch(hint, /knox-final-answer/);
  const openEnded = context.renderAnswerHtml('Photosynthesis converts light into chemical energy.');
  assert.doesNotMatch(openEnded, /knox-final-answer/);
});

test('numbered step labels have the same emphasis with or without model-supplied bold', () => {
  const plain = context.renderAnswerHtml('1. Identify the coefficients: a = 3.\nAnswer: x = 1');
  const bold = context.renderAnswerHtml('1. **Identify the coefficients:** a = 3.\nAnswer: x = 1');
  assert.match(plain, /<strong>Identify the coefficients:<\/strong> a = 3/);
  assert.match(bold, /<strong>Identify the coefficients:<\/strong> a = 3/);
  assert.doesNotMatch(context.renderAnswerHtml('1. <img src=x>: unsafe'), /<img/);
});
