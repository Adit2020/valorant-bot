import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Sighting } from '../../../shared/schema.js';
import type { ConversationRecord, TraceFile } from './log.js';
import { parseSessionName, scoreCall, scoreTrace, summarize } from './score.js';

const heaven: Sighting = { id: '20/heaven', tick: 20, region: 'heaven', defenderIds: ['jett'], count: 1 }; // t = 1.0 s
const record = (id: number, transcript: string, t: number): ConversationRecord => ({
  id, t, input: 'voice', transcript, source: 'keyword', audio: 'browser', status: 'completed', notices: [],
  latencyMs: { stt: 300, think: 5, firstAudio: 400 },
  command: { roundId: 1, t, path: 'keyword', goalIds: [], validator: { ok: true } },
});

test('scorer: a short, clear, grounded, timely call scores 5; rambling scores 0', () => {
  const trace: TraceFile = { version: 2, scope: 'gameplay', bot: 'relai', records: [
    record(1, 'Smoke Heaven', 2),
    record(2, 'um can you like do something over there with the thing on the left please', 2.5),
    { ...record(3, 'One Heaven', 2), input: 'callout', command: undefined }, // RelAI's own line, not a player call
  ], rounds: [{ roundId: 1, seed: 2026, end: 'current', events: [
    { t: 1, kind: 'saw', detail: 'jett at heaven', sightingId: heaven.id, sighting: heaven },
    { t: 1, kind: 'saw', detail: 'jett at heaven' }, // controller observation without a sighting: ignored
  ] }] };
  const [good, bad, ...rest] = scoreTrace(trace);
  assert.equal(rest.length, 0);
  assert.equal(good!.score, 5); assert.equal(good!.sightingId, heaven.id); assert.equal(good!.delay, 1);
  assert.equal(bad!.score, 0);
  assert.deepEqual(Object.values(bad!.checks), [false, false, false, false, false]);
});

test('scorer: stale sightings ground but are not timely; future and wrong-region sightings never count', () => {
  assert.deepEqual(scoreCall('Smoke Heaven', 7, [heaven]).checks, { named: true, short: true, clear: true, grounded: true, timely: false });
  assert.equal(scoreCall('Smoke Heaven', 12, [heaven]).checks.grounded, false);
  assert.equal(scoreCall('Smoke Heaven', 0.5, [heaven]).checks.grounded, false);
  assert.equal(scoreCall('Smoke Vent', 2, [heaven]).checks.grounded, false);
  assert.equal(scoreCall('Smoke over there', 2, [heaven]).score, 1); // short only
});

test('session names and paired group summary', () => {
  assert.deepEqual(parseSessionName('sessions/P03-T-pre.json'), { participant: 'P03', group: 'RelAI', phase: 'pre' });
  assert.deepEqual(parseSessionName('P04-c-prac2.json'), { participant: 'P04', group: 'Plain', phase: 'prac2' });
  assert.equal(parseSessionName('relai-trace-plain-seed7001.json').group, 'Unknown');
  const rows = [
    { participant: 'P01', group: 'RelAI' as const, phase: 'pre', score: 2 }, { participant: 'P01', group: 'RelAI' as const, phase: 'post', score: 4 },
    { participant: 'P01', group: 'RelAI' as const, phase: 'post', score: 2 }, { participant: 'P01', group: 'RelAI' as const, phase: 'prac1', score: 5 },
    { participant: 'P02', group: 'Plain' as const, phase: 'pre', score: 3 }, // no post: unpaired, excluded
  ];
  assert.deepEqual(summarize(rows), [
    { group: 'RelAI', n: 1, pre: 2, post: 3, change: 1 },
    { group: 'Plain', n: 0, pre: null, post: null, change: null },
  ]);
});
