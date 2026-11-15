import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrimEventSchema, type Action } from '../../../shared/schema.js';
import { ATTACKER_STARTS, PLANT_SPOTS, REGIONS } from '../map/bindA.js';
import { dist, findPath, hasLOS, inPlantZone, navLine, regionAt } from '../map/geometry.js';
import { position } from './agents.js';
import { BrimController, destination, PLANT_TICKS, type BrimFrame } from './brim.js';
import { FixedClock } from './loop.js';
import { Round, type RoundEvent } from './round.js';

const practice = () => new Round(2026, { practice: true });
const self = (r: Round) => r.snapshot().agents.find(a => a.isBrim)!;
const status = (r: Round, id: number) => r.brim.inspect().goals.find(g => g.id === id)!;
function advance(r: Round, n: number) {
  const events: RoundEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...r.step());
  return events;
}

test('every region resolves to reachable floor; movement actually rounds intervening cover', () => {
  for (const { id } of REGIONS) {
    const to = destination(id)!;
    assert.equal(regionAt(...to), id);
    assert.deepEqual(findPath(ATTACKER_STARTS.short[0]!, to).at(-1), to);
  }
  const r = practice(), to = destination('triple')!, goal = r.brim.addGoal({ type: 'move', target: 'triple' });
  let from = position(self(r));
  assert.equal(navLine(from,to), false);
  for (let i = 0; i < 350 && status(r,goal).status !== 'done'; i++) {
    r.step(); const p = position(self(r));
    assert.ok(navLine(from,p)); assert.ok(dist(from,p) <= 61 * 0.05 + 1e-8); from = p;
  }
  assert.deepEqual(from,to); assert.equal(status(r,goal).status, 'done');
  const retreat = r.brim.addGoal({ type: 'fallback' }); r.step();
  assert.equal(r.brim.inspect().state, 'retreat');
  advance(r,250); assert.equal(status(r,retreat).status, 'done');
  assert.deepEqual(position(self(r)), ATTACKER_STARTS.short[0]);
});

test('priority then insertion order; hold stops immediately, resume replans, cancellation stops a route', () => {
  const r = practice(), move = r.brim.addGoal({ type: 'move', target: 'default' });
  const later = r.brim.addGoal({ type: 'smoke', target: 'heaven' });
  advance(r,10);
  const at = position(self(r)), hold = r.brim.addGoal({ type: 'hold', target: 'cubby' }, 'tactical');
  assert.deepEqual(r.brim.inspect().queue.map(g => g.id), [hold,move,later]);
  for (let i=0; i<20; i++) { r.step(); assert.deepEqual(position(self(r)), at); }
  assert.equal(status(r,hold).status, 'done'); assert.equal(status(r,move).status, 'paused');
  r.step(); assert.notDeepEqual(position(self(r)), at);
  const stop = position(self(r));
  r.brim.cancelGoal(move); r.step();
  assert.deepEqual(position(self(r)), stop); assert.equal(status(r,move).status,'cancelled');
  assert.equal(status(r,later).status,'done');
  const newMove = r.brim.addGoal({ type:'move', target:'tower' });
  r.brim.clearGoals(); advance(r,50);
  assert.equal(status(r,newMove).status,'cancelled'); assert.deepEqual(position(self(r)), stop);
});

test('utility validates terrain and inventory before emitting one visual and one matching action trace', () => {
  const r = practice();
  const add = (a: Action) => r.brim.addGoal(a);
  const blocked = add({ type:'molly', target:'heaven' });
  const good = add({ type:'molly', target:'a_link' });
  const empty = add({ type:'molly', target:'a_link' });
  const ids = Array.from({length:4}, () => add({ type:'smoke', target:'heaven' }));
  const fx = advance(r,70);
  assert.equal(status(r,blocked).reason,'molly trajectory blocked');
  assert.equal(status(r,good).status,'done'); assert.equal(status(r,empty).reason,'no molly charges');
  assert.equal(status(r,ids[3]!).reason,'no smoke charges');
  assert.equal(r.mollyLeft,0); assert.equal(r.smokesLeft,0);
  const molly = fx.filter(e => e.effect.type === 'molly');
  assert.equal(molly.length,1);
  const effect = molly[0]!.effect;
  assert.ok(effect.type === 'molly' && hasLOS(effect.from,effect.to));
  for (const kind of ['smoke','molly']) {
    assert.deepEqual(r.brim.events().filter(e => e.kind === 'did' && e.detail.includes('deployed ' + kind)).map(e => e.t),
      fx.filter(e => e.effect.type === kind).map(e => e.tick * 0.05));
  }
  assert.ok(r.brim.events().every(e => BrimEventSchema.safeParse(e).success && e.kind !== 'said'));
});

