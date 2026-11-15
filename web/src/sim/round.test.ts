import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFENDER_SPOTS, PLANT_SPOTS } from '../map/bindA.js';
import { dist, navLine } from '../map/geometry.js';
import { createAgents, moveAgent, position } from './agents.js';
import { resolveCombat } from './combat.js';
import { FixedClock, timeScale } from './loop.js';
import { Round, ROUND_TICKS, type RoundEvent } from './round.js';
import { canSee, perceive } from './visibility.js';
import type { Vec } from '../map/types.js';

test('accumulator runs only whole 50 ms steps and drops long-frame debt', () => {
  const clock = new FixedClock();
  let ticks = 0;
  const step = () => { ticks++; };
  clock.advance(49, 1, step); assert.equal(ticks, 0);
  clock.advance(1, 1, step); assert.equal(ticks, 1);
  clock.advance(35000, 1, step); assert.equal(ticks, 6);
  clock.advance(0, 1, step); assert.equal(ticks, 6);
  clock.advance(30, 1, step);
  clock.reset(); clock.advance(20, 1, step); assert.equal(ticks, 6);
});

test('only a Learn hold slows ticks; release restores normal speed', () => {
  for (const mode of ['learn', 'match'] as const) {
    const clock = new FixedClock(), round = new Round(2026, { liveDrill: true });
    for (const holding of [false, true, false]) {
      const start = round.tick;
      for (let i = 0; i < 60; i++) clock.advance(1000 / 60, timeScale(mode, holding), () => round.step());
      assert.equal(round.tick - start, mode === 'learn' && holding ? 10 : 20);
    }
  }
});

function run(round: Round, fps: number) {
  const events: RoundEvent[] = [], clock = new FixedClock();
  const frames = fps * 40;
  for (let f = 0; f < frames; f++) {
    clock.advance(1000 / fps, 1, () => events.push(...round.step()));
  }
  assert.equal(round.tick, ROUND_TICKS);
  return { events, scene: round.snapshot(true), smoke: round.smokesLeft };
}
test('same seed replays the same complete round, events and reset across frame rates', () => {
  const round = new Round(2026, { liveDrill: true }), initial = round.snapshot(true), first = run(round, 30);
  assert.ok(first.events.some(e => e.effect.type === 'kill'));
  assert.deepEqual(round.step(), []);
  round.reset();
  assert.deepEqual(round.snapshot(true), initial);
  assert.deepEqual(run(round, 144), first);
  assert.deepEqual(run(new Round(2026, { liveDrill: true }), 60), first);
  assert.deepEqual(position(first.scene.agents.find(a => a.id === 'sova')!), PLANT_SPOTS.default);
  assert.equal(first.scene.spike.state, 'carried');
});

test('seed selects only Omen; spawns are distinct, walkable, and all candidates are used', () => {
  const places = new Set<string>();
  const fixed = new Round(0, { liveDrill: true }).snapshot(true).agents.filter(a => a.id !== 'omen');
  for (let seed = 0; seed < 16; seed++) {
    const agents = new Round(seed, { liveDrill: true }).snapshot(true).agents;
    assert.equal(agents.length, 10);
    assert.deepEqual(agents.filter(a => a.id !== 'omen'), fixed);
    assert.ok(agents.every(a => navLine(position(a), position(a))));
    assert.equal(new Set(agents.map(a => position(a).join(','))).size, 10);
    places.add(position(agents.find(a => a.id === 'omen')!).join(','));
  }
  assert.deepEqual(places, new Set([DEFENDER_SPOTS.tower, DEFENDER_SPOTS.triple, DEFENDER_SPOTS.cubby].map(s => s.pos.join(','))));
});

test('every move across all three lineups stays on navigation, within speed, and clear of teammates', () => {
  for (const seed of [0, 2, 2026]) {
    const round = new Round(seed, { liveDrill: true });
    let previous = round.snapshot(true).agents;
    while (!round.finished) {
      round.step();
      const next = round.snapshot(true).agents;
      next.forEach((b, i) => {
        const a = previous[i]!, from = position(a), to = position(b);
        assert.ok(navLine(from, to));
        assert.ok(dist(from, to) <= 81 * 0.05 + 1e-8);
        if (!a.alive) assert.deepEqual(b, a);
        if (b.alive) for (const other of next.slice(i+1)) {
          if (other.alive && b.team === other.team) assert.ok(dist(to, position(other)) >= 18 - 1e-8);
        }
      });
      previous = next;
    }
  }
});

