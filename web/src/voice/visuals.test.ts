import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rms, MicrophoneLevels } from './audioLevels.js';
import { taper, smooth, stateColors } from '../ui/waveform.js';
import { Subtitles, estimatedWord, wordAt } from '../ui/subtitles.js';

test('RMS, smoothing, edge taper and state palette match the voice design', () => {
  assert.equal(rms(new Float32Array()),0);
  assert.equal(rms(new Float32Array([.5,-.5])),.5);
  assert.equal(smooth(0,1),.2);
  assert.equal(taper(0),0); assert.ok(taper(1)<1e-20); assert.equal(taper(.5),1);
  assert.deepEqual(stateColors.listening,[127,231,255]);
  assert.deepEqual(stateColors.speaking,[255,138,61]);
});
test('estimated words clamp and boundary offsets map to actual words', () => {
  assert.equal(wordAt('Ready, rookie. Loud and clear.',7),1);
  assert.equal(estimatedWord(5,2,4),2);
  assert.equal(estimatedWord(5,100,4),4);
});

test('subtitles appear immediately, highlight words, fade after 3s and cancel stale fades', () => {
  const previous = { document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const timers = new Map<number,()=>void>(); let id = 0;
  class Element {
    textContent = ''; children: Element[] = []; attrs = new Map<string,string>(); classes = new Set<string>();
    classList = { add: (name:string)=>this.classes.add(name), remove:(name:string)=>this.classes.delete(name) };
    setAttribute(key:string,value:string){this.attrs.set(key,value);} removeAttribute(key:string){this.attrs.delete(key);}
    replaceChildren(...children:Element[]){this.children=children;}
  }
  Object.assign(globalThis, {
    document: { createElement:()=>new Element() },
    setTimeout: (callback:()=>void,delay:number)=>{assert.equal(delay,3000);timers.set(++id,callback);return id;},
    clearTimeout:(id:number)=>timers.delete(id),
  });
  try {
    const el = new Element(); const subtitles = new Subtitles(el as unknown as HTMLElement);
    subtitles.show('Ready, rookie.'); assert.equal(el.children.length,2);
    subtitles.highlight(1); assert.ok(el.children[1]!.classes.has('current'));
    subtitles.finish(); subtitles.finish(); assert.equal(timers.size,1);
    subtitles.show('New response.'); assert.equal(timers.size,0); assert.ok(!el.classes.has('faded'));
    subtitles.finish(); [...timers.values()][0]!(); assert.ok(el.classes.has('faded'));
    subtitles.clear(); assert.equal(el.children.length,0); assert.equal(el.attrs.size,0);
    subtitles.dispose();
  } finally { Object.assign(globalThis,previous); }
});

test('late microphone permission results stop tracks after cancellation, never route to speakers', async () => {
  const previous = { AudioContext:globalThis.AudioContext, navigator:globalThis.navigator };
  let resolve!: (stream:MediaStream)=>void; let stopped=0;
  class Context {
    resume(){return Promise.resolve();} suspend(){return Promise.resolve();} close(){return Promise.resolve();}
    createMediaStreamSource(){throw new Error('Cancelled stream must not be connected');}
  }
  Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:()=>new Promise<MediaStream>(r=>{resolve=r;})}},configurable:true});
  Object.assign(globalThis,{AudioContext:Context});
  try {
    const levels=new MicrophoneLevels(()=>{}); levels.start(); levels.start(); levels.stop();
    resolve({getTracks:()=>[{stop(){stopped++;}}]} as unknown as MediaStream);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(stopped,1); assert.equal(levels.level(),0); levels.dispose();
  } finally {
    Object.assign(globalThis,{AudioContext:previous.AudioContext});
    Object.defineProperty(globalThis,'navigator',{value:previous.navigator,configurable:true});
  }
});
