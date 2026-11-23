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

test('normal prose is left alone; a Learn reply shows its simulation above Your turn (Dec 1)', () => {
  assert.doesNotMatch(context.renderAnswerHtml('Simulation: try this at home.', 'answer'), /knox-sim/);
  const html = context.renderAnswerHtml('Try it.\nSim: line | m=1\nYour turn: What next?', 'learn');
  assert.match(html, /data-sim="line \| m=1"/);
  assert.doesNotMatch(html, /Sim:/);
});

test('the server adds simulations only for Mega with the switch on (Ask Knox and Learn) and validates the flag', () => {
  assert.match(ask, /const simsOn = simulations === true && tier === 'mega' && !casual && !isBot/);
  assert.match(ask, /learnMode \? SIM_LEARN_INSTRUCTION : SIM_INSTRUCTION/);
  assert.match(ask, /typeof simulations !== 'boolean'/);
});

test('Learn keeps a sim only when Simulations are on, and only a known template', async () => {
  const { decodeLearnOutput } = await import('../api/_learn-output.js');
  const reply = sim => JSON.stringify({body:'Watch the slope.',question:'What is m?',choices:[],goals:['Slope'],part:1,practiceIndex:0,assessment:'new',reviewFocus:'',keyIdea:'',graph:'',visual:'',video:'',recap:'',watchOut:'',topic:'',sim});
  assert.match(decodeLearnOutput(reply('line | m=3, b=1'), { sims: true }), /^Sim: line \| m=3, b=1$/m);
  assert.doesNotMatch(decodeLearnOutput(reply('line | m=3, b=1'), {}), /Sim:/);
  assert.doesNotMatch(decodeLearnOutput(reply('rocket | x=1'), { sims: true }), /Sim:/);
});
