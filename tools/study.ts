// Local only: npm run study -- sessions/human [--out results/study]
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { analyzeStudy, studyReport, type StudyInput } from '../web/src/trace/studyAnalysis.js';
import { METRICS } from '../web/src/trace/score.js';

const args = process.argv.slice(2);
let output = 'results/study';
const paths: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('--out requires an output prefix, e.g. results/study');
    output = value;
  } else if (args[i]!.startsWith('--')) throw new Error('Unknown option ' + args[i]);
  else paths.push(args[i]!);
}
const inputs: StudyInput[] = [];
function read(path: string) {
  try {
    if (statSync(path).isDirectory()) {
      for (const name of readdirSync(path).sort()) if (name.endsWith('.json')) read(join(path, name));
    } else inputs.push({ path, trace: JSON.parse(readFileSync(path, 'utf8')) });
  } catch (error) { inputs.push({ path, error: String(error) }); }
}
paths.forEach(read);
const analysis = analyzeStudy(inputs);
const report = studyReport(analysis);
const cell = (v: unknown) => '"' + String(v ?? 'N/A').replace(/"/g, '""') + '"';
const csv: unknown[][] = [['participant', 'group', 'data_kind', 'valid_pair', 'metric', 'pre_passed', 'pre_eligible', 'post_passed', 'post_eligible', 'change_pp', 'pre_opportunities', 'post_opportunities', 'pre_unscorable', 'post_unscorable', 'scoring_version']];
for (const p of analysis.participants) for (const m of METRICS) csv.push([p.participantId, p.condition, p.dataKind, p.paired, m,
  p.pre?.score.rates[m].passed, p.pre?.score.rates[m].eligible, p.post?.score.rates[m].passed, p.post?.score.rates[m].eligible,
  p.change[m], p.pre?.opportunities, p.post?.opportunities, p.pre?.unavailableClaims, p.post?.unavailableClaims, analysis.scoringVersion]);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output + '.md', report);
writeFileSync(output + '.json', JSON.stringify(analysis, null, 2) + '\n');
writeFileSync(output + '.csv', csv.map(row => row.map(cell).join(',')).join('\n') + '\n');
console.log(report);
console.log(`Saved ${output}.{md,csv,json}`);
if (analysis.issues.some(i => i.level === 'error')) process.exitCode = 1;