test('invalid targets and repeated failures cancel stale work and recover just once', () => {
  const r = practice();
  const bad = r.brim.addGoal({ type:'smoke', target:'default' });
  const invalid = r.brim.addGoal({ type:'plant', target:'heaven' } as unknown as Action);
  const stale = r.brim.addGoal({ type:'plant', target:'default' });
  advance(r,400);
  assert.match(status(r,bad).reason!, /invalid smoke/); assert.match(status(r,invalid).reason!, /invalid action/);
  assert.equal(status(r,stale).status,'cancelled');
  assert.deepEqual(r.brim.inspect().queue,[]);
  assert.equal(r.brim.inspect().goals.filter(g => g.recovery && g.status === 'done').length,1);
  assert.equal(r.smokesLeft,3); assert.equal(r.snapshot().spike.state,'carried');
});

test('unreachable paths and blocked movement use bounded recovery; a blocked script holds safely', () => {
  for (const traversable of [false,true]) {
    const brain = new BrimController();
    const frame: BrimFrame = { tick:0, pos:[372,656], contacts:[], route: () => traversable,
      deploy: () => undefined, stopPlant() {}, watch() {}, plant() {} };
    brain.addGoal({type:'move',target:'default'});
    let recoveryVisible = false;
    for (let i=0; i<300; i++) {
      brain.step({...frame,tick:i+1});
      recoveryVisible ||= brain.recovering;
    }
    assert.equal(recoveryVisible,true);
    assert.equal(brain.recovering,false);
    const {goals,queue,state} = brain.inspect();
    assert.equal(goals.length,2); assert.deepEqual(queue,[]); assert.equal(state,'hold');
    assert.ok(goals.every(g => g.status === 'failed' && g.reason === (traversable ? 'no movement progress' : 'unreachable destination')));
    assert.equal(brain.events().filter(e=>e.detail.includes('fall back')).length,1);
  }
});

test('carrier plants only at the requested spot: interruption resets the full four-second channel', () => {
  const r = practice(), id = r.brim.addGoal({type:'plant',target:'default'});
  for (let i=0; i<350 && r.snapshot().spike.state !== 'planting'; i++) r.step();
  const at = position(self(r));
  assert.deepEqual(at,PLANT_SPOTS.default); assert.ok(inPlantZone(...at));
  advance(r,35);
  const interrupted = r.snapshot().spike;
  assert.ok(interrupted.state === 'planting' && interrupted.progress === 35/PLANT_TICKS);
  r.brim.addGoal({type:'wait'},'tactical'); advance(r,20);
  assert.equal(r.snapshot().spike.state,'carried'); assert.ok(self(r).hasSpike);
  r.step();
  const started = r.tick;
  for (let i=0; i<PLANT_TICKS; i++) {
    assert.equal(r.snapshot().spike.state,'planting'); assert.deepEqual(position(self(r)),at); r.step();
  }
  assert.deepEqual(r.snapshot().spike,{state:'planted',x:at[0],y:at[1],plantedAt:(started+PLANT_TICKS)*0.05});
  assert.equal(self(r).hasSpike,false); assert.equal(status(r,id).status,'done');
  assert.equal(r.brim.events().filter(e=>e.detail === '#' + id + ' planted default').length,1);
  const other = r.brim.addGoal({type:'plant',target:'alt'}); r.step();
  assert.equal(status(r,other).status,'failed'); assert.equal(r.snapshot().spike.state,'planted');
});

