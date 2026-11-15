import type { PlayId } from '../../../shared/schema.js';
import { defaultPlay, plays } from '../plays/index.js';
import { PLANT_SPOTS, SMOKE_TARGETS } from '../map/bindA.js';
import { hasLOS, isOpen, type Circle } from '../map/geometry.js';
import type { RegionId } from '../map/types.js';
import { BrimController, destination, PLANT_TICKS, type BrimFrame } from './brim.js';
import type { AgentView, MapEffect, MapState, Vec } from '../map/types.js';
import { assignRoute, createAgents, moveAgent, position } from './agents.js';
import { resolveCombat } from './combat.js';
import { DT } from './loop.js';
import { mulberry32 } from './rng.js';
import { perceive, publiclySeen } from './visibility.js';

export function smokeSpot(target: RegionId) {
  const spot = target === 'truck' ? SMOKE_TARGETS.truck_triple_gap :
    Object.hasOwn(SMOKE_TARGETS, target) ? SMOKE_TARGETS[target as keyof typeof SMOKE_TARGETS] : undefined;
  return spot?.at;
}

export const BUY_MS = 15000;
export const ROUND_TICKS = 800;
const SMOKE_FLIGHT = 12, SMOKE_LIFE = 300, SMOKE_RADIUS = 46;
interface Smoke extends Circle { starts: number; ends: number }
export interface RoundEvent { tick: number; actor: string; subject?: string; public: boolean; effect: MapEffect }

export interface RoundOptions {
  /** Isolated navigation/plant drill: Brim alone, carrying the spike, empty queue. */
  practice?: boolean;
  liveDrill?: boolean;
}
export class Round {
  seed: number;
  tick = 0;
  private remaining = BUY_MS;
  private selected: PlayId | null = null;
  private plantingTicks = 0;
  get play() { return this.selected; }
  get buyRemainingMs() { return this.remaining; }
  get phase() { return !this.options.practice && !this.options.liveDrill && this.selected === null ? 'buy' : 'live'; }
  private smokes = 3;
  private mollies = 1;
  private controller = new BrimController();
  get smokesLeft() { return this.smokes; }
  get mollyLeft() { return this.mollies; }
  get brim(): Pick<BrimController, 'addGoal' | 'cancelGoal' | 'clearGoals' | 'inspect' | 'events' | 'goalStatus' | 'recovering'> { return this.controller; }
  private agents;
  private clouds: Smoke[] = [];
  private sight: Map<string, string[]>;
  private spike: MapState['spike'] = { state: 'carried' };

