import type { RegionId } from '../../../shared/schema.js';
import { normalize, targetMentions } from './keywordMatcher.js';

export interface ReportClaim {
  region: RegionId;
  count: number | null;
  enemy: string | null;
  ambiguousCount?: boolean;
}
export type Communication =
  | { category: 'report'; claims: ReportClaim[]; unclear: string[]; unparsed: string[] }
  | { category: 'tactical' | 'unclassified' };

const counts = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const enemies: Record<string, string> = { jett: 'jett', killjoy: 'kj', kj: 'kj', chamber: 'chamber', viper: 'viper', omen: 'omen' };
const tactical = /\b(smoke|smokes|molly|move|go|hold|watch|rotate|plant|fallback|fall back|wait|push|block|cover|your call)\b/;
const reportCue = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|zero|clear|enem(?:y|ies)|defenders?|jett|killjoy|kj|omen|viper|chamber|spotted|saw)\b/;

// Conservative affirmative report grammar. Unknown modifiers, negation, questions and
// ambiguous scopes remain available for review, never silently converted to positive claims.
export function classifyCommunication(text: string): Communication {
  const words = normalize(text);
  if (tactical.test(words)) return { category: 'tactical' };
  if (/^(where|who|how many|is|are|did)\b/.test(words) || !reportCue.test(words)) return { category: 'unclassified' };
  const claims: ReportClaim[] = [];
  const unclear: string[] = [];
  const unparsed: string[] = [];
  const clauses = text.trim().replace(/[.!]+$/, '').split(/\s*[,;]\s*(?:and\s+)?|\s+and\s+/i);
  let previous: ReportClaim | undefined;
  for (const clause of clauses) {
    const tokens = normalize(clause).split(' ');
    const locations = targetMentions(clause);
    const loc = locations[0];
    if (!loc || loc.id === 'alt' || locations.length !== 1 || clause.includes('?')) {
      unclear.push(clause);
      previous = undefined;
      continue;
    }
    const modifiers = [...tokens.slice(0, loc.start), ...tokens.slice(loc.end)];
    const numbers: number[] = [];
    const names: string[] = [];
    let unsupported = false;
    for (const token of modifiers) {
      if (Object.hasOwn(enemies, token)) names.push(enemies[token]!);
      else if (counts.includes(token)) numbers.push(counts.indexOf(token));
      else if (/^\d+$/.test(token)) numbers.push(Number(token));
      else if (!/^(i|see|saw|spotted|enemy|enemies|defender|defenders|in|at|on|the)$/.test(token)) unsupported = true;
    }
    // Positive sightings cannot establish that an entire region is clear.
    if (unsupported || numbers[0] === 0) {
      unparsed.push(clause);
      previous = undefined;
    } else if (numbers.length > 1 || names.length > 1 || (!modifiers.length && !previous)) {
      unclear.push(clause);
      previous = undefined;
    } else {
      if (!modifiers.length && previous && previous.count !== null) {
        previous.ambiguousCount = true;
        unclear.push(clause);
      }
      previous = { region: loc.id, count: numbers[0] ?? null, enemy: names[0] ?? null };
      claims.push(previous);
    }
  }
  // Conflicting counts for aliases of the same region need clarification before either earns credit.
  for (const claim of claims) {
    if (claim.count !== null && claims.some(other => other.region === claim.region &&
        other.count !== null && other.count !== claim.count)) {
      claim.ambiguousCount = true;
      if (!unclear.includes(claim.region)) unclear.push(claim.region);
    }
  }
  return { category: 'report', claims, unclear, unparsed };
}
