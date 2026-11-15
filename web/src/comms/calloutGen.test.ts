import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrimEventSchema, BrimResponseSchema } from '../../../shared/schema.js';
import { regionAt } from '../map/geometry.js';
import { FixedClock } from '../sim/loop.js';
import { Round } from '../sim/round.js';
import { CalloutGenerator } from './calloutGen.js';

const jett = { id: 'jett', x: 655, y: 140 };
const kj = { id: 'kj', x: 660, y: 165 };
const truck = { id: 'viper', x: 470, y: 378 };

test('one edge per tick and region, counts distinct current IDs, speaks map names', () => {
  const g = new CalloutGenerator();
  const hall = [jett, kj].map(a => ({ ...a, x: 340, y: 328 }));
  g.observe(1, [...hall, hall[0]!, truck]);
  g.observe(1, []); // duplicate delivery of the same tick
  const call = g.take()!;
  assert.deepEqual(call.sighting.defenderIds, ['jett', 'kj']);
  assert.equal(call.text, 'Two U-Hall.');
  assert.ok(BrimResponseSchema.safeParse({ reply: call.text, actions: [], needs: null }).success);
  assert.equal(g.take()?.text, 'One Truck.');
  for (let t = 2; t <= 80; t++) { g.observe(t, [truck, ...hall.reverse()]); assert.equal(g.take(), undefined); }
  assert.equal(g.events().filter(e => e.kind === 'saw').length, 2);
});

test('current group replaces pending counts, genuine reacquisition waits 60 ticks from playback', () => {
  const g = new CalloutGenerator();
  g.observe(1, [jett, kj]);
  const first = g.take()!;
  g.observe(4, [jett, kj]);
  g.playback(first, 'started');
  g.observe(5, []);
  assert.ok(!g.isCurrent(first.sighting));
  g.observe(6, [jett, kj]);
  g.observe(7, [kj, truck]);
  assert.equal(g.take()?.text, 'One Truck.');
  g.observe(63, [kj, truck]);
  assert.equal(g.take(), undefined);
  g.observe(64, [kj, truck]);
  const next = g.take()!;
  assert.equal(next.text, 'One Heaven.');
  assert.deepEqual(next.sighting.defenderIds, ['kj']);
  assert.ok(g.events().some(e => e.calloutStage === 'skipped' && e.sightingId === '6/heaven'));
});

test('a short unreported fluctuation cannot repeat unchanged speech, while a new region can', () => {
  const g = new CalloutGenerator();
  g.observe(1, [jett]);
  g.playback(g.take()!, 'started');
  g.observe(2, [jett, kj]);
  g.observe(3, [jett]);
  g.observe(80, [jett]);
  assert.equal(g.take(), undefined);
  g.observe(81, [{ ...truck, id: 'jett' }]);
  assert.equal(g.take()?.text, 'One Truck.');
});

test('stale queue, tab discard, and unsupported area clearance produce no speech', () => {
  const g = new CalloutGenerator();
  g.observe(1, [jett, truck]);
  g.observe(2, [truck]);
  g.discardPending('Tab hidden');
  g.observe(3, [truck]); // unchanged on return
  assert.equal(g.take(), undefined);
  assert.deepEqual(g.events().filter(e => e.calloutStage === 'skipped').map(e => e.detail), ['Contact lost', 'Tab hidden']);
  assert.ok(!g.events().some(e => /clear/i.test(e.detail)));
});

test('Triple cover remains opaque to Brim with designer view on', () => {
  const r = new Round(2026, { calloutDrill: 'cover' });
  for (let i = 0; i < 100; i++) {
    r.step();
    assert.ok(r.snapshot(true).agents.some(a => a.id === 'jett'));
    assert.ok(!r.snapshot().agents.some(a => a.id === 'jett'));
    assert.deepEqual(r.observations('brim'), []);
    assert.equal(r.callouts.take(), undefined);
  }
  assert.deepEqual(r.callouts.events(), []);
});

test('active Heaven smoke breaks the sighting and no new claim occurs through smoke', () => {
  const r = new Round(2026, { calloutDrill: 'sighting' });
  r.brim.addGoal({ type: 'smoke', target: 'heaven' });
  while (!r.activeSmokes().length && r.tick < 60) r.step();
  assert.ok(r.activeSmokes().length, 'Heaven smoke must land during the fixture');
  assert.ok(r.callouts.events().some(e => e.kind === 'saw'));
  const edges = r.callouts.events();
  for (let i = 0; i < 70; i++) {
    r.step();
    assert.deepEqual(r.observations('brim'), []);
    assert.equal(r.callouts.take(), undefined);
  }
  assert.deepEqual(r.callouts.events(), edges);
});

test('no buy-phase or post-death sightings, reset creates a fresh queue and sighting sequence', () => {
  const r = new Round(2026);
  r.step();
  assert.ok(!r.canCallout);
  assert.deepEqual(r.callouts.events(), []);
  r.selectPlay('fast_rush');
  while (r.canCallout) r.step();
  assert.ok(!r.finished);
  assert.ok(!r.snapshot().agents.find(a => a.isBrim)!.alive);
  const edges = r.callouts.events();
  assert.ok(edges.some(e => e.kind === 'saw'));
  while (!r.finished) r.step();
  assert.deepEqual(r.callouts.events(), edges);
  assert.equal(r.callouts.take(), undefined);
  r.reset();
  assert.equal(r.phase, 'buy');
  assert.deepEqual(r.callouts.events(), []);
});

test('fixed seed generates and schedules the same grounded calls at 30 and 144 fps', () => {
  function run(fps: number) {
    const r = new Round(2026, { calloutDrill: 'multiple' });
    const clock = new FixedClock();
    while (!r.finished) clock.advance(1000 / fps, 1, () => {
      r.step();
      const call = r.callouts.take();
      if (!call) return;
      const actual = r.observations('brim').filter(a => regionAt(a.x, a.y) === call.sighting.region);
      assert.deepEqual(call.sighting.defenderIds, actual.map(a => a.id).sort());
      r.callouts.playback(call, 'started');
      r.callouts.playback(call, 'completed');
    });
    const events = r.callouts.events();
    assert.ok(events.every(e => BrimEventSchema.safeParse(e).success));
    for (const said of events.filter(e => e.kind === 'said')) {
      const saw = events.find(e => e.kind === 'saw' && e.sightingId === said.sightingId)!;
      assert.ok(saw.sighting && saw.t <= said.t);
      assert.equal(saw.sighting.count, saw.sighting.defenderIds.length);
    }
    assert.deepEqual(events.filter(e => e.kind === 'said').slice(0,2).map(e => e.detail), ['Two Heaven.', 'One Back Site.']);
    return events;
  }
  assert.deepEqual(run(30), run(144));
});
