// Study bookkeeping and validation only. All communication judgments come from scoreTrace v2.
import { z } from 'zod';
import { PlayIdSchema } from '../../../shared/schema.js';
import { DT } from '../sim/loop.js';
import { EvaluationSchema, type Evaluation } from './evaluation.js';
import type { TraceFile } from './log.js';
import { METRICS, scoreTrace, type Metric, type Rates } from './score.js';
import { parseSessionName, summarize } from './session.js';
import { PHASES, PROTOCOL, SCENARIOS, SCORING_VERSION, studyConfig } from './study.js';

const natural = z.number().int().nonnegative();
const finite = z.number().finite();
const response = z.object({ reply: z.string(), needs: z.enum(['target', 'site', 'count']).nullable(), actions: z.array(z.unknown()) }).passthrough();
const record = z.object({
  id: natural, t: finite.nonnegative(), input: z.enum(['voice', 'text', 'round', 'chip', 'callout']), transcript: z.string(),
  status: z.enum(['pending', 'completed', 'failed', 'interrupted']), response: response.optional(),
  command: z.object({ roundId: natural, t: finite.nonnegative(), inPlay: z.boolean(), path: z.enum(['keyword', 'llm']),
    goalIds: z.array(natural), validator: z.object({ ok: z.boolean(), reason: z.string().optional() }), plain: z.boolean().optional() }).passthrough().optional(),
  speechRelease: z.object({ roundId: natural, tick: natural }).optional(),
  buyCall: z.object({ roundId: natural }).passthrough().optional(),
  callout: z.object({ roundId: natural, sightingId: z.string() }).optional(),
}).passthrough();
const schema = z.object({
  version: z.literal(3), scope: z.literal('gameplay'), bot: z.enum(['plain', 'relai']),
  study: z.object({ protocol: z.literal(PROTOCOL), scoringVersion: z.literal(SCORING_VERSION),
    participantId: z.string(), condition: z.enum(['T', 'C']), dataKind: z.enum(['human', 'fixture']),
    phase: z.enum(PHASES), order: z.enum(['AB', 'BA']), orderAssignment: z.enum(['default', 'explicit', 'balanced']),
    scenarioId: z.string(), seed: natural.max(0xffffffff), play: PlayIdSchema, mode: z.enum(['learn', 'match']),
    bot: z.enum(['plain', 'relai']), automaticCallouts: z.literal('standard-perception'), inputPolicy: z.literal('local-text'),
    sessionId: z.string().uuid(), startedAt: z.iso.datetime(), exportedAt: z.iso.datetime(),
    completion: z.enum(['complete', 'incomplete', 'aborted']),
  }),
  rounds: z.array(z.object({ roundId: natural, seed: natural, end: z.enum(['current', 'restart']),
    play: PlayIdSchema.nullable(), mode: z.enum(['learn', 'match']), completion: z.enum(['complete', 'incomplete', 'aborted']),
    designerExposed: z.boolean(), events: z.array(z.object({ t: finite.nonnegative(), kind: z.enum(['saw', 'decided', 'said', 'did']), detail: z.string() }).passthrough()),
    evaluation: EvaluationSchema.optional(),
    result: z.object({ outcome: z.enum(['win', 'loss']), reason: z.enum(['defender_wipe', 'attacker_wipe', 'timeout']), play: PlayIdSchema,
      duration: finite.nonnegative(), attackers: natural.max(5), defenders: natural.max(5), spike: z.enum(['carried', 'dropped', 'planted']), smokes: natural.max(3), mollies: natural.max(1) }).optional(),
  })).length(1), records: z.array(record),
});
export interface StudyInput { path: string; trace?: unknown; error?: string }
export interface StudyIssue { level: 'error' | 'warning'; code: string; file: string; participant: string | null; message: string }
export interface ScoredSession {
  path: string; trace: TraceFile & { study: NonNullable<TraceFile['study']> };
  score: ReturnType<typeof scoreTrace>; opportunities: number; unavailableClaims: number;
}
export interface ParticipantComparison {
  participantId: string; condition: string; dataKind: string; valid: boolean; paired: boolean;
  pre: ScoredSession | null; post: ScoredSession | null; practiceRounds: number;
  change: Record<Metric, number | null>;
}
export const percentage = (rate: Rates[Metric] | undefined) => rate?.eligible ? rate.passed / rate.eligible * 100 : null;

