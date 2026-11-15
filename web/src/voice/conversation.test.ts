import { buyReply, line } from '../comms/buyCall.js';
import { Round } from '../sim/round.js';
import type { PlayId } from '../../../shared/schema.js';
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

test('final speech and typed calls share classification, confirmation, and interruption', async () => {
  for (const input of ['voice', 'text']) {
    const r = new Round();
    const f = setup({ reply: (text, signal) => buyReply(text, signal, id => r.selectPlay(id)) });
    f.conversation.announce(line("What's the call?", 'round'));
    if (input === 'voice') {
      f.conversation.beginListening();
      f.conversation.release();
      f.recognition.resolve({ transcript: "Let's fast plant A", endedAt: 125 });
    } else f.conversation.submitText("Let's fast plant A");
    await tick();
    assert.equal(r.play, 'fast_plant');
    assert.equal(f.conversation.records.at(-1)?.source, 'keyword');
    assert.deepEqual(f.spoken, ["What's the call?", 'Fast plant. Move.']);
  }
});

test('common calls and ambiguous calls bypass the backend', async () => {
  for (const [texts, expected] of [
    [['Fast plant', "Let’s fast plant A"], 'fast_plant'],
    [['Rush', 'Rush Showers', 'Everybody rush'], 'fast_rush'],
    [['Slow push', 'Take it slow', 'Play slow', 'slow'], 'slow_push'],
    [["Let's do something.", 'Push that way.', 'Go with the plan.', 'Rush or slow push?', "Don't rush"], null],
  ] as const) {
    for (const text of texts) {
      const r = new Round();
      let calls = 0;
      const result = await buyReply(text, new AbortController().signal, id => r.selectPlay(id), async () => { calls++; });
      assert.equal(calls, 0);
      assert.equal(r.play, expected);
      if (!expected) assert.match(result.response.reply, /Which play/);
    }
  }
});

test('messy speech accepts only validated classification and can retry offline with a keyword', async () => {
  for (const value of [{ play: 'slow_push' }, { play: null }, { play: 'bad' },
    { play: 'fast_rush', actions: [{ type: 'go' }] }, new Error('offline or timed out')]) {
    const r = new Round();
    const select = (id: PlayId) => r.selectPlay(id);
    const result = await buyReply('Take control gradually', new AbortController().signal, select, async () => {
      if (value instanceof Error) throw value;
      return value;
    });
    if (result.source === 'openai') assert.equal(r.play, 'slow_push');
    else {
      assert.equal(r.phase, 'buy');
      await buyReply('rush', new AbortController().signal, select);
      assert.equal(r.play, 'fast_rush');
    }
  }
});

test('restart, timeout and chip announcements supersede pending classifications and recognition', async () => {
  for (const reason of ['reset', 'chip', 'timeout']) {
    for (const pending of ['recognition', 'classifier']) {
      const r = new Round();
      const old = deferred<unknown>();
      const f = setup({ reply: (text, signal) => buyReply(text, signal, id => r.selectPlay(id), () => old.promise) });
      if (pending === 'recognition') { f.conversation.beginListening(); f.conversation.release(); }
      else f.conversation.submitText('everyone together through showers');
      if (reason === 'reset') r.reset();
      if (reason === 'chip') r.selectPlay('fast_rush');
      if (reason === 'timeout') r.advanceBuy(15000);
      f.conversation.announce(line('Round announcement.', 'round'));
      old.resolve({ play: 'slow_push' });
      f.recognition.resolve({ transcript: 'slow push', endedAt: 145 });
      await tick();
      assert.equal(r.play, reason === 'reset' ? null : reason === 'chip' ? 'fast_rush' : 'fast_plant');
      assert.deepEqual(f.spoken, ['Round announcement.']);
    }
  }
});

function visibleCall() {
  const r = new Round(2026, { calloutDrill: 'sighting' });
  r.step();
  const call = r.callouts.take()!;
  return { r, call, report: (stage: import('../comms/calloutGen.js').PlaybackStage, detail?: string) =>
    r.callouts.playback(call, stage, detail) };
}

