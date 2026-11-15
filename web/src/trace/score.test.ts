import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveReply } from '../comms/liveCall.js';
import { gameState } from '../comms/validator.js';
import { Round } from '../sim/round.js';
import type { Evaluation } from './evaluation.js';
import type { CommandTrace, ConversationRecord, TraceFile } from './log.js';
import { scoreTrace } from './score.js';

const jett = { id: 'jett', region: 'heaven' as const, visible: true };
const kj = { id: 'kj', region: 'uhall' as const, visible: true };
const truth: Evaluation = { throughTick: 200, frames: [
  { tick: 0, defenders: [{ ...jett, visible: false }] },
  { tick: 20, defenders: [jett] },
  { tick: 60, defenders: [jett, kj] },
  { tick: 120, defenders: [{ ...jett, visible: false }, kj] },
  { tick: 170, defenders: [kj] },
] };
function fixture(...lines: [string, number][]): TraceFile {
  return { version: 3, scope: 'gameplay', rounds: [{ roundId: 1, seed: 2026, events: [], end: 'current', evaluation: truth }],
    records: lines.map(([transcript, tick], id): ConversationRecord => ({
      id, t: 999, input: 'voice', transcript, source: 'keyword', audio: null, status: 'completed', notices: [],
      latencyMs: { stt: null, think: null, firstAudio: null },
      command: { roundId: 1, t: tick / 20, path: 'keyword', goalIds: [], validator: { ok: false } },
    })) };
}
const one = (text: string, tick = 40) => scoreTrace(fixture([text, tick]));

test('count, named identity, aliases and unstated counts are independent of command acceptance', () => {
  assert.deepEqual(one('One Heaven').rates.count, { passed: 1, eligible: 1 });
  assert.deepEqual(one('Five Heaven').rates.count, { passed: 0, eligible: 1 });
  assert.deepEqual(one('1 stairs').calls[0]!.claims, one('One Heaven').calls[0]!.claims);
  assert.deepEqual(one('Jett Heaven').rates.count, { passed: 0, eligible: 0 });
  assert.deepEqual(one('Jett Heaven').rates.countStated, { passed: 0, eligible: 1 });
  assert.equal(one('Omen Heaven').calls[0]!.claims[0]!.location, false);
  assert.equal(one('Two U-Hall', 65).calls[0]!.claims[0]!.countAccurate, false);
  assert.equal(one('Killjoy lamps', 65).calls[0]!.claims[0]!.location, true);
});

test('score every named region, with local count scope; keep unsupported language for clarification', () => {
  const report = one('One Heaven and Vent');
  assert.deepEqual(report.rates.location, { passed: 1, eligible: 2 });
  assert.equal(report.calls[0]!.claims[1]!.count, null);
  assert.equal(report.rates.count.eligible, 0, 'ambiguous scope does not assign a number to either region');
  assert.equal(report.calls[0]!.clear, false);
  assert.equal(report.calls[0]!.claims[1]!.status, 'unsupported');
  assert.deepEqual(one('One Heaven and two lamps', 60).calls[0]!.claims.map(c => c.countAccurate), [true, false]);
  assert.equal(one('One Heaven or Truck').calls[0]!.clear, false);
  assert.equal(one('I saw one').calls[0]!.clear, false);
  const conflict = one('One Heaven and five stairs');
  assert.deepEqual(conflict.rates.location, { passed: 1, eligible: 1 });
  assert.equal(conflict.rates.count.eligible, 0);
  assert.equal(conflict.calls[0]!.clear, false);
  assert.equal(one('No Jett at Heaven').rates.location.eligible, 0);
  assert.equal(one('No Jett at Heaven').calls[0]!.clear, null);
  assert.equal(one('I saw one enemy at Heaven and one at Vent').calls[0]!.brief, false);
});

test('tactical action, utility, off-site and vague orders earn no reporting points', () => {
  for (const text of ['Smoke Heaven and Vent', 'Move Triple', 'Molly U-Hall', 'Smoke B', 'Smoke over there', 'Your call']) {
    const result = one(text);
    assert.equal(result.calls[0]!.category, 'tactical');
    assert.ok(Object.values(result.rates).every(m => m.eligible === 0));
  }
  assert.equal(one('what was that').calls[0]!.category, 'unclassified');
});

test('hidden, stale and dead contacts cannot ground a report, even if Brim spoke', () => {
  for (const tick of [0, 120, 169, 170]) {
    const trace = fixture(['One Heaven', tick]);
    trace.rounds[0]!.events.push({ t: tick / 20, kind: 'said', detail: 'One Heaven.' });
    const claim = scoreTrace(trace).calls[0]!.claims[0]!;
    assert.equal(claim.status, 'unsupported');
    assert.equal(claim.actualCount, tick < 170 ? 1 : 0);
    assert.equal(claim.observableCount, 0);
    assert.equal(claim.factualLocation, tick < 170);
    assert.equal(claim.timely, null);
  }
  const trace = fixture(['One Heaven', 50]);
  trace.rounds[0]!.evaluation = { throughTick: 50, frames: [{ tick: 0, defenders: [jett, { ...jett, id: 'omen', visible: false }] }] };
  const claim = scoreTrace(trace).calls[0]!.claims[0]!;
  assert.equal(claim.actualCount, 2);
  assert.equal(claim.countAccurate, true, 'the unobservable defender is outside the report denominator');
});

