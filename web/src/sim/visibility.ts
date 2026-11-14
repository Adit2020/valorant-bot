import { hasLOS, type Circle } from '../map/geometry.js';
import type { AgentView } from '../map/types.js';
import { position } from './agents.js';

export const SIGHT_RANGE = 285;
const HALF_FOV = Math.PI / 3;
export const angleError = (angle: number) => Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));

export function canSee(observer: AgentView, enemy: AgentView, smokes: Circle[]) {
  if (!observer.alive || !enemy.alive || observer.team === enemy.team) return false;
  const dx = enemy.x - observer.x, dy = enemy.y - observer.y;
  return dx*dx + dy*dy <= SIGHT_RANGE*SIGHT_RANGE
    && angleError(Math.atan2(dy, dx) - observer.facing) <= HALF_FOV
    && hasLOS(position(observer), position(enemy), smokes);
}

export function perceive(agents: AgentView[], smokes: Circle[]): Map<string, string[]> {
  return new Map(agents.map(a => [a.id, agents.filter(b => canSee(a, b, smokes)).map(b => b.id)]));
}

// Public sight is the union of Raze (the player) and Brim. Brim's own observations stay separate.
export function publiclySeen(sight: Map<string, string[]>, id: string) {
  return !!(sight.get('raze')?.includes(id) || sight.get('brim')?.includes(id));
}
