// Reproducible mobile-only package. Never copies API source, credentials or .env files.
import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const mobile = path.dirname(fileURLToPath(import.meta.url)), root = path.dirname(mobile);
const out = path.join(mobile, 'www');
await rm(out, {recursive:true, force:true}); await mkdir(out, {recursive:true});
const config = JSON.parse(await readFile(path.join(mobile,'app-config.json'),'utf8'));
if(config.apiOrigin !== 'https://www.knoxknowsapp.com') throw Error('Release API origin must be the Knox production HTTPS origin.');
for(const entry of await readdir(root,{withFileTypes:true})) {
  if(!entry.isFile() || !/\.(?:js|css|png|jpg|jpeg|svg|webp|ico)$/.test(entry.name)) continue;
  await copyFile(path.join(root,entry.name),path.join(out,entry.name));
}
// The app's Home/You screens and tab bar are shared with the website's
// home-screen version (/app-shell/), so both stay identical.
await mkdir(path.join(out,'assets'),{recursive:true});
for(const f of await readdir(path.join(root,'app-shell'))) await copyFile(path.join(root,'app-shell',f),path.join(out,'assets',f));
for(const dir of ['assets','vendor','fonts']) {
  const base=path.join(mobile,dir); await mkdir(path.join(out,dir),{recursive:true});
  for(const f of await readdir(base)) await copyFile(path.join(base,f),path.join(out,dir,f));
}
let html=await readFile(path.join(root,'app.html'),'utf8');
html=html.replace('<script src="/desktop-fit.js"></script>','');
html=html.replace('width=device-width, initial-scale=1.0','width=device-width, initial-scale=1.0, viewport-fit=cover');
html=html.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/10\.7\.0\/(firebase-[\w-]+\.js)/g,'/vendor/$1');
html=html.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/,'<link rel="stylesheet" href="/assets/fonts.css">');
html=html.replace('<head>','<head>\n<script src="/assets/app-config.js"></script>\n<script src="/assets/native-transport.js"></script>');
html=html.replace('</head>','<link rel="stylesheet" href="/assets/native.css">\n<script src="/assets/draft-store.js" defer></script>\n<script src="/assets/native-pages.js" defer></script>\n<script src="/assets/native-ui.js" defer></script>\n</head>');
for(const f of ['index.html','app.html']) await writeFile(path.join(out,f),html);
await writeFile(path.join(out,'assets/app-config.js'),'window.knoxMobileConfig='+JSON.stringify(config)+';\n');
let reader=await readFile(path.join(out,'doc-extract.js'),'utf8');
for(const [remote,local] of [
 ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs','/vendor/pdf.min.mjs'],
 ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs','/vendor/pdf.worker.min.mjs'],
 ['https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js','/vendor/mammoth.browser.min.js'],
 ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js','/vendor/jszip.min.js']]) reader=reader.replace(remote,local);
await writeFile(path.join(out,'doc-extract.js'),reader);
let cards=await readFile(path.join(out,'flashcards.js'),'utf8');
cards=cards.replaceAll('This browser keeps an offline copy.','This app keeps an offline copy.').replaceAll('Guest decks stay in this browser.','Guest decks stay on this device.');
await writeFile(path.join(out,'flashcards.js'),cards);
// tour.js points its steps at the app tabs itself when window.knoxAppShell is set.
if(!(await readFile(path.join(out,'tour.js'),'utf8')).includes('window.knoxAppShell'))throw Error('tour.js lost its app-tab steps; review before packaging.');
let support=await readFile(path.join(out,'support-widget.js'),'utf8');
const supportAnchor="  const LOGO = '<img";
if(!support.includes(supportAnchor))throw Error('Support changed upstream; review native help navigation.');
support=support.replace(supportAnchor,`
  if(window.knoxNativeApp){
    const answers={
      'How do I cancel my plan?':'Manage your subscription where you originally subscribed. If you need help finding it, send a message to Knox Support from You → Help & support.',
      'Will I be charged after the Mega Knox free trial?':'An existing trial renews unless cancelled before it ends. Manage it where you subscribed, or ask Knox Support for help. Opening this app does not start a new trial.',
      'How do I move from Knox Plus to Mega Knox?':'Open You → Your plan → Compare plans to see what each plan includes. Your existing plan follows your account. New plan purchases are not available inside the app yet.',
      'I paid but my plan isn’t showing.':'Sign in with the same account you used to subscribe. Your existing plan follows you here. If it still looks wrong, open You → Help & support and message the Knox team.',
      'How do I connect the Knox Discord?':'Open You → Account & settings → Connections. Join the Knox Discord, then type /link there to connect your account.',
      'What is Flame Fest?':'Open You → Keep your flame going. During Flame Fest, this opens your study calendar and rewards. Outside the event, it shows your study streak.',
      'Does Knox save my chats?':'Yes, when you are signed in. Open Home → Your recent work, or tap See all to browse your saved chats and lessons.',
      'How many questions do I get on the free plan?':'Free accounts start with 10 credits. 5 return each day, and unused credits save up to 20. A typed question uses 1 credit; a photo or document uses 2. Starting a Learn lesson uses 1 credit, and the follow-ups in that lesson are included.',
      'How do I delete my account?':'Open You → Account & settings → Delete my account. Confirm the request inside the app. The Knox team processes it manually and confirms completion; accepting the request is not immediate deletion.'
    };
    for(const row of HELP)if(answers[row[0]])row[1]=answers[row[0]];
    for(let i=HELP.length-1;i>=0;i--)if(['How do I get the Chrome extension?','How do I give Knox as a gift?','How do I redeem a gift code?'].includes(HELP[i][0]))HELP.splice(i,1);
  }
`+supportAnchor);
await writeFile(path.join(out,'support-widget.js'),support);
await copyFile(path.join(mobile,'offline.html'),path.join(out,'offline.html'));
await writeFile(path.join(out,'mobile-release.json'),JSON.stringify({version:config.version,source:config.source,apiOrigin:config.apiOrigin},null,2));
const hashes={};
async function fingerprint(dir){for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())await fingerprint(file);else hashes[path.relative(out,file)]=createHash('sha256').update(await readFile(file)).digest('hex');}}
await fingerprint(out);
await writeFile(path.join(mobile,'bundle-hashes.json'),JSON.stringify(hashes,null,2)+'\n');
console.log('Bundled Knox '+config.version+' from '+config.source+'; API '+config.apiOrigin);
