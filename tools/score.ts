// npm run score -- sessions/*.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TraceFile } from '../web/src/trace/log.js';
import { METRICS, metricValues, scoreTrace } from '../web/src/trace/score.js';
import { parseSessionName, summarize, type SessionName } from '../web/src/trace/session.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run score -- sessions/*.json');
  process.exit(1);
}

const csvCell = (value: unknown) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
const rows: unknown[][] = [['scoring_version', 'file', 'participant', 'group', 'phase', 'round_id',
  'record_id', 'sim_seconds', 'assessed_at_seconds', 'transcript', 'category', 'brief', 'clear', 'unclear_clauses', 'unparsed_clauses', 'claims_json']];
const sessions: { name: SessionName; result: ReturnType<typeof scoreTrace>; dataKind: string }[] = [];
for (const path of files) {
  try {
    const trace: TraceFile = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(trace.records) || !Array.isArray(trace.rounds)) throw new Error('Expected a gameplay trace');
    if (trace.version !== 3) console.warn(path + ' — legacy trace. The historical 0–5 score uses a different rubric. Missing truth stays unscorable.');
    const result = scoreTrace(trace);
    const name: SessionName = trace.study ? { participant: trace.study.participantId,
      group: trace.study.condition === 'T' ? 'RelAI' : trace.study.condition === 'C' ? 'Plain' : 'Unknown', phase: trace.study.phase } : parseSessionName(path);
    sessions.push({ name, result, dataKind: trace.study?.dataKind ?? 'legacy-unverified' });
    for (const warning of result.warnings) console.warn(path + ' — ' + warning);
    for (const c of result.calls) rows.push([result.scoringVersion, basename(path), name.participant, name.group, name.phase,
      c.roundId, c.recordId, c.t, c.assessedAt, c.transcript, c.category, c.brief, c.clear, JSON.stringify(c.unclear), JSON.stringify(c.unparsed), JSON.stringify(c.claims)]);
    console.log(basename(path), '· communication v2 ·',
      METRICS.map(m => m + ' ' + result.rates[m].passed + '/' + result.rates[m].eligible).join(' · '));
    for (const c of result.calls) console.log(' ', c.t.toFixed(2), c.category, JSON.stringify(c.transcript),
      c.claims.map(v => v.region + ' ' + v.status).join(', '));
  } catch (error) { console.error('Skipped', path, String(error)); process.exitCode = 1; }
}
if (sessions.length) {
  const results = join(dirname(fileURLToPath(import.meta.url)), '../results');
  mkdirSync(results, { recursive: true });
  writeFileSync(join(results, 'calls-v2.csv'), rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n');
  console.log('Passed/eligible. A zero denominator means unavailable. Claims supply grounded location, count stated, accuracy of stated observable counts, and timely (≤3 s). Reports supply brief (≤8 words) and clear. Duplicate opportunities are excluded.');
  console.log('Paired pre/post by participant and metric (percent, change in percentage points)');
  console.log('For protocol validation and the human headline report, run npm run study -- <session directory>.');
  for (const dataKind of [...new Set(sessions.map(s => s.dataKind))]) {
    console.log('Dataset:', dataKind, dataKind === 'fixture' ? '(synthetic; excluded from human results)' : '');
    for (const metric of METRICS) {
      const paired = sessions.filter(s => s.dataKind === dataKind).flatMap(({ name, result }) => {
        // Pool eligible observations across files for the same participant and phase.
        return result.calls.flatMap(call => metricValues(call, metric).map(value => ({ ...name, score: Number(value) * 100 })));
      });
      for (const g of summarize(paired)) {
        if (g.n) console.log(g.group, metric, 'n=' + g.n, g.pre!.toFixed(1), g.post!.toFixed(1), g.change!.toFixed(1));
      }
    }
  }
}
