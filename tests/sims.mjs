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

test('the server offers simulations on every plan (Ask Knox and Learn), only when they help, and validates the flag', () => {
  assert.match(ask, /const simsOn = simulations === true && !casual && !isBot;/);
  assert.match(ask, /const SIM_LINES = SIM_CATALOG\.map/);
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

test('answers and Learn know every Simulation Lab sim (all 22)', async () => {
  const { SIM_CATALOG } = await import('../api/_sim-build.js');
  const { decodeLearnOutput } = await import('../api/_learn-output.js');
  const reply = sim => JSON.stringify({body:'Watch it swing.',question:'What changes the period?',choices:[],goals:['Pendulums'],part:1,practiceIndex:0,assessment:'new',reviewFocus:'',keyIdea:'',graph:'',visual:'',video:'',recap:'',watchOut:'',topic:'',sim});
  assert.equal(SIM_CATALOG.length, 22);
  for (const [type] of SIM_CATALOG) assert.match(decodeLearnOutput(reply(type + ' | a=1'), { sims: true }), new RegExp('^Sim: ' + type + ' \\|', 'm'), type);
  const sims = readFileSync(new URL('../sims.js', import.meta.url), 'utf8');
  assert.match(sims, /window\.knoxSimLab\.mini\(el, p\.type, p\.vals\)/);
  assert.match(readFileSync(new URL('../simlab.js', import.meta.url), 'utf8'), /Open in Lab/);
});

test('Ask Knox and Learn both search the web only when needed, and Learn falls back to a normal reply', () => {
  assert.match(ask, /const useWebSearch = webSearch === true && !casual && !isBot;/);
  assert.match(ask, /LEARN_WEB_SEARCH_INSTRUCTION/);
  assert.match(ask, /Learn search reply was not a lesson; answering normally\./);
  const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  assert.match(app, /webSearch: true,/);
  assert.match(app, /simulations: true,/);
});

test('with a sim, Knox uses the Lab\'s exact gravity so the answer matches the sim', async () => {
  assert.match(ask, /Earth 9\.81 m\/s², Moon 1\.62, Mars 3\.71, Jupiter 24\.79, Sun 274, Pluto 0\.62/);
  assert.match(ask, /SIM_GRAVITY \+ ' Use the numbers/);
  assert.match(ask, /'\\n' \+ SIM_GRAVITY \+/);
  const lab = readFileSync(new URL('../simlab.js', import.meta.url), 'utf8');
  assert.match(lab, /earth: \[9\.81, 'Earth'\], moon: \[1\.62, 'Moon'\], mars: \[3\.71, 'Mars'\], jupiter: \[24\.79, 'Jupiter'\], sun: \[274, 'The Sun'\], pluto: \[0\.62, 'Pluto'\]/);
});
