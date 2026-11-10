import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../app-shell/native-ui.js',import.meta.url),'utf8');
const share=source.slice(source.indexOf('if(native)window.knoxNativeShareAnswer='),source.indexOf('let cameraBusy=false;'));
test('native answer sharing uses the cleaned answer only and cancellation stays quiet',async()=>{
 const sent=[],notes=[],ctx={native:true,_fbPayloads:{own:{answer:'A clean lesson recap'}},p:{share:{share:async value=>sent.push(value)}},note:msg=>notes.push(msg)};ctx.window=ctx;vm.runInNewContext(share,ctx);
 await ctx.knoxNativeShareAnswer('missing');assert.equal(sent.length,0);await ctx.knoxNativeShareAnswer('own');assert.equal(sent[0].text,'A clean lesson recap');assert.equal(sent[0].title,'Knox Knows');
 ctx.p.share.share=async()=>{throw Error('User cancelled');};await ctx.knoxNativeShareAnswer('own');assert.equal(notes.length,0);
 ctx.p.share.share=async()=>{throw Error('Unavailable');};await ctx.knoxNativeShareAnswer('own');assert.match(notes[0],/Try Copy/);
});
