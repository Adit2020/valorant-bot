// Score transfer-test traces: npx tsx tools/score.ts sessions/*.json
// Writes results/calls.csv and prints a Markdown summary table ready for the slide / Devpost.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TraceFile } from '../web/src/trace/log.js';
import { CHECKS, GROUNDED_WINDOW_S, MAX_WORDS, parseSessionName, scoreTrace, summarize, TIMELY_S } from '../web/src/trace/score.js';

const files = process.argv.slice(2).filter(f => f.endsWith('.json'));
if (!files.length) {
  console.error('Usage: npx tsx tools/score.ts sessions/*.json');
  process.exit(1);
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const fmt = (n: number | null) => n === null ? '–' : n.toFixed(1);
const signed = (n: number | null) => n === null ? '–' : (n >= 0 ? '+' : '') + n.toFixed(1);

const rows: (ReturnType<typeof parseSessionName> & { file: string; t: number; transcript: string; checks: boolean[]; score: number })[] = [];
const skipped: string[] = [];
for (const path of files) {
  let trace: TraceFile;
  try { trace = JSON.parse(readFileSync(path, 'utf8')) as TraceFile; }
  catch (error) { skipped.push(path + ' (' + (error instanceof Error ? error.message : 'unreadable') + ')'); continue; }
  if (!Array.isArray(trace.records) || !Array.isArray(trace.rounds)) { skipped.push(path + ' (not a gameplay trace)'); continue; }
  const name = parseSessionName(path);
  for (const call of scoreTrace(trace))
    rows.push({ ...name, file: basename(path), t: call.t, transcript: call.transcript, checks: CHECKS.map(c => call.checks[c]), score: call.score });
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'results'), { recursive: true });
const header = ['file', 'participant', 'group', 'phase', 't', 'transcript', 'c1', 'c2', 'c3', 'c4', 'c5', 'score'];
const csv = [header.join(','), ...rows.map(r => [r.file, r.participant, r.group, r.phase, r.t.toFixed(2), r.transcript,
  ...r.checks.map(c => c ? 1 : 0), r.score].map(csvCell).join(','))].join('\n') + '\n';
writeFileSync(join(root, 'results', 'calls.csv'), csv);

console.log(`Scored ${rows.length} calls from ${files.length - skipped.length} file(s) → results/calls.csv`);
for (const s of skipped) console.log('  skipped ' + s);
console.log(`Checks: c1 names a location · c2 ≤ ${MAX_WORDS} words · c3 clear first time · c4 grounded (sighting ≤ ${GROUNDED_WINDOW_S} s old) · c5 timely (≤ ${TIMELY_S} s)\n`);
console.log('| Group | n | Pre mean | Post mean | Change |');
console.log('|---|---|---|---|---|');
for (const g of summarize(rows)) console.log(`| ${g.group} | ${g.n} | ${fmt(g.pre)} | ${fmt(g.post)} | ${signed(g.change)} |`);

// Per-check pass rates by group and phase show *which* habits moved.
const phases = ['pre', 'post'] as const;
console.log('\n| Group | Phase | Calls | ' + CHECKS.join(' | ') + ' |');
console.log('|---|---|---|' + CHECKS.map(() => '---').join('|') + '|');
for (const group of ['RelAI', 'Plain', 'Unknown'] as const) for (const phase of phases) {
  const set = rows.filter(r => r.group === group && r.phase === phase);
  if (!set.length) continue;
  const pct = (i: number) => Math.round(100 * set.filter(r => r.checks[i]).length / set.length) + '%';
  console.log(`| ${group} | ${phase} | ${set.length} | ${CHECKS.map((_, i) => pct(i)).join(' | ')} |`);
}
