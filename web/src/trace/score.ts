// Communication scoring v2. Uses the finalized transcript and the public observation
// opportunity at PTT release or text submission. Bot replies, actions and playback never assign points.
import { classifyCommunication, type ReportClaim } from '../comms/report.js';
import { DT } from '../sim/loop.js';
import { EvaluationSchema, type Evaluation, type EvaluationFrame } from './evaluation.js';
import type { TraceFile } from './log.js';

export const MAX_WORDS = 8;
export const TIMELY_S = 3;
export const METRICS = ['location', 'countStated', 'count', 'timely', 'brief', 'clear'] as const;
export type Metric = typeof METRICS[number];
export type Rates = Record<Metric, { passed: number; eligible: number }>;
export interface ScoredClaim extends ReportClaim {
  status: 'observed' | 'unsupported' | 'duplicate' | 'unavailable';
  // Offline factual occupancy/identity, even when no player could observe it.
  factualLocation: boolean | null;
  actualCount: number | null;
  observableCount: number | null;
  location: boolean | null;
  countAccurate: boolean | null;
  firstTick: number | null;
  delaySeconds: number | null;
  timely: boolean | null;
}
export interface ScoredCall {
  recordId: number; roundId: number; t: number; assessedAt: number; transcript: string;
  category: 'report' | 'tactical' | 'unclassified';
  claims: ScoredClaim[];
  unclear: string[];
  unparsed: string[];
  brief: boolean | null;
  clear: boolean | null;
}

function publicIds(frame: EvaluationFrame, region: ReportClaim['region']) {
  return frame.defenders.filter(d => d.region === region && d.visible).map(d => d.id).sort();
}

function scoreClaim(claim: ReportClaim, evidence: Evaluation | undefined, tick: number, used: Set<string>): ScoredClaim {
  const result: ScoredClaim = { ...claim, status: 'unavailable', factualLocation: null, actualCount: null, observableCount: null,
    location: null, countAccurate: null, firstTick: null, delaySeconds: null, timely: null };
  if (!evidence || tick < 0 || tick > evidence.throughTick) return result;
  let index = evidence.frames.length - 1;
  while (index > 0 && evidence.frames[index]!.tick > tick) index--;
  const frame = evidence.frames[index]!;
  const ids = publicIds(frame, claim.region);
  const occupants = frame.defenders.filter(d => d.region === claim.region);
  result.actualCount = occupants.length;
  result.factualLocation = occupants.some(d => !claim.enemy || d.id === claim.enemy);
  result.observableCount = ids.length;
  if (!ids.length || (claim.enemy && !ids.includes(claim.enemy))) {
    result.status = 'unsupported';
    result.location = false;
    return result;
  }
  const group = ids.join(',');
  while (index > 0 && publicIds(evidence.frames[index - 1]!, claim.region).join(',') === group) index--;
  result.firstTick = evidence.frames[index]!.tick;
  const key = result.firstTick + '/' + claim.region;
  if (used.has(key)) { result.status = 'duplicate'; return result; }
  used.add(key);
  result.status = 'observed';
  result.location = true;
  result.countAccurate = claim.count === null || claim.ambiguousCount ? null : claim.count === ids.length;
  result.delaySeconds = Number(((tick - result.firstTick) * DT).toFixed(2));
  result.timely = result.delaySeconds <= TIMELY_S;
  return result;
}

// A null result has no denominator. Keep aggregation identical for individual traces and pooled CLI sessions.
export function metricValues(call: ScoredCall, metric: Metric): boolean[] {
  const values = metric === 'brief' || metric === 'clear' ? [call[metric]] :
    call.claims.map(c => metric === 'countStated' ? (c.status === 'observed' ? c.count !== null && !c.ambiguousCount : null) :
      metric === 'count' ? c.countAccurate : c[metric]);
  return values.filter((v): v is boolean => v !== null);
}

export function scoreTrace(trace: Pick<TraceFile, 'records' | 'rounds'>) {
  const rounds = new Map<number, { evidence?: Evaluation; used: Set<string> }>();
  const warnings: string[] = [];
  for (const r of trace.rounds) {
    const parsed = EvaluationSchema.safeParse(r.evaluation);
    rounds.set(r.roundId, { evidence: !r.designerExposed && parsed.success ? parsed.data : undefined, used: new Set() });
  }
  const calls: ScoredCall[] = [];
  const rates: Rates = {
    location: { passed: 0, eligible: 0 }, countStated: { passed: 0, eligible: 0 }, count: { passed: 0, eligible: 0 }, timely: { passed: 0, eligible: 0 },
    brief: { passed: 0, eligible: 0 }, clear: { passed: 0, eligible: 0 },
  };
  const records = trace.records.filter(r => (r.input === 'voice' || r.input === 'text') &&
    r.command && r.transcript.trim())
    .sort((a, b) => a.command!.roundId - b.command!.roundId || a.command!.t - b.command!.t || a.id - b.id);
  const unavailable = new Set<number>();
  for (const record of records) {
    const { roundId, t } = record.command!;
    const round = rounds.get(roundId);
    const info = classifyCommunication(record.transcript);
    const release = info.category === 'report' && record.input === 'voice' && record.speechRelease?.roundId === roundId
      ? record.speechRelease : undefined;
    if (record.command!.inPlay === false && !release) continue;
    const assessedAt = release ? release.tick * DT : t;
    const tick = Math.round(assessedAt / DT);
    const evidence = round?.evidence;
    const covered = evidence && Number.isFinite(assessedAt) && Math.abs(assessedAt - tick * DT) <= 1e-7 &&
      tick >= 0 && tick <= evidence.throughTick;
    if (!covered && info.category === 'report') unavailable.add(roundId);
    const call: ScoredCall = { recordId: record.id, roundId, t, assessedAt, transcript: record.transcript,
      category: info.category, claims: [], unclear: [], unparsed: [], brief: null, clear: null };
    calls.push(call);
    if (info.category !== 'report') continue;
    call.claims = info.claims.map(c => scoreClaim(c, covered ? evidence : undefined, tick, round?.used ?? new Set()));
    call.unclear = info.unclear;
    call.unparsed = info.unparsed;
    if (info.unclear.length || info.unparsed.length || !call.claims.length || call.claims.some(c => c.status !== 'duplicate')) {
      call.brief = record.transcript.trim().split(/\s+/u).length <= MAX_WORDS;
      call.clear = info.unparsed.length ? null : call.claims.length > 0 && !info.unclear.length;
    }
    for (const metric of METRICS) {
      const values = metricValues(call, metric);
      rates[metric].eligible += values.length;
      rates[metric].passed += values.filter(Boolean).length;
    }
  }
  for (const id of unavailable) warnings.push('Round ' + id + ' lacks evaluation coverage at the assessed time. Truth metrics unavailable.');
  return { scoringVersion: 2 as const, calls, rates, warnings };
}