test('first opportunity, duplicate exclusion, reacquisition and round boundaries', () => {
  const late = one('One Heaven', 85).calls[0]!.claims[0]!;
  assert.equal(late.delaySeconds, 3.25);
  assert.equal(late.timely, false);
  const trace = fixture(['One Heaven', 80], ['1 stairs and one lamps', 85], ['Jett top', 90], ['Two heaven', 155]);
  trace.rounds[0]!.evaluation = { throughTick: 155, frames: [...truth.frames.slice(0, 4), { tick: 150, defenders: [jett, kj] }] };
  trace.rounds.push({ ...trace.rounds[0]!, roundId: 2 });
  trace.records.push({ ...trace.records[0]!, id: 10, command: { ...trace.records[0]!.command!, roundId: 2 } });
  const result = scoreTrace(trace);
  assert.deepEqual(result.calls[1]!.claims.map(c => c.status), ['duplicate', 'observed']);
  assert.equal(result.calls[2]!.brief, null);
  assert.equal(result.calls[3]!.claims[0]!.firstTick, 150);
  assert.deepEqual(result.rates.count, { passed: 3, eligible: 4 });
  assert.deepEqual(result.rates.brief, { passed: 4, eligible: 4 });
  assert.equal(result.calls[0]!.claims[0]!.timely, true, '3.00 s is timely');
});

test('legacy, missing rounds, damaged evidence, designer exposure and uncovered ticks stay unavailable', () => {
  for (const trace of [fixture(['One Heaven', 210]), fixture(['One Heaven', 20.1]),
    { ...fixture(['One Heaven', 20]), rounds: [] }, ...[undefined, { throughTick: 100, frames: [] },
      { throughTick: 100, frames: [{ tick: 10, defenders: [jett] }] }].map(evaluation => {
      const f = fixture(['One Heaven', 20]);
      f.version = 2;
      f.rounds[0]!.evaluation = evaluation;
      return f;
    }), { ...fixture(['One Heaven', 20]), rounds: [{ ...fixture().rounds[0]!, designerExposed: true }] }]) {
    const result = scoreTrace(trace);
    assert.equal(result.calls[0]!.claims[0]!.status, 'unavailable');
    assert.equal(result.rates.location.eligible, 0);
    assert.equal(result.calls[0]!.brief, true);
    assert.ok(result.warnings.length);
  }
});

test('capture exactly matches the post-combat public map; active exports and LLM context stay fogged', () => {
  const r = new Round(2026);
  r.selectPlay('fast_plant');
  const visible: string[][] = [];
  do {
    visible.push(r.snapshot().agents.filter(d => d.team === 'def').map(d => d.id));
    if (r.finished) break;
    assert.equal(r.evaluationTrace('current'), undefined);
    r.step();
  } while (true);
  const evidence = r.evaluationTrace('current')!;
  assert.ok(evidence.frames.length < r.tick);
  for (const [tick, ids] of visible.entries()) {
    const frame = evidence.frames.filter(f => f.tick <= tick).at(-1)!;
    assert.deepEqual(frame.defenders.filter(d => d.visible).map(d => d.id), ids);
  }
  r.reset();
  assert.ok(r.snapshot().agents.every(a => a.team === 'atk'), 'buy cannot reveal the lineup before tick zero');
  r.selectPlay('fast_plant');
  assert.deepEqual(r.evaluationTrace('restart')!.frames.length, 1);
  const state = gameState(r, 'match')!;
  assert.equal('evaluation' in state, false);
  assert.ok(!state.knownEnemies.some(enemy => enemy.region === 'heaven'));
});

test('both bot modes use identical evidence and scoring, including live report and goal routing', async () => {
  async function replay(plain: boolean) {
    const r = new Round(2026);
    r.selectPlay('fast_plant');
    const file = fixture(['One Cubby', 0], ['Smoke Heaven and Truck', 100]);
    for (const record of file.records) {
      while (r.time < record.command!.t) r.step();
      let command!: CommandTrace;
      await liveReply(r, 1, 'match', record.transcript, new AbortController().signal, c => { command = c; },
        () => { throw new Error('unexpected model path'); }, { plain });
      record.command = command;
    }
    assert.ok(file.records[0]!.command!.report);
    assert.deepEqual(file.records[0]!.command!.goalIds, []);
    assert.equal(file.records[1]!.command!.goalIds.length, 2);
    while (!r.finished) r.step();
    assert.equal(r.outcome, 'win');
    file.rounds[0]!.evaluation = r.evaluationTrace('current');
    const postRound = { ...file.records[0]!, command: { ...file.records[0]!.command!, inPlay: false } };
    file.records.push(postRound, { ...file.records[0]!, input: 'callout' });
    return { evidence: file.rounds[0]!.evaluation, result: scoreTrace(file) };
  }
  const result = await replay(false);
  assert.equal(result.result.calls.length, 2);
  assert.deepEqual(result, await replay(true));
  assert.deepEqual(result, await replay(false));
});

test('PTT release assesses the actual spoken report before STT finalization without changing command time', () => {
  const trace = fixture(['One Heaven', 125]);
  trace.records[0]!.speechRelease = { roundId: 1, tick: 119 };
  const [call] = scoreTrace(trace).calls;
  assert.equal(call!.t, 6.25);
  assert.equal(call!.assessedAt, 5.95);
  assert.equal(call!.claims[0]!.status, 'observed');
  trace.records[0]!.speechRelease!.roundId = 2;
  assert.equal(scoreTrace(trace).calls[0]!.claims[0]!.status, 'unsupported');
});

test('smoke blocks public evaluation evidence even when the offline roster still contains Jett', () => {
  const r = new Round(2026, { calloutDrill: 'sighting' });
  r.brim.addGoal({ type: 'smoke', target: 'heaven' });
  while (!r.activeSmokes().length) r.step();
  const file = fixture(['One Heaven', r.tick]);
  file.rounds[0]!.evaluation = r.evaluationTrace('restart');
  const claim = scoreTrace(file).calls[0]!.claims[0]!;
  assert.equal(claim.factualLocation, true);
  assert.equal(claim.observableCount, 0);
  assert.equal(claim.location, false);
});