  constructor(seed = 2026, private readonly options: RoundOptions = {}) {
    this.seed = seed >>> 0;
    this.agents = this.setup();
    this.sight = perceive(this.agents, []);
  }
  private setup() {
    const roster = createAgents(mulberry32(this.seed));
    this.controller = new BrimController();
    if (this.options.practice) {
      const brim = roster.find(a => a.isBrim)!;
      brim.hasSpike = true;
      return [brim];
    }
    if (!this.options.liveDrill) return roster;
    this.controller.addGoal({ type: 'move', target: 'a_short' }, 'plan');
    this.controller.addGoal({ type: 'smoke', target: 'heaven' }, 'plan');
    this.controller.addGoal({ type: 'plant', target: 'default' }, 'plan');
    return roster;
  }
  selectPlay(id: PlayId): boolean {
    if (this.phase !== 'buy') return false;
    const plan = plays[id];
    const roster = createAgents(mulberry32(this.seed), plan.routes, plan.carrier);
    const controller = new BrimController(plan.routes.find(route => route.id === 'brim')!);
    for (const action of plan.goals) controller.addGoal(action, 'plan');
    this.agents = roster;
    this.controller = controller;
    this.sight = perceive(roster, []);
    this.selected = id;
    this.remaining = 0;
    return true;
  }
  // Unscaled, active wall time. The live clock starts with a fresh tick accumulator.
  advanceBuy(elapsedMs: number): boolean {
    if (this.phase !== 'buy') return false;
    this.remaining = Math.max(0, this.remaining - Math.max(0, elapsedMs));
    return this.remaining === 0 && this.selectPlay(defaultPlay);
  }
  get time() { return this.tick * DT; }
  get finished() { return this.tick >= ROUND_TICKS; }
  reset(seed = this.seed) {
    this.seed = seed >>> 0;
    this.tick = 0;
    this.remaining = BUY_MS;
    this.selected = null;
    this.plantingTicks = 0;
    this.smokes = 3; this.mollies = 1;
    this.clouds = [];
    this.spike = { state: 'carried' };
    this.agents = this.setup();
    this.sight = perceive(this.agents, []);
  }
  assignRoute(id: string, goals: Vec[]) {
    const agent = this.agents.find(a => a.id === id && a.alive);
    return !!agent && !agent.isBrim && assignRoute(agent, goals);
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

  private deploy(kind: 'smoke' | 'molly', target: RegionId, from: Vec, events: RoundEvent[]) {
    // Sky Smoke is placed overhead at a designated open landing spot; incendiaries
    // are launched from Brim and must clear every crossed geometry cell.
    const to = kind === 'smoke' ? smokeSpot(target) : destination(target);
    if (!to || !isOpen(...to)) return 'invalid ' + kind + ' target';
    if (kind === 'smoke') {
      if (!this.smokes) return 'no smoke charges';
      this.smokes--;
      this.clouds.push({ x: to[0], y: to[1], r: SMOKE_RADIUS, starts: this.tick + SMOKE_FLIGHT,
        ends: this.tick + SMOKE_FLIGHT + SMOKE_LIFE });
    } else {
      if (!this.mollies) return 'no molly charges';
      if (!hasLOS(from, to)) return 'molly trajectory blocked';
      this.mollies--;
    }
    events.push({ tick: this.tick, actor: 'brim', public: true,
      effect: { type: kind, from: kind === 'smoke' ? [...to] : from, to: [...to], duration: kind === 'smoke' ? SMOKE_LIFE * DT : 7 } });
  }

  step(): RoundEvent[] {
    if (this.finished || this.phase === 'buy') return [];
    this.tick++;
    const events: RoundEvent[] = [];
    const brim = this.agents.find(a => a.isBrim)!;
    this.clouds = this.clouds.filter(c => c.ends > this.tick);
    const smokes = this.activeSmokes();
    this.sight = perceive(this.agents, smokes);
    const frame: BrimFrame = {
      tick: this.tick, pos: position(brim), contacts: this.observations('brim'),
      carrier: this.agents.find(a => a.team === 'atk' && a.alive && a.hasSpike)?.id,
      route: goals => assignRoute(brim, goals),
      watch: at => { brim.watch = at; },
      deploy: (kind, target) => this.deploy(kind, target, position(brim), events),
      plant: progress => {
        this.spike = progress < 1 ? { state: 'planting', x: brim.x, y: brim.y, progress } :
          { state: 'planted', x: brim.x, y: brim.y, plantedAt: this.time };
        if (progress >= 1) brim.hasSpike = false;
      },
      stopPlant: () => { if (brim.hasSpike && this.spike.state === 'planting') this.spike = { state: 'carried' }; },
    };
    if (brim.alive) this.controller.step(frame);
    const busy = ['plant', 'retreat'].includes(this.controller.currentState);
    if (busy) brim.target = null;
    for (const a of this.agents) moveAgent(a, this.tick, this.agents);
    const before = perceive(this.agents, smokes);
    for (const { killer, victim } of resolveCombat(this.agents, before, this.tick, busy ? brim.id : undefined)) {
      events.push({ tick: this.tick, actor: killer.id, subject: victim.id,
        public: victim.team === 'atk' || publiclySeen(before, victim.id),
        effect: { type: 'kill', at: position(victim), killer: killer.tag, victim: victim.tag, killerTeam: killer.team } });
      if (victim.hasSpike) {
        victim.hasSpike = false;
        this.spike = { state: 'dropped', x: victim.x, y: victim.y };
      }
    }
    if (this.selected) this.plantWithCarrier();
    this.sight = perceive(this.agents, smokes);
    if (!brim.alive || this.finished) this.controller.close(frame, brim.alive ? 'round ended' : 'Brim died');
    return events;
  }

  private plantWithCarrier() {
    const carrier = this.agents.find(a => a.alive && a.hasSpike && !a.isBrim);
    if (!carrier) return;
    const [x, y] = PLANT_SPOTS.default;
    if (carrier.x !== x || carrier.y !== y || carrier.target || carrier.path.length) {
      this.plantingTicks = 0;
      if (this.spike.state === 'planting') this.spike = { state: 'carried' };
      return;
    }
    if (++this.plantingTicks === PLANT_TICKS) {
      carrier.hasSpike = false;
      this.spike = { state: 'planted', x, y, plantedAt: this.time };
    } else {
      this.spike = { state: 'planting', x, y, progress: this.plantingTicks / PLANT_TICKS };
    }
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