/** Count distinct publicly visible region/member episodes, including episodes nobody reports. */
export function reportingOpportunities(evidence: Evaluation): number {
  let previous = new Map<string, string>(), count = 0;
  for (const frame of evidence.frames) {
    const groups = new Map<string, string[]>();
    for (const d of frame.defenders) if (d.visible && d.region) groups.set(d.region, [...(groups.get(d.region) ?? []), d.id]);
    const current = new Map([...groups].map(([region, ids]) => [region, ids.sort().join(',')]));
    for (const [region, ids] of current) if (previous.get(region) !== ids) count++;
    previous = current;
  }
  return count;
}

export function analyzeStudy(inputs: StudyInput[]) {
  const issues: StudyIssue[] = [];
  const candidates: ScoredSession[] = [];
  const known = new Map<string, { condition: string; dataKind: string }>();
  const phases = new Map<string, string[]>();
  const add = (file: string, participant: string | null, code: string, message: string, level: StudyIssue['level'] = 'error') =>
    issues.push({ level, code, file, participant, message });
  for (const input of inputs) {
    const raw = input.trace as { study?: { participantId?: unknown; condition?: unknown; phase?: unknown; dataKind?: unknown } } | undefined;
    const participant = typeof raw?.study?.participantId === 'string' ? raw.study.participantId : null;
    if (participant) {
      known.set(participant, { condition: String(raw?.study?.condition ?? '?'), dataKind: String(raw?.study?.dataKind ?? '?') });
      const key = participant + '/' + raw?.study?.phase;
      phases.set(key, [...(phases.get(key) ?? []), input.path]);
    }
    if (input.error) { add(input.path, participant, 'unreadable', input.error + ' Restore the original JSON download.'); continue; }
    const parsed = schema.safeParse(input.trace);
    if (!parsed.success) {
      add(input.path, participant, 'invalid-trace', parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; ') + '. Use a fresh Step 9a export (trace v3, scoring v2); do not repair scores by hand.');
      continue;
    }
    const trace = input.trace as ScoredSession['trace'];
    const s = trace.study, r = trace.rounds[0]!;
    let expected;
    try { expected = studyConfig(s.participantId, s.condition, s.phase, s.order, s.dataKind, s.orderAssignment); }
    catch (error) { add(input.path, participant, 'participant-config', String(error)); continue; }
    if (s.orderAssignment === 'default' && s.order !== 'AB' || s.orderAssignment === 'balanced' && s.order !== (Number(s.participantId.replace(/^\D+/, '')) % 2 ? 'AB' : 'BA'))
      add(input.path, participant, 'order', 'Scenario order disagrees with its assignment rule. Restore the original URL/export.');
    for (const key of ['scenarioId', 'seed', 'play', 'mode', 'bot'] as const) if (s[key] !== expected[key])
      add(input.path, participant, 'scenario-config', `${key}: expected ${expected[key]}, found ${s[key]}. Use the protocol URL for ${s.phase}.`);
    if (r.seed !== s.seed || r.play !== s.play || r.mode !== s.mode || trace.bot !== s.bot || r.result && r.result.play !== s.play)
      add(input.path, participant, 'round-config', 'Round seed, selected play, mode or bot differs from study metadata. Recollect with the correct URL.');
    const named = parseSessionName(input.path);
    const expectedGroup = s.condition === 'T' ? 'RelAI' : 'Plain';
    if (named.participant !== s.participantId || named.group !== expectedGroup || named.phase !== s.phase)
      add(input.path, participant, 'filename', `Filename must begin ${s.participantId}-${s.condition}-${s.phase} and match embedded metadata. Restore its downloaded filename.`);
    if (s.completion !== 'complete' || r.completion !== 'complete' || !r.result || r.end === 'restart')
      add(input.path, participant, 'incomplete', 'Round is incomplete/aborted. Supply its final completed download; retain this file separately for audit.');
    if (r.designerExposed) add(input.path, participant, 'designer', 'Designer view was exposed. Exclude this participant and recollect with a new ID.');
    if (!r.evaluation) add(input.path, participant, 'missing-evidence', 'Ground-truth frames are missing. Finish the round before downloading.');
    else if (r.result && Math.abs(r.evaluation.throughTick * DT - r.result.duration) > 1e-7)
      add(input.path, participant, 'coverage', 'Ground-truth coverage does not reach the terminal duration. Supply the completed original trace.');
    if (r.evaluation && (s.phase === 'pre' || s.phase === 'post')) {
      // Audit the actual held-out starting roster as well as its claimed seed/play.
      const expectedRoster = { jett: 'heaven', kj: 'uhall', chamber: 'back_site', viper: 'truck', omen: s.scenarioId === 'A' ? 'cubby' : 'default' };
      const initial = r.evaluation.frames[0]!.defenders;
      if (initial.length !== 5 || initial.some(d => d.visible || d.region !== expectedRoster[d.id as keyof typeof expectedRoster]))
        add(input.path, participant, 'defender-config', 'Initial held-out defenders differ from the protocol lineup, or enemies are visible at tick zero. Restore the documented seed/play without lab overrides.');
    }
    if (Date.parse(s.exportedAt) < Date.parse(s.startedAt)) add(input.path, participant, 'wall-clock', 'Export precedes the session start. Check the computer clock and original file.');
    const ids = new Set<number>();
    for (const rec of trace.records) {
      if (ids.has(rec.id)) add(input.path, participant, 'duplicate-record', `Record ID ${rec.id} occurs twice.`);
      ids.add(rec.id);
      if (rec.input === 'voice' || rec.source === 'openai' || rec.audio === 'hosted-stream' || rec.audio === 'hosted-buffered')
        add(input.path, participant, 'input-policy', `Record ${rec.id} violates the local-text study policy. Do not combine voice/hosted sessions with this protocol.`);
      for (const link of [rec.command, rec.speechRelease, rec.buyCall, rec.callout]) if (link && link.roundId !== r.roundId)
        add(input.path, participant, 'round-id', `Record ${rec.id} refers to another round. Export one study round per file.`);
      if (rec.command && (rec.command.plain === true) !== (s.bot === 'plain'))
        add(input.path, participant, 'bot-behavior', `Record ${rec.id} uses the wrong bot for this phase. Recollect using the protocol URL.`);
      if ((s.phase === 'pre' || s.phase === 'post') && rec.command && rec.response && (rec.response.reply !== 'Copy.' || rec.response.needs !== null))
        add(input.path, participant, 'feedback', `Evaluation record ${rec.id} contains nonstandard feedback. Recollect with evaluation feedback suppressed.`);
      if (rec.command?.inPlay && (rec.command.t > (r.result?.duration ?? Infinity) || Math.abs(rec.command.t / DT - Math.round(rec.command.t / DT)) > 1e-6) ||
          rec.speechRelease && rec.speechRelease.tick > (r.evaluation?.throughTick ?? Infinity))
        add(input.path, participant, 'timestamp', `Record ${rec.id} is outside simulation coverage or off tick boundaries.`);
    }
    const score = scoreTrace(trace);
    const unavailableClaims = score.calls.flatMap(c => c.claims).filter(c => c.status === 'unavailable').length;
    if (unavailableClaims) add(input.path, participant, 'unscorable', `${unavailableClaims} claims lack truth evidence. Check simulation timestamps and frames.`);
    for (const metric of METRICS) if (!score.rates[metric].eligible)
      add(input.path, participant, 'zero-denominator', `${s.phase} ${metric}: N/A (0 eligible); no metric pair can be computed for it.`, 'warning');
    if (trace.records.some(rec => rec.status === 'pending')) add(input.path, participant, 'pending-turn', 'A conversation was pending at export. Stop/wait for it, then download again.', 'warning');
    candidates.push({ path: input.path, trace, score, opportunities: r.evaluation ? reportingOpportunities(r.evaluation) : 0, unavailableClaims });
  }
  for (const [key, files] of phases) if (files.length > 1) add(files.join(', '), key.split('/')[0]!, 'duplicate-phase', `${key} has ${files.length} files. Move retries/duplicate downloads outside the input directory and explicitly choose one original final trace.`);
  const participants: ParticipantComparison[] = [];
  for (const [participantId, identity] of known) {
    const sessions = candidates.filter(c => c.trace.study.participantId === participantId);
    const first = sessions[0]?.trace.study;
    if (first && sessions.some(c => ['condition', 'order', 'dataKind', 'orderAssignment'].some(key => c.trace.study[key as keyof typeof first] !== first[key as keyof typeof first])))
      add('', participantId, 'assignment', 'Group, data kind, or order assignment changes across phases. Restore the original assignment; do not combine participants.');
    const pre = sessions.find(c => c.trace.study.phase === 'pre') ?? null;
    const post = sessions.find(c => c.trace.study.phase === 'post') ?? null;
    if (!pre) add('', participantId, 'missing-pre', `Missing valid pre-test for ${participantId}. Add its original file.`);
    if (!post) add('', participantId, 'missing-post', `Missing valid post-test for ${participantId}. Add its original file.`);
    const practice = sessions.filter(c => c.trace.study.phase.startsWith('prac'));
    for (const phase of PHASES.filter(p => p.startsWith('prac'))) if (!practice.some(c => c.trace.study.phase === phase))
      add('', participantId, 'missing-practice', `Missing ${phase}. Supply all four practice exports for a complete protocol.`);
    const evalSeeds = new Set(sessions.filter(c => ['pre', 'post'].includes(c.trace.study.phase)).map(c => c.trace.rounds[0]!.seed));
    if (practice.some(c => evalSeeds.has(c.trace.rounds[0]!.seed) || Object.values(SCENARIOS).some(s => s.seed === c.trace.rounds[0]!.seed)))
      add('', participantId, 'seed-overlap', 'Practice and evaluation seeds overlap. Exclude this participant and use the documented held-out seeds.');
    const valid = !issues.some(i => i.participant === participantId && i.level === 'error');
    const change = Object.fromEntries(METRICS.map(m => {
      const a = percentage(pre?.score.rates[m]), b = percentage(post?.score.rates[m]);
      return [m, valid && a !== null && b !== null ? b - a : null];
    })) as ParticipantComparison['change'];
    participants.push({ participantId, ...identity, pre, post, practiceRounds: practice.length, valid, paired: valid && !!pre && !!post, change });
  }
  const aggregates = (dataKind: string) => Object.fromEntries(METRICS.map(metric => [metric, summarize(participants.filter(p => p.dataKind === dataKind && p.paired).flatMap(p => {
    const pre = percentage(p.pre!.score.rates[metric]), post = percentage(p.post!.score.rates[metric]);
    if (pre === null || post === null) return [];
    const group = p.condition === 'T' ? 'RelAI' as const : 'Plain' as const;
    return [{ participant: p.participantId, group, phase: 'pre', score: pre }, { participant: p.participantId, group, phase: 'post', score: post }];
  }))])) as Record<Metric, ReturnType<typeof summarize>>;
  return { protocol: PROTOCOL, scoringVersion: SCORING_VERSION, participants, issues,
    human: aggregates('human'), fixture: aggregates('fixture'),
    humanPairs: participants.filter(p => p.dataKind === 'human' && p.paired).length,
    fixturePairs: participants.filter(p => p.dataKind === 'fixture' && p.paired).length };
}

const pct = (n: number | null) => n === null ? 'N/A' : n.toFixed(1);
export const metricLabels: Record<Metric, string> = { location: 'Grounded location', countStated: 'Count stated', count: 'Count accuracy', timely: 'Timeliness', brief: 'Brevity', clear: 'Clarity' };
export function studyReport(analysis: ReturnType<typeof analyzeStudy>): string {
  const scorableHumans = METRICS.some(m => analysis.human[m].some(g => g.n > 0));
  const out = ['# RelAI Step 9a · paired transfer comparison', '', `Protocol ${analysis.protocol} · scoring v${analysis.scoringVersion}`, '',
    `Validated complete human protocol pairs: ${analysis.humanPairs}.`,
    !analysis.humanPairs ? '**Insufficient human data. No human transfer conclusion is available.**' : scorableHumans ? 'Exploratory human data; a change does not establish that RelAI caused it.' : '**Insufficient scorable human data: complete sessions contain no eligible metric pairs.**', '',
    'Method: scoreTrace v2 supplies passed/eligible for each metric. Compute each participant’s pre/post percentage only when both denominators are positive. Give each valid paired participant equal weight within their assigned group; group change is the mean of participant changes in percentage points. Do not pool participants with different denominators. Metric n can differ. N/A means unavailable, never zero. All four practice rounds are required for a complete protocol.', '',
    'The opportunity count is the number of public region/member visibility episodes, including unreported ones; metric denominators count eligible offered reports/claims. Silence yields N/A report-quality rates. Automatic teammate callouts remain enabled under the same perception policy in both evaluations.', '',
    'Default order is A pre / B post. A and B differ in defender configuration and opportunity count; scenario difficulty, order, command-driven observations, small samples, and speech/typing familiarity can confound changes. Optional balanced order does not eliminate these limitations.', ''];
  for (const kind of ['human', 'fixture'] as const) {
    const people = analysis.participants.filter(p => p.dataKind === kind);
    if (kind === 'fixture' && !people.length) continue;
    out.push(kind === 'human' ? '## Human participants' : '## Synthetic fixtures — excluded from human results', '',
      '| Participant | Group | Status | Practice files | Pre opportunities | Post opportunities | Unscorable claims pre/post |', '|---|---|---|---|---|---|---|');
    for (const p of people) out.push(`| ${p.participantId} | ${p.condition} | ${p.paired ? 'complete pair' : 'excluded; see issues'} | ${p.practiceRounds}/4 | ${p.pre?.opportunities ?? 'N/A'} | ${p.post?.opportunities ?? 'N/A'} | ${p.pre?.unavailableClaims ?? 'N/A'}/${p.post?.unavailableClaims ?? 'N/A'} |`);
    if (!people.length) out.push('| — | — | No human sessions | — | — | — | — |');
    out.push('', '| Participant | Group | Metric | Pre passed/eligible (%) | Post passed/eligible (%) | Change (pp) |', '|---|---|---|---|---|---|');
    const rate = (r: Rates[Metric] | undefined) => r ? `${r.passed}/${r.eligible} (${pct(percentage(r))})` : 'N/A';
    for (const p of people) for (const m of METRICS) out.push(`| ${p.participantId} | ${p.condition} | ${metricLabels[m]} | ${rate(p.pre?.score.rates[m])} | ${rate(p.post?.score.rates[m])} | ${pct(p.change[m])} |`);
    out.push('', '| Group | Metric | Paired n | Mean pre (%) | Mean post (%) | Mean change (pp) |', '|---|---|---|---|---|---|');
    for (const m of METRICS) for (const g of analysis[kind][m]) out.push(`| ${g.group} | ${metricLabels[m]} | ${g.n} | ${pct(g.pre)} | ${pct(g.post)} | ${pct(g.change)} |`);
    out.push('');
  }
  out.push('## Validation', '');
  if (!analysis.issues.length) out.push('No file validation issues.');
  for (const i of analysis.issues) out.push(`- ${i.level.toUpperCase()} [${i.code}] ${i.participant ?? 'unidentified'} ${i.file}: ${i.message}`);
  return out.join('\n') + '\n';
}
