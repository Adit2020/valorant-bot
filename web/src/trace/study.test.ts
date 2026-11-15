import assert from 'node:assert/strict';
import test from 'node:test';
import { liveReply } from '../comms/liveCall.js';
import { gameState } from '../comms/validator.js';
import { REGION_BY_ID } from '../map/bindA.js';
import { regionAt } from '../map/geometry.js';
import { Round } from '../sim/round.js';
import { createStudyTrace, traceFilename, type ConversationRecord, type TraceFile } from './log.js';
import { scoreTrace } from './score.js';
import { analyzeStudy, reportingOpportunities, studyReport, type StudyInput } from './studyAnalysis.js';
import { isEvaluation, hideStudyResults, participantStatus, parseStudy, PHASES, PRACTICE, SCENARIOS, studyConfig, studyUrl, type StudyConfig } from './study.js';

const sessionId = 'd613903b-224f-423a-8bc8-3da6fd60ed6b';
const when = '2026-11-15T12:00:00.000Z';
const config = (phase = 'pre', id = 'P01', group = 'T', order = 'AB') => studyConfig(id, group, phase, order);
function fixture(c: StudyConfig, reports = true): TraceFile {
  const r = new Round(c.seed); r.selectPlay(c.play);
  const records: ConversationRecord[] = [];
  let previous = new Map<string, string>();
  while (!r.finished) {
    r.step();
    const groups = new Map<string, string[]>();
    for (const a of r.snapshot().agents.filter(a => a.team === 'def' && a.alive)) {
      const region = regionAt(a.x, a.y);
      if (region) groups.set(region, [...(groups.get(region) ?? []), a.id]);
    }
    const current = new Map([...groups].map(([region, ids]) => [region, ids.sort().join(',')]));
    if (reports) for (const [region, ids] of current) if (previous.get(region) !== ids) records.push({
      id: records.length + 1, t: r.time, input: 'text', transcript: 'One ' + REGION_BY_ID[region as keyof typeof REGION_BY_ID].name,
      source: 'keyword', audio: null, status: 'completed', notices: [], latencyMs: { stt: null, think: null, firstAudio: null },
      response: { reply: 'Copy.', actions: [], needs: null },
      command: { roundId: 1, t: r.time, path: 'keyword', goalIds: [], inPlay: true, validator: { ok: true }, ...(c.bot === 'plain' ? { plain: true } : {}) },
    });
    previous = current;
  }
  return createStudyTrace(records, [{ roundId: 1, seed: r.seed, play: r.play, mode: c.mode, end: 'current', result: r.result,
    designerExposed: false, evaluation: r.evaluationTrace('current'), events: [...r.brim.events(), ...r.callouts.events()] }], c, sessionId, when, when);
}
const input = (trace: TraceFile): StudyInput => ({ path: traceFilename(trace), trace });
const participant = (id = 'P01', group = 'T', reports = true) => PHASES.map(phase => input(fixture(config(phase, id, group), reports)));
const errors = (result: ReturnType<typeof analyzeStudy>) => result.issues.filter(i => i.level === 'error');

test('study defaults to A/pre and B/post; four fixed practice rounds progress without changing assignment', () => {
  assert.equal(parseStudy(new URLSearchParams('seed=2026')), undefined);
  let c = parseStudy(new URLSearchParams('participant=P01&group=T'))!;
  assert.equal(c.phase, 'pre'); assert.equal(c.scenarioId, 'A'); assert.equal(c.orderAssignment, 'default');
  for (const phase of PHASES) {
    c = parseStudy(new URL(studyUrl(c, phase), 'http://localhost').searchParams)!;
    assert.equal(c.phase, phase); assert.equal(c.condition, 'T'); assert.equal(c.orderAssignment, 'default');
  }
  assert.equal(c.scenarioId, 'B');
});

test('anonymous ID, group, phase, data kind and competing URL configuration fail with actionable errors', () => {
  for (const [id, group, phase] of [['Alice', 'T', 'pre'], ['P01', 'unknown', 'pre'], ['P01', 'T', 'practice'], ['FIX01', 'T', 'pre']])
    assert.throws(() => studyConfig(id!, group!, phase!));
  assert.throws(() => parseStudy(new URLSearchParams('participant=P01&group=T&seed=123')), /Remove seed/);
  assert.throws(() => parseStudy(new URLSearchParams('participant=P01&group=T&agentLab=sighting')), /agentLab/);
  assert.throws(() => parseStudy(new URLSearchParams('participant=P01&group=T&data=synthetic')), /data/);
  assert.throws(() => config('pre', 'P01', 'T', 'BB'), /order/);
});

test('optional counterbalancing deterministically alternates by numeric participant ID and persists', () => {
  const a = parseStudy(new URLSearchParams('participant=P01&group=T&order=balanced'))!;
  const b = parseStudy(new URLSearchParams('participant=P02&group=C&order=balanced'))!;
  assert.equal(a.order, 'AB'); assert.equal(b.order, 'BA'); assert.equal(b.scenarioId, 'B');
  const post = parseStudy(new URL(studyUrl(b, 'post'), 'http://localhost').searchParams)!;
  assert.equal(post.scenarioId, 'A'); assert.equal(post.orderAssignment, 'balanced');
});