test('assigned routes replace scripted motion, failing safely on invalid goals', () => {
  const round = new Round(2026, { liveDrill: true });
  const raze = () => position(round.snapshot().agents.find(a => a.id === 'raze')!);
  const start = raze();
  assert.equal(round.assignRoute('raze', [[0, 0]]), false);
  for (let i = 0; i < 12; i++) round.step();
  assert.deepEqual(raze(), start);
  assert.equal(round.assignRoute('brim', [[372, 620]]), false); // goals own his route
  assert.equal(round.assignRoute('raze', [[402, 620]]), true);
  round.step();
  assert.notDeepEqual(raze(), start);
});

function duel(from: Vec, to: Vec) {
  const agents = createAgents(() => 0);
  const a = agents[0]!, b = agents.find(x => x.id === 'jett')!;
  [a.x, a.y] = from; [b.x, b.y] = to;
  a.facing = Math.atan2(b.y-a.y, b.x-a.x);
  b.facing = a.facing + Math.PI;
  return [a, b] as const;
}

test('perception requires a living observer, cone, range, open LOS and no smoke', () => {
  const [a,b] = duel([565, 220], [565, 373]);
  assert.ok(canSee(a,b,[]));
  a.facing += Math.PI; assert.equal(canSee(a,b,[]), false);
  a.facing -= Math.PI;
  assert.equal(canSee(a,b,[{ x:565, y:290, r:25 }]), false);
  assert.equal(canSee(a,{...b,y:550},[]), false);
  assert.equal(canSee({...a,alive:false},b,[]), false);
});

test('cover and smoke prevent all damage; a pre-aimed agent wins the exposed duel', () => {
  const [a,b] = duel([495, 305], [495, 378]); // Truck between them
  const agents = [b,a]; // less prepared agent fires second despite earlier roster order
  let tick = 0;
  for (; tick < 40; tick++) resolveCombat(agents, perceive(agents, []), tick);
  assert.equal(a.hp,100); assert.equal(b.hp,100);
  a.x = b.x = 565;
  const smoke = [{ x:565, y:340, r:20 }];
  for (; tick < 80; tick++) resolveCombat(agents, perceive(agents, smoke), tick);
  assert.equal(a.hp,100); assert.equal(b.hp,100);
  b.facing += 0.8;
  const kills = [];
  for (; tick < 120; tick++) kills.push(...resolveCombat(agents, perceive(agents, []), tick));
  assert.deepEqual(kills.map(k => [k.killer.id,k.victim.id]), [['brim','jett']]);
  assert.equal(b.hp,0); assert.ok(a.alive);
  b.path = [[565, 390]]; b.speed = 60;
  const dead = position(b); moveAgent(b, tick, agents); assert.deepEqual(position(b),dead);
});

test('one smoke event spends one charge; the cloud blocks Heaven only between landing and expiry', () => {
  const round = new Round(2026, { practice: true });
  round.brim.addGoal({ type: 'smoke', target: 'heaven' });
  const [a,b] = duel(DEFENDER_SPOTS.heaven.pos, PLANT_SPOTS.default);
  const events = [];
  for (let i = 1; i <= 380; i++) {
    events.push(...round.step());
    const blocked = i >= 13 && i < 313;
    assert.equal(round.activeSmokes().length, Number(blocked));
    assert.equal(canSee(a,b,round.activeSmokes()), !blocked);
    assert.equal(round.smokesLeft, 2);
  }
  assert.equal(events.filter(e => e.effect.type === 'smoke').length, 1);
});

test('designer reveals the roster without changing perception; normal view uses exactly Raze and Brim', () => {
  const round = new Round(0, { liveDrill: true });
  assert.equal(round.snapshot().agents.length,5);
  let sawDefender = false, sawPrivateContact = false;
  for (let i = 0; i < 400; i++) {
    const all = round.snapshot(true).agents;
    assert.equal(all.length,10);
    const seen = new Set(['raze','brim'].flatMap(id => round.observations(id).map(a => a.id)));
    const normal = round.snapshot().agents;
    assert.deepEqual(normal.map(a=>a.id),all.filter(a=>a.team==='atk'||seen.has(a.id)).map(a=>a.id));
    sawDefender ||= seen.size > 0;
    sawPrivateContact ||= round.observations('skye').some(a => !seen.has(a.id));
    round.step();
  }
  assert.ok(sawDefender && sawPrivateContact);
});
