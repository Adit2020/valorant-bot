import { FAST_PLANT_SMOKE } from '../plays/fastPlant.js';
import type { Circle } from '../map/geometry.js';
import type { AgentView, MapEffect, MapState, Vec } from '../map/types.js';
import { assignRoute, createAgents, moveAgent, position } from './agents.js';
import { resolveCombat } from './combat.js';
import { DT } from './loop.js';
import { mulberry32 } from './rng.js';
import { perceive, publiclySeen } from './visibility.js';

export const ROUND_TICKS = 800;
const SMOKE_FLIGHT = 12, SMOKE_LIFE = 300, SMOKE_RADIUS = 46;
interface Smoke extends Circle { starts: number; ends: number }
export interface RoundEvent { tick: number; actor: string; subject?: string; public: boolean; effect: MapEffect }

export class Round {
  seed: number;
  tick = 0;
  smokesLeft = 3;
  private agents;
  private clouds: Smoke[] = [];
  private sight: Map<string, string[]>;
  private spike: MapState['spike'] = { state: 'carried' };

  constructor(seed = 2026) {
    this.seed = seed >>> 0;
    this.agents = createAgents(mulberry32(this.seed));
    this.sight = perceive(this.agents, []);
  }
  get time() { return this.tick * DT; }
  get finished() { return this.tick >= ROUND_TICKS; }
  reset(seed = this.seed) {
    this.seed = seed >>> 0;
    this.tick = 0;
    this.smokesLeft = 3;
    this.clouds = [];
    this.spike = { state: 'carried' };
    this.agents = createAgents(mulberry32(this.seed));
    this.sight = perceive(this.agents, []);
  }
  assignRoute(id: string, goals: Vec[]) {
    const agent = this.agents.find(a => a.id === id && a.alive);
    return !!agent && assignRoute(agent, goals);
  }
  // Only current, individually observed opponents; return detached values, never the roster.
  observations(id: string): AgentView[] {
    const seen = this.sight.get(id) ?? [];
    return this.agents.filter(a => seen.includes(a.id)).map(a => this.view(a, 1));
  }
  activeSmokes(): Circle[] {
    return this.clouds.filter(c => this.tick >= c.starts && this.tick < c.ends)
      .map(({ x, y, r }) => ({ x, y, r }));
  }

  step(): RoundEvent[] {
    if (this.finished) return [];
    this.tick++;
    const events: RoundEvent[] = [];
    const brim = this.agents.find(a => a.isBrim)!;
    // A scheduled utility cue in this single script, independent of voice and enemy knowledge.
    if (this.tick === FAST_PLANT_SMOKE.tick && brim.alive) {
      const to = FAST_PLANT_SMOKE.to;
      this.clouds.push({ x: to[0], y: to[1], r: SMOKE_RADIUS, starts: this.tick + SMOKE_FLIGHT,
        ends: this.tick + SMOKE_FLIGHT + SMOKE_LIFE });
      this.smokesLeft--;
      events.push({ tick: this.tick, actor: brim.id, public: true,
        effect: { type: 'smoke', from: position(brim), to: [...to], duration: SMOKE_LIFE * DT } });
    }
    this.clouds = this.clouds.filter(c => c.ends > this.tick);
    for (const a of this.agents) moveAgent(a, this.tick, this.agents);
    const smokes = this.activeSmokes();
    const before = perceive(this.agents, smokes);
    for (const { killer, victim } of resolveCombat(this.agents, before, this.tick)) {
      events.push({ tick: this.tick, actor: killer.id, subject: victim.id,
        public: victim.team === 'atk' || publiclySeen(before, victim.id),
        effect: { type: 'kill', at: position(victim), killer: killer.tag, victim: victim.tag, killerTeam: killer.team } });
      if (victim.hasSpike) {
        victim.hasSpike = false;
        this.spike = { state: 'dropped', x: victim.x, y: victim.y };
      }
    }
    this.sight = perceive(this.agents, smokes);
    return events;
  }

  private view(a: (typeof this.agents)[number], alpha: number): AgentView {
    const { id, tag, team, role, facing, hp, alive, isBrim, hasSpike } = a;
    return { id, tag, team, role, facing, hp, alive, isBrim, hasSpike,
      x: a.previous[0] + (a.x - a.previous[0]) * alpha, y: a.previous[1] + (a.y - a.previous[1]) * alpha };
  }
  snapshot(designer = false, alpha = 1): MapState {
    return { spike: { ...this.spike }, agents: this.agents
      .filter(a => designer || a.team === 'atk' || publiclySeen(this.sight, a.id))
      // Never interpolate a newly visible enemy back to a previously hidden location.
      .map(a => this.view(a, a.alive && (designer || a.team === 'atk') ? alpha : 1)) };
  }
}