test('default spike stays with Sova; Brim covers from a distinct position with a sightline', () => {
  const r = new Round(2026, { liveDrill: true }); advance(r,240);
  const scene = r.snapshot();
  assert.ok(scene.agents.find(a=>a.id === 'sova')?.hasSpike);
  assert.ok(!self(r).hasSpike); assert.equal(scene.spike.state,'carried');
  assert.ok(dist(position(self(r)),PLANT_SPOTS.default) >= 18);
  assert.ok(hasLOS(position(self(r)),PLANT_SPOTS.default));
  assert.ok(r.brim.events().some(e=>e.kind === 'did' && e.detail.includes('covered sova')));
  assert.ok(!r.brim.events().some(e=>e.detail.includes('planted default')));
});

test('different hidden Omen positions produce identical goals until observed; a new sighting interrupts once', () => {
  const a = new Round(0, { liveDrill: true }), b = new Round(2, { liveDrill: true });
  assert.notDeepEqual(a.snapshot(true).agents.at(-1), b.snapshot(true).agents.at(-1));
  for (let i=0;i<30;i++) {
    assert.deepEqual(a.observations('brim'), b.observations('brim'));
    a.step(); b.step(); assert.deepEqual(a.brim.inspect(), b.brim.inspect()); assert.deepEqual(a.brim.events(), b.brim.events());
  }
  const r = new Round(2026, { liveDrill: true });
  for (let i=0;i<30;i++) {
    const seen = r.observations('brim').map(c=>c.id), before = r.brim.events().length;
    r.step();
    for (const e of r.brim.events().slice(before)) if (e.kind==='saw' && !e.detail.startsWith('lost')) {
      assert.ok(seen.includes(e.detail.split(' ')[0]!));
    }
  }
  const trace = r.brim.events();
  assert.equal(trace.filter(e=>e.detail.includes('hold angle on visible omen')).length,1);
  assert.ok(trace.some(e=>e.detail.includes('lost sight of omen')));
  assert.ok(trace.some(e=>e.detail.includes('resume move')));
  assert.equal(r.brim.inspect().knownEnemies.omen!.visible,false);
});

test('death closes the controller in the kill tick and subsequent ticks cannot act or spend', () => {
  const r = new Round(2, { liveDrill: true });
  while(self(r).alive && !r.finished) r.step();
  assert.equal(self(r).alive,false);
  const events = r.brim.events(), at = position(self(r)), left = r.smokesLeft;
  assert.deepEqual(r.brim.inspect().queue,[]);
  assert.throws(()=>r.brim.addGoal({type:'smoke',target:'heaven'}),/death/);
  advance(r,200);
  assert.deepEqual(r.brim.events(),events); assert.deepEqual(position(self(r)),at); assert.equal(r.smokesLeft,left);
});

test('same seed and command ticks replay movement, combat, perception, goals, and ordered effects at 30/60/144 fps', () => {
  function run(fps: number) {
    const r = new Round(2026, { liveDrill: true }), clock = new FixedClock(), effects: RoundEvent[] = [], trajectory: ReturnType<typeof position>[] = [];
    for (let i=0; i<fps*40; i++) {
      clock.advance(1000/fps,1,()=>{
        if (r.tick === 25) r.brim.addGoal({type:'smoke',target:'uhall'});
        if (r.tick === 90) r.brim.addGoal({type:'hold',target:'truck'});
        effects.push(...r.step()); trajectory.push(position(self(r)));
      });
      r.snapshot(i%2 === 0,clock.alpha);
    }
    return { trajectory, effects, final:r.snapshot(true), goals:r.brim.inspect(), events:r.brim.events() };
  }
  const baseline = run(30); assert.deepEqual(run(60),baseline); assert.deepEqual(run(144),baseline);
});

test('a command that deploys the planned Heaven smoke fulfils the outstanding play cue', () => {
  const r = new Round(2026, { liveDrill: true });
  const id = r.brim.addGoal({ type:'smoke', target:'heaven' });
  const fx = advance(r,350);
  assert.equal(status(r,id).status,'done');
  assert.equal(fx.filter(e=>e.effect.type==='smoke').length,1);
  assert.equal(r.smokesLeft,2);
  assert.ok(r.brim.inspect().goals.some(g => g.reason === 'superseded by deployment #' + id));
});
