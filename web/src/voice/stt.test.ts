import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startCapture, type Recognition } from './stt.js';

class FakeRecognition implements Recognition {
  static current: FakeRecognition;
  continuous = false; interimResults = false; lang = '';
  onresult: Recognition['onresult'] = null;
  onerror: Recognition['onerror'] = null;
  onend: Recognition['onend'] = null;
  stopped = 0; aborted = 0;
  constructor() { FakeRecognition.current = this; }
  start() {}
  stop() { this.stopped++; }
  abort() { this.aborted++; }
}

test('recognition emits interim text but submits only finals after stop/end', async () => {
  const interim: string[] = [];
  const capture = startCapture(text => interim.push(text), FakeRecognition, () => 42);
  const recognition = FakeRecognition.current;
  recognition.onresult!({ results: [{ isFinal: false, 0: { transcript: 'interim only' } }] });
  recognition.onresult!({ results: [{ isFinal: true, 0: { transcript: 'Ready?' } }, { isFinal: false, 0: { transcript: 'maybe' } }] });
  capture.stop(); capture.stop();
  assert.equal(recognition.stopped, 1);
  recognition.onend!();
  assert.deepEqual(await capture.done, { transcript: 'Ready?', endedAt: 42 });
  assert.deepEqual(interim, ['interim only', 'Ready? maybe']);
  assert.equal(recognition.onresult, null);
});

test('permission, device and recognition failures abort and clean listeners', async () => {
  for (const error of ['not-allowed', 'service-not-allowed', 'audio-capture', 'no-speech', 'network']) {
    const capture = startCapture(() => {}, FakeRecognition);
    const recognition = FakeRecognition.current;
    recognition.onerror!({ error });
    await assert.rejects(capture.done);
    assert.equal(recognition.aborted, 1);
    assert.equal(recognition.onend, null);
  }
});

test('missing recognition and finalization timeout produce recoverable errors', async () => {
  assert.throws(() => startCapture(() => {}, undefined), /unavailable/);
  const capture = startCapture(() => {}, FakeRecognition, () => 0, 5);
  capture.stop();
  await assert.rejects(capture.done, /did not finish/);
  assert.equal(FakeRecognition.current.aborted, 1);
});

test('cancel stops recognition and ignores results arriving afterward', async () => {
  const capture = startCapture(() => { throw new Error('must not emit'); }, FakeRecognition);
  const recognition = FakeRecognition.current;
  capture.cancel();
  await assert.rejects(capture.done, /cancelled/);
  assert.equal(recognition.onresult, null);
  assert.equal(recognition.aborted, 1);
});
