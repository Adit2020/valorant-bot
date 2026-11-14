import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Conversation, type ConversationDependencies } from './conversation.js';
import type { SpeechResult } from './stt.js';
import type { ReplyResult } from '../comms/brimClient.js';
import { TurnLogSchema } from '../../../shared/schema.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const reply: ReplyResult = { source: 'local', response: { reply: 'Ready, rookie. Loud and clear.', actions: [], needs: null } };
function setup(overrides: Partial<ConversationDependencies> = {}) {
  let time = 100;
  let stops = 0;
  let captures = 0;
  const recognition = deferred<SpeechResult>();
  const requests: string[] = [];
  const spoken: string[] = [];
  const deps: ConversationDependencies = {
    now: () => time++, update() {}, stopAudio() { stops++; }, unlockAudio() {},
    capture(interim) { captures++; interim('Brim, you ready?'); return { done: recognition.promise, stop() {}, cancel() { recognition.reject(new Error('cancelled')); } }; },
    async reply(text) { requests.push(text); return reply; },
    async speak(text, _signal, start) { spoken.push(text); start('browser'); },
    ...overrides,
  };
  const conversation = new Conversation(deps);
  return { conversation, recognition, requests, spoken, get captures() { return captures; }, get stops() { return stops; } };
}

test('voice hold -> final result -> release -> response -> speech -> idle, no duplicate sends', async () => {
  const f = setup();
  f.conversation.beginListening();
  f.conversation.beginListening();
  assert.equal(f.captures, 1);
  assert.equal(f.conversation.state, 'listening');
  assert.equal(f.conversation.isHolding, true);
  f.recognition.resolve({ transcript: 'Brim, you ready?', endedAt: 150 });
  await tick();
  assert.equal(f.requests.length, 0, 'must wait for release, even when recognition ends early');
  f.conversation.release();
  assert.equal(f.conversation.isHolding, false);
  f.conversation.release();
  await tick();
  assert.deepEqual(f.requests, ['Brim, you ready?']);
  assert.equal(f.spoken.length, 1);
  assert.equal(f.conversation.state, 'idle');
  const record = f.conversation.records[0]!;
  assert.equal(record.status, 'completed');
  assert.ok(record.latencyMs.stt !== null);
  assert.ok(record.latencyMs.firstAudio !== null);
  assert.equal(record.turnLog, undefined, 'local fallback must not pretend to be a keyword or LLM path');
});

test('release waits for final results; voice OpenAI completion attaches the unchanged TurnLog', async () => {
  const f = setup({ async reply() { return { ...reply, source: 'openai' }; } });
  f.conversation.beginListening();
  f.conversation.release();
  assert.equal(f.conversation.state, 'listening');
  f.recognition.resolve({ transcript: 'Ready?', endedAt: 150 });
  await tick();
  const record = f.conversation.records[0]!;
  assert.ok(record.turnLog);
  assert.ok(TurnLogSchema.safeParse(record.turnLog).success);
});

test('empty final transcript, unavailable recognition and permission errors recover for text', async () => {
  const f = setup();
  f.conversation.beginListening(); f.conversation.release();
  f.recognition.resolve({ transcript: '', endedAt: 150 });
  await tick();
  assert.equal(f.requests.length, 0);
  assert.equal(f.conversation.state, 'idle');
  assert.equal(f.conversation.records[0]!.status, 'failed');
  for (const message of ['Speech recognition unavailable', 'Microphone permission denied']) {
    const unavailable = setup({ capture() { throw new Error(message); } });
    unavailable.conversation.beginListening();
    assert.equal(unavailable.conversation.state, 'idle');
    assert.match(unavailable.conversation.message, new RegExp(message));
    unavailable.conversation.submitText('Ready?');
    await tick();
    assert.equal(unavailable.conversation.records.at(-1)!.status, 'completed');
    assert.equal(unavailable.conversation.records.at(-1)!.latencyMs.stt, null);
  }
});

test('late responses from an older call never speak or overwrite the newer reply', async () => {
  const old = deferred<ReplyResult>();
  let calls = 0;
  let firstSignal: AbortSignal | undefined;
  const f = setup({ reply(_text, signal) { if (++calls === 1) { firstSignal = signal; return old.promise; } return Promise.resolve(reply); } });
  f.conversation.submitText('Old call');
  f.conversation.submitText('New call');
  await tick();
  assert.ok(firstSignal?.aborted);
  assert.equal(f.conversation.records[0]!.status, 'interrupted');
  old.resolve({ source: 'openai', response: { reply: 'Old response.', actions: [], needs: null } });
  await tick();
  assert.deepEqual(f.spoken, [reply.response.reply]);
  assert.equal(f.conversation.response?.reply, reply.response.reply);
  assert.equal(f.conversation.state, 'idle');
});

test('push-to-talk interrupts speech synchronously and ignores stale playback callbacks', async () => {
  let finish!: () => void;
  let oldStarted!: () => void;
  let speakingSignal: AbortSignal | undefined;
  const f = setup({ speak(_text, signal, start) {
    speakingSignal = signal; oldStarted = () => start('browser'); start('browser');
    return new Promise(resolve => { finish = resolve; });
  } });
  f.conversation.submitText('Ready?');
  await tick();
  assert.equal(f.conversation.state, 'speaking');
  const previousStops = f.stops;
  f.conversation.beginListening();
  assert.ok(f.stops > previousStops);
  assert.ok(speakingSignal?.aborted);
  assert.equal(f.conversation.records[0]!.status, 'interrupted');
  oldStarted(); finish(); await tick();
  assert.equal(f.conversation.state, 'listening');
  f.conversation.cancel();
});

test('LLM failure and audio failure leave recoverable idle state with honest missing timings', async () => {
  for (const phase of ['reply', 'speak']) {
    let failed = false;
    const f = setup({
      async reply() { if (phase === 'reply' && !failed) { failed = true; throw new Error('LLM_TIMEOUT'); } return reply; },
      async speak(_text, _signal, start) { if (phase === 'speak' && !failed) { failed = true; throw new Error('TTS failed'); } start('browser'); },
    });
    f.conversation.submitText('Ready?'); await tick();
    assert.equal(f.conversation.state, 'idle');
    assert.equal(f.conversation.records[0]!.status, 'failed');
    assert.equal(f.conversation.records[0]!.latencyMs.firstAudio, null);
    assert.equal(f.conversation.records[0]!.turnLog, undefined);
    f.conversation.submitText('Try again'); await tick();
    assert.equal(f.conversation.records[1]!.status, 'completed');
  }
});

test('empty text does not call backend; cancelling recognition never submits', async () => {
  const f = setup();
  f.conversation.submitText(' ');
  assert.equal(f.requests.length, 0);
  f.conversation.beginListening(); f.conversation.cancel('Window lost focus.');
  await tick();
  assert.equal(f.conversation.state, 'idle');
  assert.equal(f.conversation.records[0]!.status, 'interrupted');
  assert.equal(f.requests.length, 0);
});
