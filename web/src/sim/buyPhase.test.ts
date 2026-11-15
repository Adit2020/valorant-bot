import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlayIdSchema } from '../../../shared/schema.js';
import { PLANT_SPOTS } from '../map/bindA.js';
import { dist, findPath, navLine, regionAt } from '../map/geometry.js';
import { defaultPlay, plays } from '../plays/index.js';
import { position } from './agents.js';
import { Round, type RoundEvent } from './round.js';

test('buy phase freezes the world at tick zero for 15 unscaled seconds', () => {
  const r = new Round(2026);
  const before = r.snapshot(true);
  assert.equal(r.phase, 'buy');
  assert.equal(r.play, null);
  assert.equal(r.buyRemainingMs, 15000);
  assert.deepEqual(r.brim.inspect().queue, []);
  for (let i = 0; i < 300; i++) assert.deepEqual(r.step(), []);
  assert.equal(r.advanceBuy(14999), false);
  assert.equal(r.buyRemainingMs, 1);
  assert.deepEqual(r.snapshot(true), before);
  assert.equal(r.tick, 0);
  assert.equal(r.advanceBuy(1), true);
  assert.equal(r.phase, 'live');
  assert.equal(r.play, defaultPlay);
  assert.equal(r.advanceBuy(16000), false);
  assert.equal(r.selectPlay('fast_rush'), false);
});

for (const id of PlayIdSchema.options) {
  test(id + ' selects its lineup and goals once, stays navigable and replays after reset', () => {
    const plan = plays[id];
    const r = new Round(2026);
    const initial = r.snapshot(true);
    function run() {
      r.advanceBuy(3500);
      assert.ok(r.selectPlay(id));
      assert.equal(r.play, id);
      assert.equal(r.selectPlay('slow_push'), false);
      const goals = r.brim.inspect().queue;
      assert.deepEqual(goals.map(g => g.action), plan.goals);
      assert.ok(goals.every(g => g.priority === 'plan'));
      let previous = r.snapshot(true).agents;
      assert.deepEqual(previous.filter(a => a.hasSpike).map(a => a.id), [plan.carrier]);
      for (const route of plan.routes) {
        let from = route.start;
        for (const to of route.waypoints) {
          assert.deepEqual(findPath(from, to).at(-1), to);
          from = to;
        }
      }
      const events: RoundEvent[] = [];
      const showers = new Set<string>();
      let plantingTicks = 0;
      while (!r.finished) {
        events.push(...r.step());
        const { agents, spike } = r.snapshot(true);
        for (const [i, a] of agents.entries()) {
          assert.ok(navLine(position(previous[i]!), position(a)));
          if (a.team === 'atk' && regionAt(a.x, a.y) === 'showers') showers.add(a.id);
          for (const b of agents.slice(i + 1)) {
            if (a.team === b.team && a.alive && b.alive) assert.ok(dist(position(a), position(b)) >= 18 - 1e-8);
          }
        }
        const sova = agents.find(a => a.id === plan.carrier)!;
        if (spike.state === 'planting') {
          plantingTicks++;
          assert.deepEqual(position(sova), PLANT_SPOTS.default);
          assert.ok(sova.hasSpike && sova.alive);
        }
        if (id === 'slow_push' && r.tick === 100) assert.deepEqual(position(sova), plan.routes.find(a => a.id === sova.id)!.start);
        previous = agents;
      }
      assert.ok(events.some(e => e.effect.type === 'kill'));
      assert.equal(showers.size, id === 'fast_rush' ? 5 : 2);
      // No play spends utility on its own: Brim smokes only when the player calls it.
      assert.equal(r.smokesLeft, 3);
      // With no calls the scripted attack walks into held angles and loses (sim/rules.ts).
      assert.equal(r.outcome, 'loss');
      return { events, snapshot: r.snapshot(true), decisions: r.brim.events() };
    }
    const result = run();
    r.reset();
    assert.equal(r.seed, 2026);
    assert.equal(r.phase, 'buy');
    assert.equal(r.buyRemainingMs, 15000);
    assert.equal(r.tick, 0);
    assert.equal(r.smokesLeft, 3);
    assert.equal(r.mollyLeft, 1);
    assert.deepEqual(r.brim.inspect().queue, []);
    assert.deepEqual(r.activeSmokes(), []);
    assert.deepEqual(r.snapshot(true), initial);
    assert.deepEqual(run(), result);
  });
}
