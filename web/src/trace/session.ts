// ---- Session bookkeeping (transfer test) ----

export type Group = 'RelAI' | 'Plain' | 'Unknown';
export interface SessionName { participant: string; group: Group; phase: string }

/** `P03-T-pre.json`, `P03-C-prac2.json`, `P03-T-post.json` → participant, group, phase. */
export function parseSessionName(fileName: string): SessionName {
  const base = fileName.split(/[\\/]/).at(-1)!.replace(/\.json$/i, '');
  const m = /^((?:P|FIX)\d+)-([TC])-(pre|post|prac\d*)(?:--[a-z0-9-]+(?: \(\d+\))?)?$/i.exec(base);
  if (!m) return { participant: base, group: 'Unknown', phase: 'unknown' };
  return { participant: m[1]!.toUpperCase(), group: m[2]!.toUpperCase() === 'T' ? 'RelAI' : 'Plain', phase: m[3]!.toLowerCase() };
}

export interface GroupSummary { group: Group; n: number; pre: number | null; post: number | null; change: number | null }
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/**
 * Per group: average over participants of each participant's mean call score.
 * Only participants with both a pre and a post call count (paired), so n is comparable.
 */
export function summarize(rows: readonly (SessionName & { score: number })[]): GroupSummary[] {
  const groups: Group[] = ['RelAI', 'Plain', 'Unknown'];
  return groups.flatMap((group): GroupSummary[] => {
    const people = new Map<string, { pre: number[]; post: number[] }>();
    for (const row of rows) {
      if (row.group !== group || (row.phase !== 'pre' && row.phase !== 'post')) continue;
      const p = people.get(row.participant) ?? { pre: [], post: [] };
      p[row.phase].push(row.score);
      people.set(row.participant, p);
    }
    const paired = [...people.values()].filter(p => p.pre.length && p.post.length);
    if (!paired.length) return group === 'Unknown' ? [] : [{ group, n: 0, pre: null, post: null, change: null }];
    const pre = mean(paired.map(p => mean(p.pre)!))!, post = mean(paired.map(p => mean(p.post)!))!;
    return [{ group, n: paired.length, pre, post, change: post - pre }];
  });
}
