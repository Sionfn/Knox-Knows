import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function escHtml('), source.indexOf('function showChatThread('));
const renderer = source.slice(source.indexOf('// ── Learn extras'), source.indexOf('// ── Render a video suggestion card'));
const context = { window: {}, document: { addEventListener() {}, querySelectorAll: () => [] } };
runInNewContext(`${helpers}\n${renderer}`, context);

test('lesson map names the current goal and separates practice questions from parts',()=>{
 const raw='Try it.\nYour turn: What is the result?\nLesson plan: Understand balance | Solve independently\nProgress: 2/2\nPractice: 3/5';
 const html=context.renderAnswerHtml(raw,'learn');
 // While practising, the heading counts practice questions; the lesson map shows the current goal.
 assert.match(html,/<b>Practice 3\/5<\/b>/);assert.doesNotMatch(html,/Part 2\/2/);
 assert.match(html,/class="learn-map-label">Lesson plan<\/span><span class="learn-map-now">Solve independently<\/span>/);
 assert.match(html,/aria-current="step"><span class="lm-dot" aria-hidden="true"><\/span>Solve independently<span class="sr-only"> — current/);
 assert.match(html,/Understand balance<span class="sr-only"> — completed/);
 assert.doesNotMatch(context.window.knoxLearnClean(raw),/Lesson plan:|Progress:|Practice:/);
 const single=context.renderAnswerHtml(raw.replace('Understand balance | Solve independently','Solve independently').replace('2/2','1/1'),'learn');
 // A one-goal lesson: no part counter and no map (practice still counts).
 assert.doesNotMatch(single,/Part 1\/1|learn-map/);assert.match(single,/Practice 3\/5/);
 const unsafe=context.renderAnswerHtml(raw.replace('Solve independently','<img src=x onerror=alert(1)>'),'learn');
 assert.doesNotMatch(unsafe,/<img/);
 const done=context.renderAnswerHtml('Correct.\nRecap: All done.\nLesson plan: Read fractions\nProgress: 1/1','learn');
 assert.doesNotMatch(done,/learn-map|learn-progress|learn-practice/);
 assert.match(context.window.knoxLearnClean('Correct.\nRecap: All done.\nWatch out: Keep balance.'),/What you learned: All done/);
});
test('metadata formatting keeps the first bold keyword intact',()=>{
 for (const prefix of ['Key idea: ','**Key idea:** ','**Key idea**: ']) {
  const html=context.renderAnswerHtml('Try.\n'+prefix+'**Balance** matters.\nYour turn: Why?','learn');
  assert.match(html,/<strong>Balance<\/strong>/);
 }
});
test('only the latest actual reply can own active Learn buttons, including imperative prompts',()=>{
 const imperative=context.renderAnswerHtml('Solve 3x − 4 = 17. Show your steps.\nLesson plan: Solve equations\nProgress: 1/1','learn');
 assert.match(imperative,/I’m stuck/);
 const old={disabled:false},current={disabled:false};
 const document=context.document;
 context.document={querySelectorAll:selector=>selector.endsWith('.msg-knox-bubble')?[{contains:b=>b===old},{contains:b=>b===current}]:[old,current]};
 context.settleLearnActions();assert.equal(old.disabled,true);assert.equal(current.disabled,false);
 context.document={querySelectorAll:selector=>selector.endsWith('.msg-knox-bubble')?[{contains:()=>false}]:[old,current]};
 context.settleLearnActions();assert.equal(old.disabled,true);assert.equal(current.disabled,true);
 context.document=document;
});

test('the question Knox asks is always in the Your turn card, once', () => {
  const raw='Use **inverse operations**.\n\n`3x + 5 = 20`\nKey idea: Do the same thing to both sides.\nYour turn: What remains after subtracting **5** from both sides?\nProgress: 1/2';
  const html=context.renderAnswerHtml(raw,'learn');
  assert.match(html,/<strong>inverse operations<\/strong>/);
  assert.match(html,/<code>3x \+ 5 = 20<\/code>/);
  assert.match(html,/class="learn-key"/);assert.match(html,/class="learn-question"/);
  assert.equal((html.match(/What remains after subtracting/g)||[]).length,1);
  assert.match(html,/Hint/);assert.match(html,/I’m stuck/);
  assert.match(context.window.knoxLearnClean(raw),/What remains after subtracting/);
  assert.doesNotMatch(context.window.knoxLearnClean(raw),/Your turn:|Progress:/);
  const unsafe=context.renderAnswerHtml('Your turn: <img src=x onerror=alert(1)>?','learn');
  assert.doesNotMatch(unsafe,/<img/);assert.match(unsafe,/&lt;img/);
  const premature=context.renderAnswerHtml('Great.\nRecap: Finished\nYour turn: Calculate the result.','learn');
  assert.doesNotMatch(premature,/Lesson complete|learn-recap/);
});

test('long and short replies both put their question in the Your turn card', () => {
  const body='Use **inverse operations** to isolate the variable.\n\nFor example, solve `2a + 4 = 12` by undoing each operation in reverse order.\n1. **Subtract 4** from both sides to leave `2a = 8`.\n2. **Divide by 2** on both sides to get `a = 4`.';
  const question='What remains after subtracting 5 from both sides of `3x + 5 = 20`?';
  const raw=body+'\nYour turn: '+question+'\nKey idea: Keep both sides balanced.';
  const html=context.renderAnswerHtml(raw,'learn');
  assert.match(html,/class="learn-question" role="group" aria-label="Your turn"/);
  assert.equal((html.match(/What remains after subtracting/g)||[]).length,1);
  assert.match(html,/I’m stuck/);
  assert.equal((context.window.knoxLearnClean(raw).match(/What remains after subtracting/g)||[]).length,1);
  const brief=context.renderAnswerHtml('Correct.\nYour turn: What is 21 divided by 3?','learn');
  assert.match(brief,/class="learn-question"[\s\S]*What is 21 divided by 3/);
  // A question written at the end of the text moves into the card too — never one from a numbered step.
  const inline=context.renderAnswerHtml('Subtract 5 from both sides. What do you get?','learn');
  assert.match(inline,/<p>Subtract 5 from both sides\.<\/p>[\s\S]*class="learn-question"[\s\S]*What do you get\?/);
  assert.equal((inline.match(/What do you get/g)||[]).length,1);
  assert.doesNotMatch(context.renderAnswerHtml('Steps:\n1. Is it even?','learn'),/class="learn-question"/);
  const duplicate=context.renderAnswerHtml('Try it. What is **21** divided by 3?\nYour turn: What is 21 divided by 3?','learn');
  assert.equal((duplicate.match(/divided by 3/g)||[]).length,1);
  const longUnsafe=context.renderAnswerHtml(body+'\nYour turn: <img src=x onerror=alert(1)>?','learn');
  assert.doesNotMatch(longUnsafe,/<img/);assert.match(longUnsafe,/&lt;img/);
});

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
  assert.match(hint, />Lesson</);
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

test('Text after a list and a blank line is not swallowed into the last step', () => {
  const html = context.renderAnswerHtml('1. Multiply\n2. Collect\n\nCheck: it works.');
  assert.match(html, /<\/ol><p>Check: it works\.<\/p>/);
  const continued = context.renderAnswerHtml('1. Multiply\n   because both sides match\n2. Collect');
  assert.match(continued, /<li value="1">Multiply<p>because both sides match<\/p><\/li>|<li value="1">Multiply<p>because both sides match/);
});

test('Learn replies get a heading that matches the message', () => {
  const heading = text => /knox-response-heading[^>]*>.*?<\/span>([^<]+)</.exec(context.renderAnswerHtml(text, 'learn'))[1];
  assert.equal(heading('Not quite — Venus is second from the Sun.'), 'Not quite');
  assert.equal(heading('Yes, that’s right! Neptune is the farthest.'), 'Nice work');
  assert.equal(heading('I read the worksheet as naming the planets.'), "Let's start");
  assert.equal(heading('Here’s how to do it:\n1. Find the Sun\n2. Count outward'), 'Worked example');
  // A question goes in the Your turn card, so the title just says Lesson.
  assert.equal(heading('Which planet in the word bank is farthest from the Sun?'), 'Lesson');
  assert.equal(heading('Think about which planets are closest to the Sun first.'), 'Lesson');
  assert.equal(heading('Great question! Do you know what the green pigment is called?'), 'Lesson', '"Great question" is not praise for an answer');
  assert.doesNotMatch(context.renderAnswerHtml('Yes', 'answer'), /knox-response-heading/);
});

test('Learn extras: choice buttons, step dots and help chips; the marker lines are hidden', () => {
  const html = context.renderAnswerHtml('Leaves are green because of a pigment. Do you know its name?\nProgress: 1/3\nChoices: chlorophyll | melanin | carotene', 'learn');
  assert.equal((html.match(/class="learn-choice"/g) || []).length, 3);
  assert.match(html, /data-learn-send="chlorophyll"/);
  assert.match(html, /aria-label="Part 1 of 3\. A learning goal can include several questions, examples and hints\."/);
  assert.match(html, /Your turn/, 'the label still sees the question at the end');
  // Help fits the question: a tap-to-answer question gets just a hint ...
  assert.match(html, /Hint/);
  assert.doesNotMatch(html, /I’m stuck/);
  // ... a typed question gets hint / stuck / example, a wrong answer gets new angles, a statement none.
  const typed = context.renderAnswerHtml('What is 3 × 4?', 'learn');
  assert.match(typed, /I’m stuck/); assert.match(typed, /Show an example/);
  const retry = context.renderAnswerHtml('Not quite — check the sign. What is -3 + 5?', 'learn');
  assert.match(retry, /Explain another way/); assert.doesNotMatch(retry, /I’m stuck/);
  assert.doesNotMatch(context.renderAnswerHtml('Great, that is the whole idea.', 'learn'), /learn-help/);
  assert.doesNotMatch(html, /Choices:|Progress:/, 'marker lines never show');
  assert.equal(context.window.knoxLearnClean('Hi?\nChoices: a | b'), 'Hi?');
  // A single option isn't a choice; a silly progress number is ignored.
  const odd = context.renderAnswerHtml('What next?\nChoices: only one\nProgress: 9/99', 'learn');
  assert.doesNotMatch(odd, /learn-choice"|learn-progress/);
  // Ask Knox answers never get Learn buttons.
  assert.doesNotMatch(context.renderAnswerHtml('Choices: a | b', 'answer'), /learn-actions/);
});

test('Learn recap: lesson-complete card with practice, flashcards and new-topic buttons', () => {
  const html = context.renderAnswerHtml('Yes — that is exactly it!\nRecap: Trees stop making **chlorophyll** in fall, so yellow and orange pigments show.\nWatch out: The yellow was there all along.\nTopic: Why leaves change color', 'learn');
  assert.match(html, /Lesson complete/);
  assert.match(html, /What you learned · Why leaves change color/);
  assert.match(html, /<strong>chlorophyll<\/strong>/);
  assert.match(html, /Practice 3 more/);
  assert.match(html, /data-learn-flash="Why leaves change color\. Trees stop making chlorophyll in fall/, 'no ** in the flashcards request');
  assert.match(html, /data-learn-new/);
  assert.doesNotMatch(html, /Recap:|Watch out: The|Topic:/);
  assert.doesNotMatch(html, /I’m stuck/, 'no help chips once the lesson is done');
});

test('Learn completion removes numeric progress and leaves extra practice optional', () => {
  const html = context.renderAnswerHtml('Yes, you finished the three questions.\nProgress: 3/3\nRecap: You can solve two-step equations.\nTopic: Equations', 'learn');
  assert.match(html, /Lesson complete/);
  assert.doesNotMatch(html, /learn-progress|Part 3\/3|Your turn/);
  assert.match(html, /Practice 3 more/);
  const retry = context.renderAnswerHtml('Not quite. What is 11 minus 3?\nProgress: 1/3', 'learn');
  assert.match(retry, /Part 1 of 3/);
  assert.match(retry, /Not quite/);
});

test('Learn buttons keep quotes inside their attribute (no injected handlers)', () => {
  const html = context.renderAnswerHtml('Pick one?\nChoices: a" onmouseover="alert(1) | b\'s', 'learn');
  assert.doesNotMatch(html, /onmouseover="/);
  assert.match(html, /data-learn-send="a&quot; onmouseover=&quot;alert\(1\)"/);
  const recap = context.renderAnswerHtml('Done!\nRecap: x" onclick="alert(1)\nTopic: t', 'learn');
  assert.doesNotMatch(recap, /onclick="alert/);
});

test('Learn teaching cards: key idea, video link and a graph line never show as text', () => {
  const html = context.renderAnswerHtml('Here is how slope works. What is the slope of y = 3x - 2?\nKey idea: Slope is rise over run.\nVideo: slope intercept form khan academy\nGraph: y = 2x + 1', 'learn');
  assert.match(html, /learn-key/); assert.match(html, /Slope is rise over run/);
  assert.match(html, /youtube\.com\/results\?search_query=slope%20intercept%20form%20khan%20academy/);
  assert.doesNotMatch(html, /Key idea:|Graph:|Video:/);
});

test('Single-asterisk titles become italics without touching math or bold', () => {
  assert.equal(context.formatInline('In *The Great Gatsby*, the light glows.'), 'In <em>The Great Gatsby</em>, the light glows.');
  assert.equal(context.formatInline('Shakespeare’s *Macbeth*.'), 'Shakespeare’s <em>Macbeth</em>.');
  assert.equal(context.formatInline('7+5*2*3 = 37'), '7+5*2*3 = 37');
  assert.equal(context.formatInline('2 * 3 * 4 = 24'), '2 * 3 * 4 = 24');
  assert.equal(context.formatInline('x*y and a*b'), 'x*y and a*b');
  assert.equal(context.formatInline('**Bold** and *italic*'), '<strong>Bold</strong> and <em>italic</em>');
});
