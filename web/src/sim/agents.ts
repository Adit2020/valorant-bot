import { DEFENDER_SPOTS } from '../map/bindA.js';
import { dist, findPath, navLine } from '../map/geometry.js';
import type { AgentView, Role, Vec } from '../map/types.js';
import { FAST_PLANT } from '../plays/fastPlant.js';
import { DT } from './loop.js';

export interface Agent extends AgentView {
  previous: Vec;
  path: Vec[];
  speed: number;
  delayTicks: number;
  watch: Vec;
  target: string | null;
  readyTick: number;
  nextShot: number;
}
export const position = (a: AgentView): Vec => [a.x, a.y];
export const bearing = (a: AgentView, p: Vec) => Math.atan2(p[1] - a.y, p[0] - a.x);

// Replace a route atomically. If any destination is unreachable, hold in place.
export function assignRoute(agent: Agent, goals: Vec[]): boolean {
  agent.path = [];
  let from = position(agent);
  const path: Vec[] = [];
  for (const goal of goals) {
    const leg = findPath(from, goal);
    if (!leg.length) return false;
    path.push(...leg);
    from = goal;
  }
  agent.path = path;
  return true;
}

export function createAgents(random: () => number, routes = FAST_PLANT, carrier = 'sova'): Agent[] {
  function create(id: string, tag: string, role: Role, start: Vec, watch: Vec, team: Agent['team']): Agent {
    const [x, y] = start;
    return { id, tag, role, team, x, y, previous: [x, y], watch, facing: Math.atan2(watch[1]-y, watch[0]-x),
      alive: true, hp: 100, isBrim: id === 'brim', hasSpike: id === carrier, path: [], speed: 0,
      delayTicks: 0, target: null, readyTick: 0, nextShot: 0 };
  }
  const agents = routes.map(r => {
    const a = create(r.id, r.tag, r.role, r.start, r.watch, 'atk');
    a.speed = r.speed;
    a.delayTicks = a.isBrim ? 0 : r.delayTicks;
    a.facing = -Math.PI / 2;
    if (!a.isBrim && !assignRoute(a, r.waypoints)) throw new Error('Unreachable play route: ' + r.id);
    return a;
  });
  const candidates = ['tower', 'cubby', 'triple'] as const;
  const lineup: [string, string, Role, keyof typeof DEFENDER_SPOTS][] = [
    ['jett', 'JET', 'D', 'heaven'], ['kj', 'KJ', 'S', 'uhall'], ['chamber', 'CHA', 'S', 'back_site'],
    ['viper', 'VIP', 'C', 'truck'], ['omen', 'OMN', 'C', candidates[Math.floor(random()*candidates.length)]!],
  ];
  for (const [id, tag, role, spot] of lineup) {
    const { pos, watch } = DEFENDER_SPOTS[spot];
    agents.push(create(id, tag, role, pos, watch, 'def'));
  }
  return agents;
}

export function moveAgent(a: Agent, tick: number, roster: Agent[]) {
  a.previous = position(a);
  if (!a.alive || a.target || tick <= a.delayTicks) return;
  const goal = a.path[0];
  if (!goal) { a.facing = bearing(a, a.watch); return; }
  const distance = dist(a.previous, goal);
  const reach = distance <= a.speed * DT;
  const q = reach ? 1 : a.speed * DT / distance;
  const next: Vec = reach ? goal : [a.x + (goal[0]-a.x)*q, a.y + (goal[1]-a.y)*q];
  if (!navLine(a.previous, next)) { a.path = []; return; }
  // Queue behind a living teammate. Allow moves away from an existing close contact.
  if (roster.some(b => b !== a && b.alive && b.team === a.team &&
    dist(next, position(b)) < Math.min(18, dist(a.previous, position(b))))) return;
  if (distance > 0) a.facing = bearing(a, next);
  [a.x, a.y] = next;
  if (reach) a.path.shift();
}
