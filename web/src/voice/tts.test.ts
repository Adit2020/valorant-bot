import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spoken, withSpeechFallback } from './tts.js';

test('hosted TTS failure falls back once and reports its mode', async () => {
  let fallback = 0;
  const notices: string[] = [];
  await withSpeechFallback(async () => { throw new Error('TTS_TIMEOUT'); }, async () => { fallback++; }, new AbortController().signal, message => notices.push(message));
  assert.equal(fallback, 1);
  assert.match(notices[0]!, /browser voice.*TTS_TIMEOUT/);
});

test('interrupted hosted speech never starts a stale browser utterance', async () => {
  const abort = new AbortController();
  let fallback = 0;
  await assert.rejects(withSpeechFallback(async () => { abort.abort(); throw new Error('cancelled'); }, async () => { fallback++; }, abort.signal, () => {}));
  assert.equal(fallback, 0);
});

test('browser fallback failure propagates; hosted success avoids fallback', async () => {
  await assert.rejects(withSpeechFallback(async () => { throw new Error('hosted failure'); }, async () => { throw new Error('browser failure'); }, new AbortController().signal, () => {}), /browser failure/);
  await withSpeechFallback(async () => {}, async () => { throw new Error('must not fallback'); }, new AbortController().signal, () => {});
});

test('failed hosted stream after playing never repeats the line in browser synthesis', async () => {
  let fallbacks = 0;
  await assert.rejects(withSpeechFallback(async () => { throw new Error('stream stopped'); },
    async () => { fallbacks++; }, new AbortController().signal, () => {}, () => true), /stream stopped/);
  assert.equal(fallbacks, 0);
});

test('audio says "Relay" for RelAI; subtitles keep the name and word offsets line up', () => {
  assert.equal(spoken('RelAI is down.'), 'Relay is down.');
  assert.equal(spoken('RelAI is down.').length, 'RelAI is down.'.length);
  assert.equal(spoken('Smoke Heaven.'), 'Smoke Heaven.');
});
