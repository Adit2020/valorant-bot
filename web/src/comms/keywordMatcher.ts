import { ActionSchema, type Action, type BrimResponse, type RegionId } from '../../../shared/schema.js';
import { CALLOUT_ALIASES } from '../map/bindA.js';

export const response = (reply: string, actions: Action[] = [], needs: BrimResponse['needs'] = null): BrimResponse =>
  ({ reply, actions, needs });
const normalize = (text: string) => text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const aliases = new Map<string, RegionId>();
for (const [id, words] of Object.entries(CALLOUT_ALIASES)) {
  for (const word of [id, ...words]) aliases.set(normalize(word), id as RegionId);
}
export function namedTargets(text: string) {
  const targets: string[] = [];
  // Consume whole aliases longest-first so "back truck" never licenses Back Site.
  const tokens = normalize(text).split(' ');
  for (let i = 0; i < tokens.length; i++) {
    for (const size of [2, 1]) {
      if (i + size > tokens.length) continue;
      const words = tokens.slice(i, i + size).join(' ');
      const id = aliases.get(words) ?? (words === 'alt' || words === 'alternate' ? 'alt' : undefined);
      if (id) { targets.push(id); i += size - 1; break; }
    }
  }
  return targets;
}

type Match = { kind: 'response'; value: BrimResponse } | { kind: 'your-call' } | { kind: 'unknown' };
const resolved = (value: BrimResponse): Match => ({ kind: 'response', value });
const missing = (verb: string) => resolved(response(verb.charAt(0).toUpperCase() + verb.slice(1) + ' where?', [], 'target'));
const verbs = /^(throw (?:a |the |your )?molly|fall back to|go|move|rotate|smoke|watch|hold|molly|plant)\b\s*/;
type TargetVerb = 'move' | 'hold' | 'smoke' | 'molly' | 'plant';

export function matchKeyword(text: string): Match {
  const words = normalize(text);
  if (/\b(b|bee (?:site|long|short)|hookah|bshort)\b/.test(words))
    return resolved(response("That's B. We're on A.", [], 'site'));
  if (/\b(ignore|instructions?|override|infinite|unlimited|pretend|invent|instead|or|unless|if|when|wherever|dont|not|never|except|without)\b/.test(words))
    return resolved(response('Give me one clear call.'));
  if (/\b(enemy|enemies|defenders?|jett|killjoy|omen|chamber|viper|they|them)\b/.test(words))
    return resolved(response('Which target?', [], 'target'));
  // Commas between calls are separators; a comma after a vocative or filler is not.
  // "RelAI" is often transcribed as relay, real AI or rely; the old name still works.
  const cleaned = text.toLowerCase().replace(/\b(?:brimstone|brim|relai|relay|real ai|rely|please|hey|okay|ok|uh|um)\b\s*,?\s*/g, ' ')
    .replace(/\b(?:can you|could you|would you)\s+/g, '').trim();
  if (normalize(cleaned) === 'your call') return { kind: 'your-call' };
  if (!cleaned || aliases.has(normalize(cleaned)) || /^(?:is|are|where|who|did|how many)\b/.test(normalize(cleaned)))
    return resolved(response('What do you want me to do?'));
  const parts = cleaned.replace(/[,;]+\s*(?:(?:and\s+)?then\b|and\b)?|\b(?:and\s+then|then|and)\b/g, '|')
    .split('|').map(normalize);
  const actions: Action[] = [];
  let previous: TargetVerb | undefined;
  for (const part of parts) {
    if (['wait', 'fallback', 'fall back', 'go'].includes(part)) {
      actions.push({ type: part === 'wait' ? 'wait' : part === 'go' ? 'go' : 'fallback' });
      previous = undefined;
      continue;
    }
    const verb = part.match(verbs);
    const raw = verb?.[1];
    let kind = previous;
    if (raw?.includes('molly')) kind = 'molly';
    else if (raw === 'watch') kind = 'hold';
    else if (raw && ['rotate','go','move','fall back to'].includes(raw)) kind = 'move';
    else if (raw) kind = raw as TargetVerb;
    if (!kind) {
      if (actions.length) return resolved(response('Repeat the full call.'));
      return { kind: 'unknown' };
    }
    const target = part.slice(verb?.[0].length ?? 0).replace(/^(?:(?:to|at|the|on) )+/, '');
    const region = aliases.get(target);
    if (kind === 'plant') {
      if (region === 'default') actions.push({ type: kind, target: region });
      else if (target === 'alt' || target === 'alternate') actions.push({ type: kind, target: 'alt' });
      else return missing(kind);
    } else if (region) actions.push(ActionSchema.parse({ type: kind, target: region }));
    else return missing(kind);
    previous = kind;
  }
  return resolved(response('Command accepted.', actions));
}
