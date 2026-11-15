import { bearing, position, type Agent } from './agents.js';
import { HOLD_CONE, HOLD_REACTION_TICKS } from './rules.js';
import { angleError } from './visibility.js';

export interface Kill { killer: Agent; victim: Agent }

// Engage after 4 ticks if already aligned; each 0.1 radian of initial turn costs one
// more tick. A hit does 34 HP; hits are at least 5 ticks apart even across retargets.
export function resolveCombat(agents: Agent[], sight: Map<string, string[]>, tick: number, busyActor?: string, holdAdvantage = false): Kill[] {
  const kills: Kill[] = [];
  for (const a of agents) {
    if (!a.alive || a.id === busyActor) continue;
    const visible = sight.get(a.id)!;
    let target: Agent | undefined;
    let nearest = Infinity;
    for (const b of agents) {
      if (!b.alive || !visible.includes(b.id)) continue;
      if (b.id === a.target) { target = b; break; }
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < nearest) { nearest = d; target = b; }
    }
    if (!target) { a.target = null; continue; }
    const aim = bearing(a, position(target));
    if (a.target !== target.id) {
      a.target = target.id;
      // A stationary defender already aimed down its angle fires first (see rules.ts).
      const holding = holdAdvantage && a.team === 'def' && !a.path.length && angleError(aim - a.facing) <= HOLD_CONE;
      a.readyTick = tick + (holding ? HOLD_REACTION_TICKS : 4 + Math.ceil(angleError(aim - a.facing) * 10));
    }
    a.facing = aim;
    if (tick < Math.max(a.readyTick, a.nextShot)) continue;
    a.nextShot = tick + 5;
    target.hp = Math.max(0, target.hp - 34);
    if (!target.hp) {
      target.alive = false;
      target.target = null;
      target.path = [];
      kills.push({ killer: a, victim: target });
    }
  }
  return kills;
}
