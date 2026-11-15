// Historical five-check rubric only. Kept for reproducing previously published 0–5 scores.
import type { BrimEvent, Sighting } from '../../../shared/schema.js';
import { matchKeyword, namedTargets } from '../comms/keywordMatcher.js';
import { DT } from '../sim/loop.js';
import type { ConversationRecord, RoundTrace, TraceFile } from './log.js';

/** Check 2: a call this long or shorter counts as short (Tang 2012: most CS callouts are ≤ 8 words). */
export const MAX_WORDS = 8;
/** Check 4: a sighting older than this is stale info, so it can't ground a call. */
export const GROUNDED_WINDOW_S = 10;
/** Check 5: the call came this soon after the matching sighting. */
export const TIMELY_S = 3;

export const CHECKS = ['named', 'short', 'clear', 'grounded', 'timely'] as const;
export type CheckName = (typeof CHECKS)[number];
export interface CallScore {
  checks: Record<CheckName, boolean>;
  /** 0–5: one point per passed check. */
  score: number;
  /** The sighting that grounded the call (most recent match), if any. */
  sightingId?: string;
  /** Seconds from that sighting to the call. */
  delay?: number;
}

export const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
export const sightingsOf = (events: readonly BrimEvent[]): Sighting[] =>
  events.flatMap(e => e.kind === 'saw' && e.sighting ? [e.sighting] : []);

/** Score one call. `t` is round (sim) seconds; sightings come from the same round. */
export function scoreCall(transcript: string, t: number, sightings: readonly Sighting[]): CallScore {
  const named = namedTargets(transcript);
  const match = matchKeyword(transcript);
  // Most recent sighting of a named region at or before the call, inside the grounding window.
  const grounding = sightings
    .filter(s => named.includes(s.region) && s.tick * DT <= t + 1e-9 && t - s.tick * DT <= GROUNDED_WINDOW_S + 1e-9)
    .sort((a, b) => b.tick - a.tick)[0];
  const delay = grounding ? Math.max(0, t - grounding.tick * DT) : undefined;
  const checks: Record<CheckName, boolean> = {
    named: named.length > 0,
    short: wordCount(transcript) > 0 && wordCount(transcript) <= MAX_WORDS,
    clear: match.kind === 'response' && match.value.actions.length > 0 && match.value.needs === null,
    grounded: !!grounding,
    timely: delay !== undefined && delay <= TIMELY_S + 1e-9,
  };
  return { checks, score: CHECKS.filter(c => checks[c]).length,
    ...(grounding ? { sightingId: grounding.id, delay: Number(delay!.toFixed(2)) } : {}) };
}

export interface ScoredCall extends CallScore { recordId: number; roundId: number; t: number; transcript: string }

/** A player call is a record that reached the live command path with a transcript. */
export function playerCalls(records: readonly ConversationRecord[]) {
  return records.filter(r => r.command && r.transcript.trim() && r.input !== 'callout' && r.input !== 'round');
}

export function scoreTrace(file: Pick<TraceFile, 'records' | 'rounds'>): ScoredCall[] {
  const byRound = new Map<number, Sighting[]>(file.rounds.map((r: RoundTrace) => [r.roundId, sightingsOf(r.events)]));
  return playerCalls(file.records).map(r => {
    const { roundId, t } = r.command!;
    return { recordId: r.id, roundId, t, transcript: r.transcript, ...scoreCall(r.transcript, t, byRound.get(roundId) ?? []) };
  });
}
