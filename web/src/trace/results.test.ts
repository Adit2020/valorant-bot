import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRate, resultEvidence, renderResults } from '../ui/results.js';
import type { ConversationRecord, RoundTrace } from './log.js';

const record = (roundId: number, id: number, transcript = 'Smoke Heaven'): ConversationRecord => ({ id, t: 0, input: 'text', transcript, source: 'keyword', audio: null, status: 'completed', latencyMs: { stt: null, think: null, firstAudio: null }, notices: [], command: { roundId, t: 1, path: 'keyword', goalIds: [1], validator: { ok: true }, inPlay: true } });
const round: RoundTrace = { roundId: 1, seed: 2026, end: 'current', events: [
  { t: 2, kind: 'decided', detail: 'started', goalId: 1, goalStage: 'started' },
  { t: 3, kind: 'did', detail: 'deployed', goalId: 1, goalStage: 'completed' },
], result: { outcome: 'win', reason: 'defender_wipe', play: 'fast_plant', duration: 3, attackers: 3, defenders: 0, spike: 'carried', smokes: 2, mollies: 1 } };

test('results associate only same-round goal events and use v2 categories and denominators', () => {
  const result = resultEvidence(round, [record(1, 1), record(2, 2)]);
  assert.equal(result.commands.length, 1);
  assert.deepEqual(result.commands[0]!.events.map(e => e.goalStage), ['started', 'completed']);
  assert.equal(result.score.scoringVersion, 2);
  assert.equal(result.score.calls[0]!.category, 'tactical');
  assert.equal(formatRate(result.score.rates.location), 'N/A');
  assert.equal(formatRate({ passed: 1, eligible: 2 }), '1/2');
});

class ElementStub {
  children: ElementStub[] = []; textContent = ''; className = ''; hidden = false;
  append(...children: ElementStub[]) { this.children.push(...children); }
  replaceChildren(...children: ElementStub[]) { this.children = children; }
  get text(): string { return this.textContent + this.children.map(c => c.text).join(' '); }
}
test('results stay hidden until terminal and blinded results withhold detail', () => {
  const old = globalThis.document;
  Object.assign(globalThis, { document: { createElement: () => new ElementStub() } });
  try {
    const root = new ElementStub();
    renderResults(root as unknown as HTMLElement, { ...round, result: undefined }, [], false);
    assert.equal(root.hidden, true);
    renderResults(root as unknown as HTMLElement, round, [record(1, 1)], true);
    assert.equal(root.hidden, false);
    assert.match(root.text, /withheld/);
    assert.doesNotMatch(root.text, /Smoke Heaven|defenders|Grounded location/);
    renderResults(root as unknown as HTMLElement, round, [record(1, 1)], false);
    assert.match(root.text, /Round won/);
    assert.match(root.text, /Goal #1/);
    assert.match(root.text, /deployed/);
  } finally { Object.assign(globalThis, { document: old }); }
});