test('both groups get identical evaluation configuration; treatment feedback exists only during practice', () => {
  for (const phase of PHASES) {
    const t = config(phase), c = config(phase, 'P02', 'C');
    assert.equal(t.seed, c.seed); assert.equal(t.play, c.play); assert.equal(t.mode, c.mode);
    if (isEvaluation(t)) {
      assert.equal(t.bot, 'plain'); assert.equal(c.bot, 'plain'); assert.equal(t.mode, 'match'); assert.ok(hideStudyResults(t));
    } else {
      assert.equal(t.bot, 'relai'); assert.equal(c.bot, 'plain'); assert.equal(hideStudyResults(t), false); assert.equal(hideStudyResults(c), true);
    }
  }
  assert.deepEqual(PHASES.filter(p => p.startsWith('prac')).map(p => config(p).mode), ['learn', 'learn', 'match', 'match']);
});

test('blinded/control lifecycle status never exposes private command/report validation', () => {
  for (const message of ['Command failed', 'Command accepted', 'Report unresolved', 'Report received']) {
    assert.equal(participantStatus('idle', message, true), 'Ready for another call.');
    assert.equal(participantStatus('thinking', message, true), 'Processing call…');
    assert.equal(participantStatus('speaking', message, true), 'Teammate speaking.');
    assert.equal(participantStatus('idle', message, false), message);
  }
  assert.equal(participantStatus('idle', 'Command failed', true, 'No local voice available'), 'No local voice available');
});

test('held-out seeds and play are absent from practice; scenarios are reproducible and publicly observable', () => {
  for (const s of Object.values(SCENARIOS)) {
    assert.ok(!PRACTICE.some(p => Number(p.seed) === s.seed));
    assert.ok(!PRACTICE.some(p => String(p.play) === s.play));
    const a = fixture(config(s.scenarioId === 'A' ? 'pre' : 'post'));
    const b = fixture(config(s.scenarioId === 'A' ? 'pre' : 'post'));
    assert.deepEqual(a.rounds, b.rounds);
    assert.equal(reportingOpportunities(a.rounds[0]!.evaluation!), s.scenarioId === 'A' ? 4 : 5);
    assert.ok(scoreTrace(a).rates.location.eligible >= 3);
  }
});

test('pre/post responses suppress validation, clarification and delegation feedback while gameplay commands work', async () => {
  for (const phase of ['pre', 'post']) for (const plain of [true, false]) {
    const c = config(phase), r = new Round(c.seed); r.selectPlay(c.play);
    for (const text of ['smoke over there', 'smoke B long', 'two heaven and vent', 'your call', 'smoke heaven']) {
      const reply = await liveReply(r, 1, 'match', text, new AbortController().signal, () => {}, undefined, { plain, evaluation: true });
      assert.deepEqual(reply.response, { reply: 'Copy.', needs: null, actions: [] });
    }
    assert.ok(r.brim.inspect().goals.some(g => g.action.type === 'smoke'));
  }
});

test('study filenames are unique per session/export and metadata includes real simulation settings without active truth leakage', () => {
  const c = config(), r = new Round(c.seed); r.selectPlay(c.play); r.step();
  const file = createStudyTrace([], [{ roundId: 1, seed: r.seed, play: r.play, mode: c.mode, end: 'current', events: [], evaluation: r.evaluationTrace('current') }], c, sessionId, when, when);
  assert.match(traceFilename(file), /^P01-T-pre--/);
  assert.notEqual(traceFilename(file), traceFilename(file, 2));
  assert.notEqual(traceFilename(file), traceFilename({ ...file, study: { ...file.study!, sessionId: 'a613903b-224f-423a-8bc8-3da6fd60ed6b' } }));
  assert.equal(file.study?.completion, 'incomplete'); assert.equal(file.rounds[0]?.evaluation, undefined);
  assert.equal(file.study?.bot, 'plain'); assert.equal(file.study?.condition, 'T');
  assert.equal(file.study?.scenarioId, 'A'); assert.equal(file.study?.inputPolicy, 'local-text');
  assert.doesNotMatch(JSON.stringify(gameState(r, 'match')), /evaluation|defenders|study|participantId|91001/);
  assert.equal(r.snapshot().agents.filter(a => a.team === 'def' && a.alive).length, 0);
});

test('complete silent rounds export and pair but zero denominators remain N/A', () => {
  const a = analyzeStudy(participant('P01', 'T', false));
  assert.equal(errors(a).length, 0); assert.equal(a.humanPairs, 1); assert.equal(a.human.location[0]?.n, 0);
  assert.equal(a.participants[0]?.change.location, null); assert.ok(a.issues.some(i => i.code === 'zero-denominator'));
  assert.match(studyReport(a), /0\/0 \(N\/A\)/);
});