test('automatic playback reserves the idle channel once, joins real observation, and leaves commands uninterrupted', async () => {
  const { r, call, report } = visibleCall();
  const done = deferred<void>();
  let starts = 0;
  const f = setup({ async speak(_text, _signal, start) {
    starts++; start('browser'); start('browser'); await done.promise;
  } });
  assert.ok(f.conversation.tryCallout(call, 1, report));
  assert.equal(f.conversation.tryCallout(call, 1, report), false);
  await tick();
  assert.equal(starts, 1);
  assert.equal(f.conversation.response?.reply, 'One Heaven.');
  const key = f.conversation.records[0]!.callout!;
  assert.deepEqual(key, { roundId: 1, sightingId: call.sighting.id });
  const events = r.callouts.events().filter(e => e.sightingId === key.sightingId);
  assert.deepEqual(events.map(e => e.calloutStage ?? e.kind), ['saw','generated','scheduled','started']);
  assert.deepEqual(events[0]!.sighting?.defenderIds, ['jett']);
  assert.equal(events.at(-1)!.kind, 'said');
  f.conversation.beginListening();
  assert.equal(f.conversation.records[0]!.status, 'interrupted');
  assert.equal(r.callouts.events().at(-1)?.calloutStage, 'canceled');
  assert.equal(f.conversation.tryCallout(call, 1, report), false);
  f.conversation.release();
  assert.equal(f.conversation.tryCallout(call, 1, report), false);
  f.recognition.resolve({ transcript: 'Hold Heaven', endedAt: 150 });
  await tick();
  assert.equal(f.conversation.state, 'speaking');
  assert.equal(f.conversation.tryCallout(call, 1, report), false);
  done.resolve(); await tick();
  assert.deepEqual(f.requests, ['Hold Heaven']);
  assert.equal(f.conversation.records.length, 2);
  assert.equal(f.conversation.records[1]!.status, 'completed');
});

test('round restart and loss before first audio cancel the turn and ignore late starts', async () => {
  for (const reason of ['Round restarted', 'Sighting changed before playback', 'Tab hidden']) {
    const { r, call, report } = visibleCall();
    const done = deferred<void>();
    let lateStart!: () => void;
    let parent!: AbortSignal;
    const f = setup({ async speak(_text, signal, start) {
      parent = signal; lateStart = () => start('browser'); await done.promise;
    } });
    f.conversation.tryCallout(call, 1, report);
    await tick();
    f.conversation.cancel(reason);
    assert.ok(parent.aborted);
    const archived = r.callouts.events();
    assert.equal(archived.at(-1)!.calloutStage, 'canceled');
    assert.ok(!archived.some(e => e.kind === 'said'));
    r.reset();
    lateStart(); done.resolve(); await tick();
    assert.equal(f.conversation.records[0]!.audio, null);
    assert.deepEqual(r.callouts.events(), []);
  }
});

test('successful and failed callouts retain subtitles and truthful lifecycle status', async () => {
  for (const result of ['started', 'failed', 'no start']) {
    const { r, call, report } = visibleCall();
    const f = setup({ async speak(_text, _signal, start) {
      if (result === 'started') start('hosted-stream');
      if (result === 'failed') throw new Error('No browser voice');
    } });
    f.conversation.tryCallout(call, 1, report);
    await tick();
    assert.equal(f.conversation.response?.reply, call.text);
    assert.equal(f.conversation.state, 'idle');
    assert.equal(f.conversation.records[0]!.status, result === 'started' ? 'completed' : 'failed');
    assert.equal(r.callouts.events().filter(e => e.kind === 'said').length, Number(result === 'started'));
    assert.equal(r.callouts.events().at(-1)!.calloutStage, result === 'started' ? 'completed' : 'failed');
  }
});

test('replacing a held microphone with text never exposes an idle slot to a settling Learn tick', async () => {
  const { call, report } = visibleCall();
  let replacing = false;
  const f = setup({ update() {
    if (replacing && f.conversation.state === 'idle') f.conversation.tryCallout(call, 1, report);
  } });
  f.conversation.beginListening();
  replacing = true;
  f.conversation.submitText('Smoke Heaven');
  replacing = false;
  await tick();
  assert.deepEqual(f.conversation.records.map(r => r.input), ['voice', 'text']);
  assert.deepEqual(f.spoken, [reply.response.reply]);
});
