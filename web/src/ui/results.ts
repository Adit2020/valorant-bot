import type { ConversationRecord, RoundTrace } from '../trace/log.js';
import { METRICS, scoreTrace, type Metric } from '../trace/score.js';

const labels: Record<Metric, string> = { location: 'Grounded location', countStated: 'Count stated', count: 'Enemy count accuracy', timely: 'Timeliness', brief: 'Brevity', clear: 'Clarity' };
export const formatRate = (rate: { passed: number; eligible: number }) => rate.eligible ? `${rate.passed}/${rate.eligible}` : 'N/A';
export const stamp = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;

/** Build only from a single round's records and events; goal and sighting IDs are round-local. */
export function resultEvidence(round: RoundTrace, records: ConversationRecord[]) {
  const relevant = records.filter(r => r.command?.roundId === round.roundId);
  const score = scoreTrace({ records: relevant, rounds: [round] });
  return { score, commands: relevant.map(record => ({ record,
    events: round.events.filter(e => e.goalId !== undefined && record.command!.goalIds.includes(e.goalId)) })) };
}

function node(tag: string, text: string, className?: string) {
  const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el;
}
function section(title: string) { const el = document.createElement('section'); el.append(node('h3', title)); return el; }
function detail(title: string) { const el = document.createElement('details'); el.append(node('summary', title)); return el; }

export function renderResults(root: HTMLElement, round: RoundTrace, records: ConversationRecord[], blinded: boolean) {
  root.replaceChildren();
  if (!round.result) { root.hidden = true; return; }
  root.hidden = false;
  if (blinded) {
    root.append(node('p', 'Evaluation round complete', 'results-eyebrow'), node('h2', 'Round finished'),
      node('p', 'Detailed results are withheld during this evaluation. Your trace remains available for analysis.'));
    return;
  }
  const result = round.result;
  root.append(node('p', 'ROUND RESULTS', 'results-eyebrow'), node('h2', result.outcome === 'win' ? 'Round won' : result.outcome === 'loss' ? 'Round lost' : 'Round finished'));
  const reason = { defender_wipe: 'All defenders eliminated', attacker_wipe: 'All attackers eliminated', timeout: `Time expired · spike ${result.spike}` }[result.reason];
  root.append(node('p', reason, 'results-reason'));
  const stats = document.createElement('div'); stats.className = 'results-stats';
  for (const [label, value] of [['Play', result.play?.replaceAll('_', ' ') ?? 'Drill'], ['Seed', String(round.seed)], ['Duration', stamp(result.duration)], ['Attackers remaining', String(result.attackers)], ['Defenders remaining', String(result.defenders)], ['Spike', result.spike], ['Utility remaining', `${result.smokes} smokes · ${result.mollies} molly`]]) {
    const item = document.createElement('div'); item.append(node('span', label!), node('strong', value!)); stats.append(item);
  }
  root.append(stats);
  const { score, commands } = resultEvidence(round, records);
  const feedback = section('Communication feedback');
  feedback.append(node('p', 'Enemy-information reports · supported observations', 'results-muted'));
  const metrics = document.createElement('div'); metrics.className = 'results-metrics';
  for (const metric of METRICS) { const rate = score.rates[metric]; metrics.append(node('div', `${labels[metric]}: ${formatRate(rate)}${rate.eligible ? ' eligible' : ''}`)); }
  feedback.append(metrics);
  for (const warning of score.warnings) feedback.append(node('p', warning, 'results-muted'));
  if (!score.calls.some(c => c.category === 'report')) feedback.append(node('p', 'No eligible enemy reports in this round.', 'results-muted'));
  for (const call of score.calls.filter(c => c.category === 'report')) {
    for (const claim of call.claims) {
      let message = claim.status === 'duplicate' ? 'This repeated an earlier report of the same sighting.' : claim.status === 'unavailable' ? 'Evidence is unavailable for this report.' : claim.location === false ? 'The reported location was not supported by a visible enemy.' : claim.countAccurate === false ? 'The location was supported, but the reported count did not match visible enemies.' : claim.timely === false ? 'The report came more than three seconds after the sighting.' : '';
      if (message) feedback.append(node('p', `${stamp(call.t)} · ${message}`));
    }
  }
  root.append(feedback);
  const timeline = section('Player calls');
  if (!commands.length) timeline.append(node('p', 'No player calls recorded in this round.', 'results-muted'));
  for (const {record, events} of commands) {
    const c = record.command!; const call = score.calls.find(s => s.recordId === record.id);
    const card = document.createElement('article'); card.className = 'result-call';
    card.append(node('h4', `${stamp(c.t)} · Player: “${record.transcript}”`));
    card.append(node('p', `Category: ${call?.category ?? 'unscored'} · Interpretation: ${c.path}${c.interpretation ? ` · ${c.interpretation.actions.length} action(s)` : ' · unavailable'}`));
    card.append(node('p', c.plain ? `Plain bot: no validation · ${c.goalIds.length ? 'goals queued' : (c.validator.reason ?? 'no goal queued')}` : `Validation: ${c.validator.ok ? 'Accepted' : 'Not accepted'}${c.validator.reason ? ` · ${c.validator.reason}` : ''}`));
    if (c.interpretation?.actions.length) card.append(node('p', `Interpreted actions: ${c.interpretation.actions.map(a => a.type + ('target' in a ? ` ${a.target}` : '')).join(', ')}`));
    if (c.interpretation?.needs) card.append(node('p', `Clarification requested: ${c.interpretation.needs}`));
    if (c.decision) card.append(node('p', `Decision: ${c.decision}`));
    if (record.error) card.append(node('p', `Conversation: ${record.error}`));
    for (const id of c.goalIds) {
      const goalEvents = events.filter(e => e.goalId === id);
      const item = document.createElement('div'); item.className = 'result-goal';
      item.append(node('p', `Goal #${id} · ${goalEvents.at(-1)?.goalStage ?? 'queued; no execution recorded'}`));
      for (const event of goalEvents) item.append(node('p', `${stamp(event.t)} · ${event.kind === 'did' ? 'Action' : 'Decision'}: ${event.detail}`, 'results-muted'));
      card.append(item);
    }
    timeline.append(card);
  }
  root.append(timeline);
  const trace = detail('RelAI decisions and callouts · saw / decided / said / did');
  trace.append(node('p', 'Speech is marked as spoken only when playback started. Expand a sighting to see its related events.', 'results-muted'));
  const list = document.createElement('ol'); list.className = 'results-trace';
  for (const event of round.events.filter(e => !e.sightingId || e.sighting)) {
    const row = document.createElement('li');
    if (event.sighting) {
      const group = detail(`${stamp(event.t)} · Saw: ${event.detail} · sighting ${event.sighting.id}`);
      for (const linked of round.events.filter(e => e.sightingId === event.sighting!.id && e !== event))
        group.append(node('p', `${stamp(linked.t)} · ${linked.calloutStage === 'started' ? 'Spoken' : linked.calloutStage ?? linked.kind}: ${linked.detail}`));
      row.append(group);
    } else row.append(node('span', `${stamp(event.t)} · ${event.kind}: ${event.detail}`));
    list.append(row);
  }
  trace.append(list); root.append(trace);
}
