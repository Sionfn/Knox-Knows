import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const context={};context.window=context;vm.runInNewContext(readFileSync(new URL('../../app-shell/study-model.js',import.meta.url),'utf8'),context);const m=context.knoxStudyModel;
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} vs ${expected}`);
test('portrait and landscape photos fit the stage without changing their aspect or clipping',()=>{
 for(const [w,h,W,H] of [[900,1200,358,432],[1800,600,288,300],[600,1800,398,150],[1200,900,720,600]]){
  const f=m.photoFit(w,h,W,H);assert.ok(f.x>=0&&f.y>=0&&f.w<=W&&f.h<=H);close(f.w/f.h,w/h);close(f.x*2+f.w,W);close(f.y*2+f.h,H);
 }
});
test('rotation swaps the logical image bounds and keeps the preview centered',()=>{
 const f=m.photoFit(900,1200,358,432,90);close(f.w,358);close(f.h,268.5);close(f.y,(432-268.5)/2);
 for(const rotation of [0,90,180,270]){const r=m.photoFit(900,1200,200,160,rotation);assert.ok(r.w<=200&&r.h<=160);close(r.x*2+r.w,200);close(r.y*2+r.h,160);}
});
test('image-fit geometry rejects invalid decode/stage dimensions',()=>{
 for(const v of [0,-1,NaN,Infinity])assert.equal(m.photoFit(v,1200,358,500).scale,0);
});
test('an aimed frame on a cover-fitted video maps to the visible source, including letterbox offsets',()=>{
 // A landscape sensor fills a portrait view: source sides lie outside the view.
 const frame=m.cameraFrame(1920,1080,{left:0,top:0,width:390,height:844},{left:39,top:200,width:312,height:300});
 const k=844/1080,offset=(1920*k-390)/2;close(frame.x,(39+offset)/(1920*k));close(frame.y,200/844);close(frame.w,312/(1920*k));close(frame.h,300/844);
 const original=m.cameraFrame(900,1200,{left:10,top:20,width:450,height:600},{left:55,top:80,width:360,height:480});close(original.x,.1);close(original.y,.1);close(original.w,.8);close(original.h,.8);
});
test('camera and preview coordinate round-trip retains the selected source area after rotation/resize',()=>{
 const sel={x:.2,y:.25,w:.5,h:.4};for(const [W,H] of [[288,300],[358,432],[720,300]])for(const rotation of [0,90,180,270]){
  const f=m.photoFit(900,1200,W,H,rotation),px={x:f.x+sel.x*f.w,y:f.y+sel.y*f.h,w:sel.w*f.w,h:sel.h*f.h};close((px.x-f.x)/f.w,sel.x);close((px.y-f.y)/f.h,sel.y);close(px.w/f.w,sel.w);close(px.h/f.h,sel.h);
 }
});

test('small camera selections are preserved instead of silently expanded to twelve percent',()=>{
 const r=m.cameraFrame(1920,1080,{left:0,top:0,width:390,height:844},{left:120,top:250,width:90,height:70});
 close(r.w,90/(1920*(844/1080)));close(r.h,70/844);assert.ok(r.w<.12&&r.h<.12);
 const crop=m.cropBounds({x:.98,y:.97,w:.02,h:.03},.02);close(crop.x,.98);close(crop.y,.97);close(crop.w,.02);close(crop.h,.03);
});
