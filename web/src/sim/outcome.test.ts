import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Action } from '../../../shared/schema.js';
import { ROUND_TICKS, Round } from './round.js';

const SMOKES: Action[] = [{ type: 'smoke', target: 'heaven' }, { type: 'smoke', target: 'truck' }];

function play(seed: number, calls: Action[] = [], submitTick = 1) {
  const r = new Round(seed);
  r.selectPlay('fast_plant');
  while (!r.finished) {
    if (r.tick === submitTick && !r.brim.inspect().closed) for (const c of calls) r.brim.addGoal(c, 'command');
    r.step();
  }
  return r;
}

test('silence loses: with no calls the scripted attack walks into held angles and is wiped early', () => {
  for (const seed of [2026, 1, 2]) {
    const r = play(seed);
    assert.equal(r.outcome, 'loss');
    assert.ok(r.tick < ROUND_TICKS, 'a wipe ends the round before the timer');
    assert.equal(r.smokesLeft, 3, 'no utility was spent without a call');
  }
});

test('the same seeds win when the player calls smokes on Heaven and the Truck gap', () => {
  for (const seed of [2026, 1, 2]) {
    const r = play(seed, SMOKES);
    assert.equal(r.outcome, 'win');
    assert.equal(r.snapshot(true).spike.state, 'planted');
  }
});

test('drills have no outcome and keep running to the timer', () => {
  const r = new Round(2026, { liveDrill: true });
  while (!r.finished) { assert.equal(r.outcome, null); r.step(); }
  assert.equal(r.tick, ROUND_TICKS);
});

test('Fast Plant seed 2026 accepts realistic opening timing and still punishes a late call', () => {
  for (const tick of [0, 57, 58, 100, 109]) {
    const round = play(2026, SMOKES, tick);
    assert.equal(round.outcome, 'win', 'submit at tick ' + tick);
    assert.equal(round.smokesLeft, 1);
  }
  for (const tick of [110, 140]) assert.equal(play(2026, SMOKES, tick).outcome, 'loss');
  assert.equal(play(2026).tick, 242);
});
