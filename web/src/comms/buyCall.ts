import { BuyCallSchema, type PlayId } from '../../../shared/schema.js';
import { plays } from '../plays/index.js';
import type { ReplyResult } from './brimClient.js';

// These calls contain no choice. Resolve them locally even if a hosted model is available.
const vague = /^(?:(?:lets |let us )?do something|push that way|go with the plan)$/;

const keywords: [PlayId, RegExp][] = [
  ['fast_plant', /\b(?:fast|quick) plant\b|\bplant (?:fast|quickly)\b/],
  ['fast_rush', /\brush\b/],
  ['slow_push', /^slow$|\bslow push\b|\b(?:take it|play|go) slow\b/],
];

async function requestClassification(transcript: string, signal: AbortSignal) {
  const response = await fetch('/api/buy-call', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }), signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
  });
  if (!response.ok) throw new Error('Play classification unavailable');
  return response.json() as Promise<unknown>;
}

export function line(reply: string, source: ReplyResult['source']): ReplyResult {
  return { source, response: { reply, actions: [], needs: null } };
}

export async function buyReply(transcript: string, signal: AbortSignal, select: (id: PlayId) => boolean,
  classify = requestClassification): Promise<ReplyResult> {
  const words = transcript.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const matches = keywords.filter(([, pattern]) => pattern.test(words));
  const clarify = line('Which play? Fast plant, fast rush, or slow push?', 'local');
  if (vague.test(words) || matches.length > 1 || /\b(no|not|dont|never|instead|or|maybe|avoid)\b/.test(words) ||
      transcript.trim().endsWith('?')) return clarify;
  let play = matches[0]?.[0];
  if (!play) {
    try { play = BuyCallSchema.parse(await classify(transcript, signal)).play ?? undefined; }
    catch { signal.throwIfAborted(); return clarify; }
  }
  signal.throwIfAborted();
  if (!play) return clarify;
  if (!select(play)) throw new DOMException('Buy phase closed.', 'AbortError');
  return line(plays[play].confirmation, matches.length ? 'keyword' : 'openai');
}
