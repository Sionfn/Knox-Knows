import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeck,parseLines,schedule,studyQueue,DAY} from '../flashcards-core.js';
test('import validates all cards, normalizes whitespace, resets foreign progress',()=>{
 assert.deepEqual(validateDeck({title:' Test ',cards:[{front:' A ',back:' B ',due:99}]}).cards[0],{front:'A',back:'B',due:0,interval:0,reviews:0});
 for(const value of [null,{}, {title:'x',cards:[]},{title:'x',cards:[{front:'',back:'a'}]},{title:'x',cards:[{front:'a',back:'b'.repeat(4001)}]}])assert.throws(()=>validateDeck(value));
});
test('bulk input supports spreadsheet tabs and rejects incomplete rows',()=>{
 assert.equal(parseLines('A\tB\r\nC\tD').length,2);assert.throws(()=>parseLines('missing delimiter'));
});
test('review grades schedule distinct intervals and preserve text',()=>{
 const c={front:'x',back:'y',interval:0};assert.equal(schedule(c,'again',100).due,60100);assert.equal(schedule(c,'good',100).due,100+DAY);assert.equal(schedule(c,'easy',100).due,100+3*DAY);assert.equal(schedule({...c,interval:3},'good',100).interval,6);assert.throws(()=>schedule(c,'oops'));
});
test('due selection excludes future reviews and practice includes all cards once',()=>{
 const cards=[{due:0},{due:10},{due:1000}];assert.deepEqual(studyQueue(cards,true,100,()=>.99),[0,1]);assert.deepEqual(studyQueue(cards,false,100,()=>.99),[0,1,2]);
});

test('spreadsheet import reads CSV (with quotes), tabs and study-app lists; skips a header row', async () => {
  const { parseTable, toCsv } = await import('../flashcards-core.js');
  const csv = parseTable('Question,Answer\n"What is 2, plus 2?",4\n"He said ""hi""",greeting\n\nH2O,water\n');
  assert.equal(JSON.stringify(csv), JSON.stringify([{ front: 'What is 2, plus 2?', back: '4' }, { front: 'He said "hi"', back: 'greeting' }, { front: 'H2O', back: 'water' }]));
  const tsv = parseTable('mitosis\tcell division\r\nosmosis\twater moving across a membrane\r\n');
  assert.equal(tsv.length, 2); assert.equal(tsv[1].back, 'water moving across a membrane');
  assert.throws(() => parseTable('just one column\nno answers here'), /couldn’t find any cards/);
  const out = toCsv([{ title: 'Bio', cards: [{ front: 'Q, with comma', back: 'A "quoted"' }] }]);
  assert.equal(out, 'Front,Back\r\n"Q, with comma","A ""quoted"""');
  assert.equal(JSON.stringify(parseTable(out)), JSON.stringify([{ front: 'Q, with comma', back: 'A "quoted"' }]), 'export → import round-trips');
});

test('card pictures: only Wikimedia or small inline images survive import', async () => {
  const { validateDeck } = await import('../flashcards-core.js');
  const deck = validateDeck({ title: 'x', cards: [
    { front: 'a', back: 'b', image: 'https://upload.wikimedia.org/heart.png', imageCredit: 'Wikimedia Commons · Jerm' },
    { front: 'c', back: 'd', image: 'data:image/jpeg;base64,AAAA' },
    { front: 'e', back: 'f', image: 'https://evil.example/x.png' },
    { front: 'g', back: 'h', image: 'javascript:alert(1)' },
  ] });
  assert.equal(deck.cards[0].image, 'https://upload.wikimedia.org/heart.png');
  assert.equal(deck.cards[0].imageCredit, 'Wikimedia Commons · Jerm');
  assert.equal(deck.cards[1].image, 'data:image/jpeg;base64,AAAA');
  assert.equal(deck.cards[2].image, undefined);
  assert.equal(deck.cards[3].image, undefined);
});

test('card lists in .txt: tabs, "term - definition" and "term: definition"; notes return null', async () => {
  const { parseList, rowsToCards } = await import('../flashcards-core.js');
  assert.deepEqual(parseList('1. Mitosis - cell division\n2. Osmosis – water crossing a membrane\n- Atom: smallest unit of an element'),
    [{ front: 'Mitosis', back: 'cell division' }, { front: 'Osmosis', back: 'water crossing a membrane' }, { front: 'Atom', back: 'smallest unit of an element' }]);
  assert.equal(parseList('A\tB\nC\tD').length, 2);
  assert.equal(parseList('The French Revolution began in 1789.\nIt ended the monarchy.\nNapoleon rose to power after.'), null);
  assert.equal(parseList('just one line'), null);
  assert.deepEqual(rowsToCards([['Term', 'Definition'], ['H2O', 'water', ''], ['', ''], ['NaCl', 'salt', 'table salt']]),
    [{ front: 'H2O', back: 'water' }, { front: 'NaCl', back: 'salt, table salt' }]);
});

test('pasted cards accept Tab, " - " and ": " and name the bad line; copied text is one card per line', async () => {
  const { parsePasted, toTabText } = await import('../flashcards-core.js');
  assert.deepEqual(parsePasted('mitochondria\tpowerhouse of the cell\r\n\n2. osmosis - water across a membrane\natom: smallest unit'),
    [{ front: 'mitochondria', back: 'powerhouse of the cell' }, { front: 'osmosis', back: 'water across a membrane' }, { front: 'atom', back: 'smallest unit' }]);
  assert.throws(() => parsePasted('good - card\nno separator here'), /Line 2/);
  assert.throws(() => parsePasted('  '), /Paste some cards/);
  assert.equal(toTabText([{ cards: [{ front: 'Q\none', back: 'A\tB' }, { front: 'x', back: 'y' }] }]), 'Q one\tA B\nx\ty');
});