test('aggregation reuses v2 scores, pairs participants and gives each participant equal weight despite different denominators', () => {
  const inputs = [...participant('P01'), ...participant('P02')];
  const pre = inputs[0]!.trace as TraceFile;
  // One unsupported claim among P01's four grounded pre reports => 4/5. P02 stays 4/4.
  const extra = structuredClone(pre.records[0]!); extra.id = 999; extra.transcript = 'One Vent'; pre.records.push(extra);
  const a = analyzeStudy(inputs);
  assert.deepEqual(errors(a), []); assert.equal(a.humanPairs, 2);
  const g = a.human.location[0]!;
  assert.equal(g.n, 2); assert.equal(g.pre, 90); assert.equal(g.post, 100); assert.equal(g.change, 10);
  assert.notEqual(g.pre, 8 / 9 * 100);
  assert.equal(a.participants[0]?.pre?.score.scoringVersion, 2);
});

test('missing pre/post and practice files produce actionable exclusions', () => {
  for (const phase of ['pre', 'post', 'prac2']) {
    const a = analyzeStudy(participant().filter(i => (i.trace as TraceFile).study!.phase !== phase));
    assert.equal(a.humanPairs, 0); assert.ok(errors(a).some(i => i.code === (phase.startsWith('prac') ? 'missing-practice' : 'missing-' + phase)));
  }
});

test('duplicate participant-phase downloads are never silently pooled', () => {
  const files = participant(); const a = analyzeStudy([...files, structuredClone(files[0]!)]);
  assert.equal(a.humanPairs, 0); assert.ok(errors(a).some(i => i.code === 'duplicate-phase'));
});

test('malformed versions, unknown groups, participant mismatches, missing evidence and aborted rounds are rejected', () => {
  const cases: [string, (t: TraceFile) => void][] = [
    ['invalid-trace', t => { t.version = 2; }],
    ['invalid-trace', t => { Object.assign(t.study!, { scoringVersion: 1 }); }],
    ['invalid-trace', t => { Object.assign(t.study!, { condition: 'X' }); }],
    ['filename', t => { t.study!.participantId = 'P99'; }],
    ['missing-evidence', t => { delete t.rounds[0]!.evaluation; }],
    ['incomplete', t => { delete t.rounds[0]!.result; t.study!.completion = 'aborted'; }],
    ['scenario-config', t => { t.study!.scenarioId = 'B'; }],
    ['round-config', t => { t.rounds[0]!.mode = 'learn'; }],
    ['designer', t => { t.rounds[0]!.designerExposed = true; }],
    ['coverage', t => { t.rounds[0]!.evaluation!.throughTick += 1; }],
    ['round-id', t => { t.records[0]!.command!.roundId = 9; }],
    ['feedback', t => { t.records[0]!.response!.reply = 'Smoke where?'; }],
    ['timestamp', t => { t.records[0]!.command!.t = 100; }],
    ['defender-config', t => { t.rounds[0]!.evaluation!.frames[0]!.defenders[0]!.region = 'truck'; }],
    ['input-policy', t => { t.records[0]!.input = 'voice'; }],
  ];
  for (const [code, mutate] of cases) {
    const files = participant(); mutate(files[0]!.trace as TraceFile);
    const a = analyzeStudy(files); assert.equal(a.humanPairs, 0, code); assert.ok(errors(a).some(i => i.code === code), code);
  }
});

test('practice/evaluation seed overlap and changed assignment are explicit errors', () => {
  const files = participant();
  const practice = files[1]!.trace as TraceFile;
  practice.rounds[0]!.seed = SCENARIOS.A.seed; practice.study!.seed = SCENARIOS.A.seed;
  (files[5]!.trace as TraceFile).study!.condition = 'C';
  const a = analyzeStudy(files);
  assert.ok(errors(a).some(i => i.code === 'seed-overlap')); assert.ok(errors(a).some(i => i.code === 'assignment')); assert.equal(a.humanPairs, 0);
});

test('no-data and fixture-only reports never invent a human result', () => {
  assert.match(studyReport(analyzeStudy([])), /Insufficient human data/);
  const fixtures = PHASES.map(p => input(fixture(studyConfig('FIX01', 'T', p, 'AB', 'fixture'))));
  const a = analyzeStudy(fixtures);
  assert.equal(errors(a).length, 0); assert.equal(a.humanPairs, 0); assert.equal(a.fixturePairs, 1);
  assert.equal(a.human.location[0]?.n, 0); assert.equal(a.fixture.location[0]?.n, 1);
  assert.match(studyReport(a), /Synthetic fixtures — excluded from human results/);
  assert.match(studyReport(a), /Insufficient human data/);
  const bad = analyzeStudy([{ path: 'broken.json', error: 'Invalid JSON' }]);
  assert.ok(errors(bad).some(i => i.code === 'unreadable'));
});
