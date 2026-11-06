import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function escHtml('), source.indexOf('function showChatThread('));
const renderer = source.slice(source.indexOf('// ── Learn extras'), source.indexOf('// ── Render a video suggestion card'));
const context = { window: {}, document: { addEventListener() {}, querySelectorAll: () => [] } };
runInNewContext(readFileSync(new URL('../learn-visuals.js', import.meta.url), 'utf8'), context);
runInNewContext(`${helpers}\n${renderer}`, context);
const ask = readFileSync(new URL('../api/ask.js', import.meta.url), 'utf8');

test('a Sim: line in an Ask answer becomes one simulation card and leaves the text', () => {
  const html = context.renderAnswerHtml('The ball goes highest at 45 degrees.\n\nSim: projectile | speed=20, angle=45', 'answer');
  assert.match(html, /<div class="knox-sim" data-sim="projectile \| speed=20, angle=45"><\/div>/);
  assert.doesNotMatch(html, /Sim:/);
  assert.match(context.renderAnswerHtml('**Sim:** line | m=2, b=1', 'answer'), /data-sim="line \| m=2, b=1"/);
});

test('simulation specs are escaped and never become markup', () => {
  const html = context.renderAnswerHtml('Hi\nSim: line | m="><img src=x onerror=alert(1)>', 'answer');
  assert.doesNotMatch(html, /<img|onerror="/);
});

test('Learn answers and normal prose are left alone', () => {
  assert.doesNotMatch(context.renderAnswerHtml('Simulation: try this at home.', 'answer'), /knox-sim/);
  assert.doesNotMatch(context.renderAnswerHtml('Try it.\nSim: line | m=1\nYour turn: What next?', 'learn'), /knox-sim/);
});

test('the server adds simulations only for Mega Ask Knox and validates the flag', () => {
  assert.match(ask, /simulations === true && tier === 'mega' && !learnMode && !casual && !isBot/);
  assert.match(ask, /typeof simulations !== 'boolean'/);
});
