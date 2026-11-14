import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActionSchema, BrimResponseSchema, GameStateForLLMSchema, TurnLogSchema, BrimEventSchema, RegionIdSchema } from './schema.js';

test('Action accepts every discriminant and every region target', () => {
  for (const type of ['smoke', 'molly', 'move', 'hold']) {
    for (const target of RegionIdSchema.options) {
      const action = { type, target };
      assert.deepEqual(ActionSchema.parse(action), action);
    }
  }
  for (const target of ['default', 'alt']) assert.ok(ActionSchema.safeParse({ type: 'plant', target }).success);
  for (const type of ['go', 'wait', 'fallback']) assert.deepEqual(ActionSchema.parse({ type }), { type });
});

test('Action rejects missing targets, wrong sites, invalid plant spots and extra fields', () => {
  for (const action of [
    { type: 'smoke' }, { type: 'molly', target: 'b_long' },
    { type: 'move', target: 'alt' }, { type: 'hold', target: null },
    { type: 'plant', target: 'heaven' }, { type: 'plant' },
    { type: 'go', target: 'default' }, { type: 'shoot' }, {}, null,
  ]) assert.equal(ActionSchema.safeParse(action).success, false, JSON.stringify(action));
});

const response = { reply: 'Copy. Holding A Short.', actions: [], needs: null };
test('BrimResponse accepts null and all needs values, with nested actions', () => {
  assert.deepEqual(BrimResponseSchema.parse(response), response);
  for (const needs of [null, 'target', 'site', 'count']) {
    assert.ok(BrimResponseSchema.safeParse({ ...response, needs, actions: [{ type: 'smoke', target: 'heaven' }, { type: 'plant', target: 'alt' }] }).success);
  }
});

test('BrimResponse rejects invalid fields and nested actions', () => {
  for (const payload of [
    { ...response, needs: 'location' }, { ...response, needs: undefined },
    { ...response, reply: 1 }, { ...response, actions: null },
    { ...response, actions: [{ type: 'smoke', target: 'b_long' }] },
    { ...response, extra: true }, {}, null,
  ]) assert.equal(BrimResponseSchema.safeParse(payload).success, false);
});

test('remaining contracts preserve fields, enums, optionality and nullability', () => {
  const state = {
    phase: 'buy', t: 0, mode: 'learn',
    brim: { region: 'a_lobby', smokesLeft: 3, mollyLeft: 1, hasSpike: true },
    allies: [{ name: 'Ally', region: 'showers', alive: true }],
    knownEnemies: [{ region: 'heaven', count: 1, secondsAgo: 0 }], play: null,
  };
  assert.deepEqual(GameStateForLLMSchema.parse(state), state);
  assert.equal(GameStateForLLMSchema.safeParse({ ...state, play: undefined }).success, false);
  assert.equal(GameStateForLLMSchema.safeParse({ ...state, phase: 'ended' }).success, false);
  for (const play of ['fast_plant', 'fast_rush', 'slow_push']) {
    assert.ok(GameStateForLLMSchema.safeParse({ ...state, play, phase: 'post_plant', mode: 'match' }).success);
  }
  for (const path of ['keyword', 'llm']) {
    const log = { t: 0, transcript: 'Hold', path, response, validator: { ok: true }, latencyMs: { stt: 0, think: 0, firstAudio: 0 } };
    assert.deepEqual(TurnLogSchema.parse(log), log);
    assert.ok(TurnLogSchema.safeParse({ ...log, validator: { ok: false, reason: 'Missing target' } }).success);
    assert.equal(TurnLogSchema.safeParse({ ...log, path: 'mock' }).success, false);
  }
  for (const kind of ['saw', 'decided', 'said', 'did']) assert.ok(BrimEventSchema.safeParse({ t: 0, kind, detail: 'Test' }).success);
  assert.equal(BrimEventSchema.safeParse({ t: 0, kind: 'heard', detail: 'Test' }).success, false);
});
